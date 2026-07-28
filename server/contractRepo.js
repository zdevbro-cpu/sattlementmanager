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
    contractNo: h.contract_no || '',
    contractType: h.contract_type || '',
    parentContractId: h.parent_contract_id || '',
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
    recipientName: h.recipient_name || '',
    recipientBankName: h.recipient_bank_name || '',
    recipientAccountNo: h.recipient_account_no || '',
    recipientAccountOwner: h.recipient_account_owner || '',
    recipientResidentNo: h.recipient_resident_no || '',
    linkedContractId: h.linked_contract_id || '',
    transferAmount: Number(h.transfer_amount || 0),
    // 소득구분 — 이력 시점의 값을 그대로 유지한다(과거 지급건 소급 변경 방지)
    incomeType: h.income_type === '근로소득' ? '근로소득' : '사업소득',
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
    isDraft: !!h.is_draft,
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
  if (contracts.length) {
    const ids = contracts.map((c) => c.id)
    // 계약 건수만큼 개별 쿼리를 날리던 N+1 패턴 대신, 이력/문서/결제내역을 각각 한 번에 배치 조회한다.
    const [{ rows: allHist }, { rows: allDocs }] = await Promise.all([
      pool.query(
        `SELECT * FROM contract_history WHERE contract_id = ANY($1) ORDER BY contract_id, id DESC`,
        [ids],
      ),
      pool.query(
        `SELECT * FROM contract_documents WHERE contract_id = ANY($1) ORDER BY contract_id, id`,
        [ids],
      ),
    ])
    const historyIds = allHist.map((h) => h.id)
    const { rows: allInst } = historyIds.length
      ? await pool.query(
          `SELECT * FROM payment_installments WHERE history_id = ANY($1) ORDER BY history_id, seq`,
          [historyIds],
        )
      : { rows: [] }

    const histByContract = new Map()
    for (const h of allHist) {
      if (!histByContract.has(h.contract_id)) histByContract.set(h.contract_id, [])
      histByContract.get(h.contract_id).push(h)
    }
    const docsByContract = new Map()
    for (const d of allDocs) {
      if (!docsByContract.has(d.contract_id)) docsByContract.set(d.contract_id, [])
      docsByContract.get(d.contract_id).push(d)
    }
    const instByHistory = new Map()
    for (const i of allInst) {
      if (!instByHistory.has(i.history_id)) instByHistory.set(i.history_id, [])
      instByHistory.get(i.history_id).push(i)
    }

    for (const c of contracts) {
      const hist = histByContract.get(c.id) || []
      if (!hist.length) continue
      const docsForContract = docsByContract.get(c.id) || []
      const latestHistoryId = hist[0]?.id
      const history = hist.map((h) => {
        const inst = instByHistory.get(h.id) || []
        const docs = docsForContract.filter(
          (d) => d.history_id === h.id || (d.history_id == null && h.id === latestHistoryId),
        )
        return mapSnapshot(h, inst, docs)
      })
      result.push({ id: c.id, contractorId: c.contractor_id || '', current: history[0], history })
    }
  }
  // 필터
  const { startDate, endDate, status, org, keyword } = filter
  return result
    .filter((c) => {
      const cur = c.current
      if (status && status !== '전체' && cur.status !== status) return false
      if (org && org !== '전체' && cur.org !== org) return false
      if (
        keyword &&
        !cur.contractorName.includes(keyword) &&
        !c.id.toLowerCase().includes(keyword.toLowerCase())
      )
        return false
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
  // 계약서 업로드(신규등록 시점)는 historyId 없이 저장된 레코드가 있을 수 있다 —
  // 특정 이력에 안 묶인(history_id NULL) 문서는 최신 스냅샷에 붙여서 화면에서 사라지지 않게 한다.
  const { rows: allDocs } = await pool.query(
    `SELECT * FROM contract_documents WHERE contract_id = $1 ORDER BY id`,
    [id],
  )
  const latestHistoryId = hist[0]?.id
  const history = []
  for (const h of hist) {
    const { rows: inst } = await pool.query(
      `SELECT * FROM payment_installments WHERE history_id = $1 ORDER BY seq`,
      [h.id],
    )
    const docs = allDocs.filter(
      (d) => d.history_id === h.id || (d.history_id == null && h.id === latestHistoryId),
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
       (contract_id,status,event_date,org,business_unit,contractor_name,contract_no,contract_type,parent_contract_id,contract_date,
        deposit,allowance,allowance_pay_day,first_allowance_pay_date,
        contract_end_date,branch,manager,recruiter,
        bank_name,account_no,account_owner,resident_no,phone,
        payment_method,payment_total,memo,is_draft,
        recipient_name,recipient_bank_name,recipient_account_no,recipient_account_owner,recipient_resident_no,
        linked_contract_id,transfer_amount,income_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)
     RETURNING id`,
    [
      contractId,
      snap.status,
      nn(snap.eventDate),
      snap.org,
      snap.businessUnit || '',
      snap.contractorName,
      snap.contractNo || '',
      snap.contractType,
      snap.parentContractId || null,
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
      !!snap.isDraft,
      snap.recipientName || '',
      snap.recipientBankName || '',
      snap.recipientAccountNo || '',
      snap.recipientAccountOwner || '',
      snap.recipientResidentNo || '',
      snap.linkedContractId || null,
      snap.transferAmount || 0,
      snap.incomeType === '근로소득' ? '근로소득' : '사업소득',
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
    // COUNT(*)+1 방식은 중간 삭제가 있으면 이미 쓰는 id와 충돌한다 — MAX+1로 다음 번호를 구한다.
    const { rows: n } = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(id FROM 2) AS INT)), 0)::int AS maxnum
         FROM contracts WHERE id ~ '^C[0-9]+$'`,
    )
    const id = `C${String(n[0].maxnum + 1).padStart(3, '0')}`
    const contractorId = `M${String(n[0].maxnum + 1).padStart(3, '0')}`
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

/**
 * 기존 이력 스냅샷 오타수정 — 새 이력행을 추가하지 않고 지정한 history 행을 그대로 고친다.
 * status/event_date(감사 이벤트 자체)는 건드리지 않고 나머지 입력값만 갱신한다.
 */
async function correctHistory(historyId, snap) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const p = snap.payment || {}
    const { rowCount } = await client.query(
      `UPDATE contract_history SET
         org=$2, business_unit=$3, contractor_name=$4, contract_no=$5, contract_type=$6, parent_contract_id=$7, contract_date=$8,
         deposit=$9, allowance=$10, allowance_pay_day=$11, first_allowance_pay_date=$12,
         contract_end_date=$13, branch=$14, manager=$15, recruiter=$16,
         bank_name=$17, account_no=$18, account_owner=$19, resident_no=$20, phone=$21,
         payment_method=$22, payment_total=$23, memo=$24, is_draft=$25,
         recipient_name=$26, recipient_bank_name=$27, recipient_account_no=$28,
         recipient_account_owner=$29, recipient_resident_no=$30,
         linked_contract_id=$31, transfer_amount=$32, income_type=$33
       WHERE id=$1`,
      [
        historyId,
        snap.org,
        snap.businessUnit || '',
        snap.contractorName,
        snap.contractNo || '',
        snap.contractType,
        snap.parentContractId || null,
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
        !!snap.isDraft,
        snap.recipientName || '',
        snap.recipientBankName || '',
        snap.recipientAccountNo || '',
        snap.recipientAccountOwner || '',
        snap.recipientResidentNo || '',
        snap.linkedContractId || null,
        snap.transferAmount || 0,
        snap.incomeType === '근로소득' ? '근로소득' : '사업소득',
      ],
    )
    if (rowCount === 0) throw new Error('이력을 찾을 수 없습니다.')

    await client.query(`DELETE FROM payment_installments WHERE history_id = $1`, [historyId])
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
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

/**
 * 양수·양도 처리 — 두 계약을 하나의 트랜잭션으로 함께 갱신한다.
 * 1) 양수인(contractId) 계약에 status='양수' 이력 추가 (linkedContractId=양도인, transferAmount)
 * 2) 양도인(transferorContractId) 계약의 최신 스냅샷을 그대로 이어받아 status='양도' 이력 자동 추가
 *    (linkedContractId=양수인, transferAmount) — 일부양도도 동일하게 상태를 '양도'로 표기한다.
 */
async function transferIn(contractId, transferorContractId, transferAmount, snap) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await insertHistory(client, contractId, {
      ...snap,
      linkedContractId: transferorContractId,
      transferAmount,
    })

    const { rows: hist } = await client.query(
      `SELECT * FROM contract_history WHERE contract_id = $1 ORDER BY id DESC LIMIT 1`,
      [transferorContractId],
    )
    if (!hist.length) throw new Error('양도인 계약을 찾을 수 없습니다.')
    const { rows: inst } = await client.query(
      `SELECT * FROM payment_installments WHERE history_id = $1 ORDER BY seq`,
      [hist[0].id],
    )
    const transferorSnap = mapSnapshot(hist[0], inst, [])
    // 양도인의 수당지급기준액(보증금)은 양도한 금액만큼 차감한 잔여 금액으로 남는다.
    const remainingDeposit = Math.max(0, transferorSnap.deposit - transferAmount)
    await insertHistory(client, transferorContractId, {
      ...transferorSnap,
      historyId: '',
      status: '양도',
      eventDate: snap.eventDate,
      deposit: remainingDeposit,
      memo: `${snap.contractorName}에게 ${
        transferAmount >= transferorSnap.deposit ? '전체' : '일부'
      } 양도 (${transferAmount.toLocaleString('ko-KR')}원)`,
      linkedContractId: contractId,
      transferAmount,
      createdAt: snap.eventDate,
    })

    await client.query('COMMIT')
    return await getContract(contractId)
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

/** 계약 1건 삭제 (이력·분할결제·문서는 FK ON DELETE CASCADE로 함께 삭제) */
async function deleteContract(id) {
  await pool.query(`DELETE FROM contracts WHERE id = $1`, [id])
}

module.exports = {
  listContracts,
  getContract,
  createContract,
  addHistory,
  transferIn,
  correctHistory,
  addDocument,
  deleteContract,
}
