// 계약 도메인 DB 레포지토리 (Cloud SQL / PostgreSQL)
const { pool } = require('./db')

/** history row → 프론트 ContractSnapshot 형태로 매핑 */
function mapSnapshot(h, installments, documents) {
  const method = h.payment_method || '카드'
  const cardInstallments = installments
    .filter((i) => i.method === '카드')
    .map((i) => ({
      seq: i.seq,
      amount: Number(i.amount || 0),
      issuer: i.issuer || '',
      cardNumber: i.card_number || '',
      approvalNo: i.approval_no || '',
      terminalNo: i.terminal_no || '',
      serialNo: i.serial_no || '',
      transactionDate: i.transaction_date ? isoDate(i.transaction_date) : '',
      driveFileId: i.drive_file_id || undefined,
      driveViewUrl: i.drive_view_url || undefined,
    }))
  const cashInstallments = installments
    .filter((i) => i.method === '현금')
    .map((i) => ({
      seq: i.seq,
      amount: Number(i.amount || 0),
      approvalNo: i.approval_no || '',
      transactionDate: i.transaction_date ? isoDate(i.transaction_date) : '',
      identifierType: i.identifier_type || '',
      identifierNo: i.identifier_no || '',
      merchantName: i.merchant_name || '',
      merchantBizNo: i.merchant_biz_no || '',
      bank: i.bank || '',
      depositor: i.depositor || '',
      driveFileId: i.drive_file_id || undefined,
      driveViewUrl: i.drive_view_url || undefined,
    }))
  return {
    historyId: String(h.id),
    status: h.status,
    eventDate: isoDate(h.event_date),
    org: h.org || '',
    businessUnit: h.business_unit || '',
    contractorName: h.contractor_name || '',
    contractType: h.contract_type || '',
    contractDate: isoDate(h.contract_date),
    deposit: Number(h.deposit || 0),
    allowance: Number(h.allowance || 0),
    allowancePayDay: Number(h.allowance_pay_day || 0),
    firstAllowancePayDate: isoDate(h.first_allowance_pay_date),
    contractEndDate: isoDate(h.contract_end_date),
    branch: h.branch || '',
    manager: h.manager || '',
    recruiter: h.recruiter || '',
    bankName: h.bank_name || '',
    accountNo: h.account_no || '',
    accountOwner: h.account_owner || '',
    residentNo: h.resident_no || '',
    phone: h.phone || '',
    payment: {
      method,
      totalAmount: Number(h.payment_total || 0),
      cardInstallments,
      cashInstallments,
    },
    documents: documents.map((d) => ({
      id: String(d.id),
      kind: d.kind,
      fileName: d.file_name,
      driveFileId: d.drive_file_id || '',
      driveViewUrl: d.drive_view_url || '#',
      uploadedAt: isoDate(d.uploaded_at),
    })),
    memo: h.memo || '',
    createdAt: isoDate(h.created_at),
  }
}

/** DATE/TIMESTAMPTZ 값 → YYYY-MM-DD (KST 기준). UTC로 바로 slice하면 자정~오전9시 사이 값이 하루 전으로 표시된다. */
function isoDate(v) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

/** 계약 목록 (필터 적용, 최신 이력 기준) */
async function listContracts(filter = {}) {
  const { rows: contracts } = await pool.query(
    `SELECT id, contractor_id FROM contracts ORDER BY created_at DESC`,
  )
  const result = []
  for (const c of contracts) {
    const full = await getContract(c.id)
    if (full) result.push(full)
  }
  // 필터
  const { startDate, endDate, status, org, keyword } = filter
  return result
    .filter((c) => {
      const cur = c.current
      if (status && status !== '전체' && cur.status !== status) return false
      if (org && org !== '전체' && cur.org !== org) return false
      if (keyword && !cur.contractorName.includes(keyword)) return false
      if (startDate && cur.contractDate && cur.contractDate < startDate)
        return false
      if (endDate && cur.contractDate && cur.contractDate > endDate)
        return false
      return true
    })
    .sort((a, b) =>
      (b.current.contractDate || '').localeCompare(a.current.contractDate || ''),
    )
}

/** 단일 계약 (current + history) */
async function getContract(id) {
  const { rows: cr } = await pool.query(
    `SELECT * FROM contracts WHERE id = $1`,
    [id],
  )
  if (!cr.length) return null
  const { rows: hist } = await pool.query(
    `SELECT * FROM contract_history WHERE contract_id = $1 ORDER BY id DESC`,
    [id],
  )
  const history = []
  for (const h of hist) {
    const { rows: inst } = await pool.query(
      `SELECT * FROM payment_installments WHERE history_id = $1 ORDER BY seq`,
      [h.id],
    )
    const { rows: docs } = await pool.query(
      `SELECT * FROM contract_documents WHERE history_id = $1 ORDER BY id`,
      [h.id],
    )
    history.push(mapSnapshot(h, inst, docs))
  }
  return {
    id: cr[0].id,
    contractorId: cr[0].contractor_id || '',
    current: history[0],
    history,
  }
}

/** history 스냅샷 + 분할 insert (트랜잭션 client 사용) */
async function insertHistory(client, contractId, snap) {
  const p = snap.payment || {}
  const { rows } = await client.query(
    `INSERT INTO contract_history
       (contract_id,status,event_date,org,business_unit,contractor_name,contract_type,contract_date,
        deposit,allowance,allowance_pay_day,first_allowance_pay_date,
        contract_end_date,branch,manager,recruiter,
        bank_name,account_no,account_owner,resident_no,phone,
        payment_method,payment_total,memo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
     RETURNING id`,
    [
      contractId,
      snap.status,
      nn(snap.eventDate),
      snap.org,
      snap.businessUnit || '',
      snap.contractorName,
      snap.contractType,
      nn(snap.contractDate),
      snap.deposit || 0,
      snap.allowance || 0,
      snap.allowancePayDay || null,
      nn(snap.firstAllowancePayDate),
      nn(snap.contractEndDate),
      snap.branch,
      snap.manager,
      snap.recruiter,
      snap.bankName || '',
      snap.accountNo || '',
      snap.accountOwner || '',
      snap.residentNo || '',
      snap.phone || '',
      p.method || '카드',
      p.totalAmount || 0,
      snap.memo || '',
    ],
  )
  const historyId = rows[0].id
  const cards = p.cardInstallments || []
  const cash = p.cashInstallments || []
  for (const c of cards) {
    await client.query(
      `INSERT INTO payment_installments
        (history_id,method,seq,amount,issuer,card_number,approval_no,terminal_no,serial_no,transaction_date,drive_file_id,drive_view_url)
       VALUES ($1,'카드',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        historyId,
        c.seq,
        c.amount || 0,
        c.issuer,
        c.cardNumber,
        c.approvalNo,
        c.terminalNo,
        c.serialNo,
        nn(c.transactionDate),
        c.driveFileId || null,
        c.driveViewUrl || null,
      ],
    )
  }
  for (const c of cash) {
    await client.query(
      `INSERT INTO payment_installments
        (history_id,method,seq,amount,approval_no,transaction_date,identifier_type,identifier_no,merchant_name,merchant_biz_no,bank,depositor,drive_file_id,drive_view_url)
       VALUES ($1,'현금',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        historyId,
        c.seq,
        c.amount || 0,
        c.approvalNo,
        nn(c.transactionDate),
        c.identifierType,
        c.identifierNo,
        c.merchantName,
        c.merchantBizNo,
        c.bank,
        c.depositor,
        c.driveFileId || null,
        c.driveViewUrl || null,
      ],
    )
  }
  return historyId
}

function nn(v) {
  return v === '' || v === undefined ? null : v
}

/** 신규 계약 생성 */
async function createContract(snap) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: n } = await client.query(
      `SELECT COUNT(*)::int AS c FROM contracts`,
    )
    const id = `C${String(n[0].c + 1).padStart(3, '0')}`
    const contractorId = `M${String(n[0].c + 1).padStart(3, '0')}`
    await client.query(
      `INSERT INTO contracts (id, contractor_id) VALUES ($1,$2)`,
      [id, contractorId],
    )
    await insertHistory(client, id, snap)
    await client.query('COMMIT')
    return await getContract(id)
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

/** 기존 계약에 이력 추가 */
async function addHistory(id, snap) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await insertHistory(client, id, snap)
    await client.query('COMMIT')
    return await getContract(id)
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

/** 문서(계약서/전표/입금증) Drive 링크 저장 */
async function addDocument(contractId, doc) {
  const { rows } = await pool.query(
    `INSERT INTO contract_documents
       (contract_id, history_id, kind, file_name, drive_file_id, drive_view_url, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [
      contractId,
      doc.historyId || null,
      doc.kind || '계약서',
      doc.fileName,
      doc.driveFileId,
      doc.driveViewUrl,
      doc.reason || '',
    ],
  )
  return rows[0].id
}

module.exports = {
  listContracts,
  getContract,
  createContract,
  addHistory,
  addDocument,
}
