// 매출관리 도메인 DB 레포지토리 (Cloud SQL / PostgreSQL)
const { pool } = require('./db')

/** DATE/TIMESTAMPTZ 값 → YYYY-MM-DD (KST 기준). UTC로 바로 slice하면 자정~오전9시 사이 값이 하루 전으로 표시된다. */
function isoDate(v) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

function mapSale(s, installments, documents) {
  const cardInstallments = (installments || [])
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
  const cashInstallments = (installments || [])
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
    id: s.id,
    date: isoDate(s.date),
    category: s.category || '',
    org: s.org || '',
    businessUnit: s.business_unit || '',
    buyer: s.buyer || '',
    manager: s.manager || '',
    inputterOrg: s.inputter_org || '',
    inputterName: s.inputter_name || '',
    payment: {
      method: s.payment_method || '없음',
      totalAmount: Number(s.payment_total || 0),
      cardInstallments,
      cashInstallments,
    },
    documents: (documents || []).map((d) => ({
      id: String(d.id),
      kind: d.kind,
      fileName: d.file_name,
      driveFileId: d.drive_file_id || '',
      driveViewUrl: d.drive_view_url || '#',
      uploadedAt: isoDate(d.uploaded_at),
    })),
    verified: !!s.verified,
    memo: s.memo || '',
    createdAt: isoDate(s.created_at),
    source: s.source || 'sale',
    contractId: s.contract_id || undefined,
  }
}

function nn(v) {
  return v === '' || v === undefined ? null : v
}

/** 결재정보로부터 결재구분 라벨 산출 */
function deriveMethod(p) {
  const card = (p.cardInstallments || []).some((i) => (i.amount || 0) > 0)
  const cash = (p.cashInstallments || []).some((i) => (i.amount || 0) > 0)
  if (card && cash) return '혼합'
  if (card) return '카드'
  if (cash) return '현금'
  return '없음'
}

/** 매출 목록 (필터 적용) */
async function listSales(filter = {}) {
  const { rows: sales } = await pool.query(
    `SELECT * FROM sales ORDER BY created_at DESC`,
  )
  const result = []
  for (const s of sales) {
    const { rows: inst } = await pool.query(
      `SELECT * FROM sales_installments WHERE sale_id = $1 ORDER BY seq`,
      [s.id],
    )
    const { rows: docs } = await pool.query(
      `SELECT * FROM sales_documents WHERE sale_id = $1 ORDER BY id`,
      [s.id],
    )
    result.push(mapSale(s, inst, docs))
  }
  const { startDate, endDate, category, businessUnit, buyer, inputterOrg, inputterName } = filter
  return result.filter((s) => {
    if (startDate && s.date && s.date < startDate) return false
    if (endDate && s.date && s.date > endDate) return false
    if (category && category !== '전체' && s.category !== category) return false
    if (businessUnit && !s.businessUnit.includes(businessUnit)) return false
    if (buyer && !s.buyer.includes(buyer)) return false
    if (inputterOrg && !s.inputterOrg.includes(inputterOrg)) return false
    if (inputterName && !s.inputterName.includes(inputterName)) return false
    return true
  })
}

async function getSale(id) {
  const { rows: sr } = await pool.query(`SELECT * FROM sales WHERE id = $1`, [id])
  if (!sr.length) return null
  const { rows: inst } = await pool.query(
    `SELECT * FROM sales_installments WHERE sale_id = $1 ORDER BY seq`,
    [id],
  )
  const { rows: docs } = await pool.query(
    `SELECT * FROM sales_documents WHERE sale_id = $1 ORDER BY id`,
    [id],
  )
  return mapSale(sr[0], inst, docs)
}

/** 신규 매출 등록 */
async function createSale(s) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: n } = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(id FROM 2) AS INT)), 0)::int AS maxnum FROM sales WHERE id ~ '^S[0-9]+$'`,
    )
    const id = `S${String(n[0].maxnum + 1).padStart(4, '0')}`
    const p = s.payment || {}
    await client.query(
      `INSERT INTO sales
         (id, date, category, org, business_unit, buyer, manager, inputter_org, inputter_name,
          payment_method, payment_total, verified, memo, source, contract_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        id,
        nn(s.date),
        s.category || '',
        s.org || '',
        s.businessUnit || '',
        s.buyer || '',
        s.manager || '',
        s.inputterOrg || '',
        s.inputterName || '',
        p.method || deriveMethod(p),
        p.totalAmount || 0,
        s.verified || false,
        s.memo || '',
        s.source || 'sale',
        s.contractId || null,
        nn(s.createdAt) || new Date(),
      ],
    )
    const cards = p.cardInstallments || []
    const cash = p.cashInstallments || []
    for (const c of cards) {
      await client.query(
        `INSERT INTO sales_installments
          (sale_id,method,seq,amount,issuer,card_number,approval_no,terminal_no,serial_no,transaction_date,drive_file_id,drive_view_url)
         VALUES ($1,'카드',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id,
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
        `INSERT INTO sales_installments
          (sale_id,method,seq,amount,approval_no,transaction_date,identifier_type,identifier_no,merchant_name,merchant_biz_no,bank,depositor,drive_file_id,drive_view_url)
         VALUES ($1,'현금',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          id,
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
    return await getSale(id)
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

/** 기존 매출 수정 (매출정보 + 결재/입금 회차 전체 교체) */
async function updateSale(id, s) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const p = s.payment || {}
    const { rowCount } = await client.query(
      `UPDATE sales SET
         date=$2, category=$3, org=$4, business_unit=$5, buyer=$6, manager=$7,
         inputter_org=$8, inputter_name=$9, payment_method=$10, payment_total=$11,
         verified=$12, memo=$13
       WHERE id=$1`,
      [
        id,
        nn(s.date),
        s.category || '',
        s.org || '',
        s.businessUnit || '',
        s.buyer || '',
        s.manager || '',
        s.inputterOrg || '',
        s.inputterName || '',
        p.method || deriveMethod(p),
        p.totalAmount || 0,
        s.verified || false,
        s.memo || '',
      ],
    )
    if (rowCount === 0) throw new Error('매출을 찾을 수 없습니다.')

    await client.query(`DELETE FROM sales_installments WHERE sale_id = $1`, [id])
    const cards = p.cardInstallments || []
    const cash = p.cashInstallments || []
    for (const c of cards) {
      await client.query(
        `INSERT INTO sales_installments
          (sale_id,method,seq,amount,issuer,card_number,approval_no,terminal_no,serial_no,transaction_date,drive_file_id,drive_view_url)
         VALUES ($1,'카드',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id,
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
        `INSERT INTO sales_installments
          (sale_id,method,seq,amount,approval_no,transaction_date,identifier_type,identifier_no,merchant_name,merchant_biz_no,bank,depositor,drive_file_id,drive_view_url)
         VALUES ($1,'현금',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          id,
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
    return await getSale(id)
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

async function deleteSale(id) {
  await pool.query(`DELETE FROM sales WHERE id = $1`, [id])
}

async function addSaleDocument(id, doc) {
  const { rows } = await pool.query(
    `INSERT INTO sales_documents (sale_id, kind, file_name, drive_file_id, drive_view_url)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [id, doc.kind || '전표', doc.fileName, doc.driveFileId, doc.driveViewUrl],
  )
  return rows[0].id
}

module.exports = {
  listSales,
  getSale,
  createSale,
  updateSale,
  deleteSale,
  addSaleDocument,
}
