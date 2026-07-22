// 파트너 계정(현장 파트장/파트너) 레포지토리 — 가입요청(본인 제출) → 관리자 승인 → Firebase Auth 계정 생성
const { pool } = require('./db')
const { auth } = require('./services/firebaseAdmin')

function isoDate(v) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

function mapStaff(s) {
  return {
    id: s.id,
    name: s.name,
    phone: s.phone || '',
    email: s.email,
    role: s.role,
    part: s.part || '',
    status: s.status,
    createdAt: isoDate(s.created_at),
  }
}

function mapRequest(r) {
  return {
    id: String(r.id),
    name: r.name,
    phone: r.phone || '',
    email: r.email,
    role: r.role,
    part: r.part || '',
    status: r.status,
    createdAt: isoDate(r.created_at),
    reviewedAt: isoDate(r.reviewed_at),
  }
}

async function listStaff() {
  const { rows } = await pool.query(`SELECT * FROM staff_accounts ORDER BY created_at DESC`)
  return rows.map(mapStaff)
}

/** 가입 요청 목록 (대기중이 기본, all=true면 전체) */
async function listRequests(all = false) {
  const { rows } = await pool.query(
    all
      ? `SELECT * FROM staff_requests ORDER BY created_at DESC`
      : `SELECT * FROM staff_requests WHERE status = 'pending' ORDER BY created_at DESC`,
  )
  return rows.map(mapRequest)
}

/** 본인 가입 요청 제출 (로그인 없이 접근 가능) */
async function createRequest({ name, phone, email, role, part }) {
  const { rows } = await pool.query(
    `INSERT INTO staff_requests (name, phone, email, role, part) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [name, phone || '', email, role || 'field_partner', part || ''],
  )
  return mapRequest(rows[0])
}

/**
 * 가입 승인 — Firebase Auth 계정을 생성하고(비밀번호는 관리자가 모름) 비밀번호 설정 링크를 반환한다.
 * 실제 이메일 발송은 index.js에서 mailer로 처리한다(레포지토리는 DB/Auth 계정 생성만 담당).
 */
async function approveRequest(id) {
  const { rows: rr } = await pool.query(`SELECT * FROM staff_requests WHERE id = $1`, [id])
  if (!rr.length) return null
  const req = rr[0]
  if (req.status !== 'pending') throw new Error('이미 처리된 요청입니다.')

  const userRecord = await auth.createUser({ email: req.email, displayName: req.name })
  try {
    await pool.query(
      `INSERT INTO staff_accounts (id, name, phone, email, role, part) VALUES ($1,$2,$3,$4,$5,$6)`,
      [userRecord.uid, req.name, req.phone, req.email, req.role, req.part],
    )
  } catch (e) {
    await auth.deleteUser(userRecord.uid).catch(() => {})
    throw e
  }
  await pool.query(
    `UPDATE staff_requests SET status = 'approved', reviewed_at = now() WHERE id = $1`,
    [id],
  )
  const resetLink = await auth.generatePasswordResetLink(req.email)
  const { rows: acc } = await pool.query(`SELECT * FROM staff_accounts WHERE id = $1`, [userRecord.uid])
  return { staff: mapStaff(acc[0]), resetLink }
}

async function rejectRequest(id) {
  const { rows } = await pool.query(
    `UPDATE staff_requests SET status = 'rejected', reviewed_at = now() WHERE id = $1 AND status = 'pending' RETURNING *`,
    [id],
  )
  if (!rows.length) return null
  return mapRequest(rows[0])
}

/** 활성/비활성 전환 — 비활성화 시 Firebase Auth 로그인 자체를 즉시 차단한다 */
async function setStaffStatus(id, status) {
  await auth.updateUser(id, { disabled: status === 'inactive' })
  const { rows } = await pool.query(
    `UPDATE staff_accounts SET status = $2 WHERE id = $1 RETURNING *`,
    [id, status],
  )
  if (!rows.length) return null
  return mapStaff(rows[0])
}

/** 계정 삭제 — Firebase Auth 계정과 프로필을 함께 제거 */
async function deleteStaff(id) {
  await auth.deleteUser(id).catch(() => {})
  await pool.query(`DELETE FROM staff_accounts WHERE id = $1`, [id])
}

module.exports = {
  listStaff,
  listRequests,
  createRequest,
  approveRequest,
  rejectRequest,
  setStaffStatus,
  deleteStaff,
}
