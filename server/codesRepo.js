// 시스템관리 공통코드(소속/계약구분/상태/사업부/임용상태) — 로그인 없는 공개 페이지에서도 읽어야 해서 DB에 둔다
const { pool } = require('./db')

const KINDS = ['orgs', 'contractTypes', 'statuses', 'businessUnits', 'appointmentStatuses']

const DEFAULTS = {
  orgs: ['A', 'B'],
  contractTypes: ['LAS매장점주', '직원', 'LAS-On파트장', 'LAS-On파트너'],
  statuses: ['신규', '증액', '양수', '양도', '해지', '폐기'],
  businessUnits: ['교육선교위원회', '교육사업부', 'LAS-On', '구독'],
  appointmentStatuses: ['정상', '휴직', '해지'],
}

/** 최초 조회 시 테이블이 비어있으면 기본값으로 채운다(1회성 시드) */
async function seedIfEmpty() {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM system_codes`)
  if (rows[0].n > 0) return
  for (const kind of KINDS) {
    for (let i = 0; i < DEFAULTS[kind].length; i++) {
      await pool.query(
        `INSERT INTO system_codes (kind, value, sort_order) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [kind, DEFAULTS[kind][i], i],
      )
    }
  }
}

/** 전체 코드셋 조회 — 관리자가 지정한 순서(sort_order) 유지 */
async function listCodes() {
  await seedIfEmpty()
  const { rows } = await pool.query(`SELECT kind, value FROM system_codes ORDER BY sort_order ASC, id ASC`)
  const result = { orgs: [], contractTypes: [], statuses: [], businessUnits: [], appointmentStatuses: [] }
  for (const r of rows) {
    if (result[r.kind]) result[r.kind].push(r.value)
  }
  return result
}

async function addCode(kind, value) {
  const v = (value || '').trim()
  if (!KINDS.includes(kind) || !v) return listCodes()
  const { rows } = await pool.query(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM system_codes WHERE kind = $1`,
    [kind],
  )
  await pool.query(
    `INSERT INTO system_codes (kind, value, sort_order) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
    [kind, v, rows[0].next],
  )
  return listCodes()
}

async function removeCode(kind, value) {
  await pool.query(`DELETE FROM system_codes WHERE kind = $1 AND value = $2`, [kind, value])
  return listCodes()
}

/** 항목을 한 칸 위/아래로 이동 — 같은 kind 안에서 인접 항목과 sort_order를 맞바꾼다 */
async function reorderCode(kind, value, direction) {
  const { rows } = await pool.query(
    `SELECT id, value, sort_order FROM system_codes WHERE kind = $1 ORDER BY sort_order ASC, id ASC`,
    [kind],
  )
  const idx = rows.findIndex((r) => r.value === value)
  if (idx < 0) return listCodes()
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= rows.length) return listCodes()

  const a = rows[idx]
  const b = rows[swapIdx]
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`UPDATE system_codes SET sort_order = $2 WHERE id = $1`, [a.id, b.sort_order])
    await client.query(`UPDATE system_codes SET sort_order = $2 WHERE id = $1`, [b.id, a.sort_order])
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
  return listCodes()
}

module.exports = { listCodes, addCode, removeCode, reorderCode }
