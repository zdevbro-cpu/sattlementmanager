// 지급관리 · 추가지급 대상자 DB 레포지토리 (Cloud SQL / PostgreSQL)
const { pool } = require('./db')

function mapExtraPayout(e) {
  return {
    id: e.id,
    source: e.source,
    name: e.name,
    memo: e.memo || '',
    amount: Number(e.amount || 0),
    residentNo: e.resident_no || '',
    bankName: e.bank_name || '',
    accountNo: e.account_no || '',
    accountOwner: e.account_owner || '',
  }
}

async function listExtraPayouts() {
  const { rows } = await pool.query(
    `SELECT * FROM extra_payouts ORDER BY created_at DESC`,
  )
  return rows.map(mapExtraPayout)
}

async function createExtraPayout(p) {
  const { rows: n } = await pool.query(`SELECT COUNT(*)::int AS c FROM extra_payouts`)
  const id = `EX${String(n[0].c + 1).padStart(4, '0')}`
  await pool.query(
    `INSERT INTO extra_payouts (id, source, name, memo, amount, resident_no, bank_name, account_no, account_owner)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      p.source,
      p.name,
      p.memo || '',
      p.amount || 0,
      p.residentNo || '',
      p.bankName || '',
      p.accountNo || '',
      p.accountOwner || '',
    ],
  )
  return { id, ...p }
}

async function deleteExtraPayout(id) {
  await pool.query(`DELETE FROM extra_payouts WHERE id = $1`, [id])
}

module.exports = { listExtraPayouts, createExtraPayout, deleteExtraPayout }
