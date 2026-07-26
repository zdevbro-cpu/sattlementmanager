// 시스템관리 공통코드(소속/계약구분/상태/사업부/임용상태) — 로그인 없는 공개 페이지에서도 읽어야 해서 DB에 둔다
const { pool } = require('./db')

const KINDS = ['orgs', 'contractTypes', 'statuses', 'businessUnits', 'appointmentStatuses', 'carriers', 'subscriptionProducts']

const DEFAULTS = {
  orgs: ['A', 'B'],
  contractTypes: ['LAS매장점주', '직원', 'LAS-On파트장', 'LAS-On파트너'],
  statuses: ['신규', '증액', '양수', '양도', '해지', '폐기'],
  businessUnits: ['교육선교위원회', '교육사업부', 'LAS-On', '구독'],
  appointmentStatuses: ['정상', '휴직', '해지'],
  // 택배사 — 배송 상세에서 선택한다. 값이 배송조회 링크 매핑 키라서 표기를 임의로 바꾸면 링크가 끊긴다
  // (web/src/features/delivery/trackingUrl.ts 의 키와 일치해야 한다).
  carriers: ['CJ대한통운', '롯데택배', '한진택배', '우체국택배', '로젠택배'],
  // 구독·관리회원 상품 — 신청 시 고른 상품이 1년(2주 간격 26회) 동안 동일하게 발송된다
  subscriptionProducts: [
    'K2', 'K3', 'K4', 'K5', 'K6', 'K7',
    'S2', 'S3', 'S4', 'S5', 'S6', 'S7',
  ],
}

/**
 * 종류별로 비어 있으면 기본값을 채운다.
 * 테이블 전체가 비었을 때만 시드하면, 이미 운영 중인 상태에서 종류를 새로 추가해도
 * 영영 채워지지 않는다(실제로 '택배사'를 추가하며 겪음). 종류 단위로 판정해야 한다.
 * 관리자가 항목을 전부 지운 종류는 다음 조회 때 기본값이 되살아난다 — 의도된 동작이다.
 */
async function seedIfEmpty() {
  const { rows } = await pool.query(
    `SELECT kind, COUNT(*)::int AS n FROM system_codes GROUP BY kind`,
  )
  const counts = Object.fromEntries(rows.map((r) => [r.kind, r.n]))
  for (const kind of KINDS) {
    if (counts[kind] > 0) continue
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
  const result = { orgs: [], contractTypes: [], statuses: [], businessUnits: [], appointmentStatuses: [], carriers: [], subscriptionProducts: [] }
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
