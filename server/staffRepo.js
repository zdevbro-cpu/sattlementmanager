// 파트너 계정(현장 파트장/파트너) 레포지토리 — 가입요청(본인 제출) → 관리자 승인 → Firebase Auth 계정 생성
const { pool } = require('./db')
const { auth } = require('./services/firebaseAdmin')

// 조직 축 — 축 내부에서는 배타(파트장이면서 파트너일 수 없다)이고, 축이 다르면 겸직할 수 있다.
// 섭외 조직(LAS-On)과 매장 운영은 별도로 운영되므로 서로의 전제가 아니다.
const FIELD_AXIS_ROLES = ['part_leader', 'field_partner']
const STORE_AXIS_ROLES = ['store_owner', 'store_manager']

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
    // 다중 역할 — 이관 전 행은 roles 가 비어 있을 수 있어 단일 role 로 대체한다
    roles: Array.isArray(s.roles) && s.roles.length ? s.roles : [s.role],
    part: s.part || '',
    businessUnit: s.business_unit || '',
    branch: s.branch || '',
    lasCode: s.las_code || '',
    status: s.status,
    canRegisterStore: !!s.can_register_store,
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
    businessUnit: r.business_unit || '',
    branch: r.branch || '',
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

/** 본인 가입 요청 제출 (로그인 없이 접근 가능)
 *  섭외 조직(파트너/파트장)과 매장 운영(점주/점장)은 폼이 나뉘며, 어느 축인지는 role 로 구분된다.
 *  사업부·지점은 점주/점장 요청에서만 채워진다. */
async function createRequest({ name, phone, email, role, part, businessUnit, branch }) {
  const { rows } = await pool.query(
    `INSERT INTO staff_requests (name, phone, email, role, part, business_unit, branch)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [name, phone || '', email, role || 'field_partner', part || '', businessUnit || '', branch || ''],
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

  // 동일인 판정 — 이미 같은 이메일의 계정이 있으면 새 계정을 만들지 않고 역할만 추가한다.
  // 섭외 조직과 매장 운영은 별도 운영이라, 한 사람이 양쪽 요청을 각각 낼 수 있다.
  // 계정을 쪼개면 선점이력·매장등록권한·배송 조회범위가 두 계정에 흩어진다.
  const { rows: exist } = await pool.query(`SELECT * FROM staff_accounts WHERE email = $1`, [req.email])
  if (exist.length) {
    const cur = exist[0]
    const prev = Array.isArray(cur.roles) && cur.roles.length ? cur.roles : [cur.role]
    const axis = FIELD_AXIS_ROLES.includes(req.role) ? FIELD_AXIS_ROLES : STORE_AXIS_ROLES
    // 같은 축의 기존 역할만 교체하고 다른 축은 보존한다
    const nextRoles = [...new Set([...prev.filter((r) => !axis.includes(r)), req.role])]
    const { rows: upd } = await pool.query(
      `UPDATE staff_accounts
          SET roles = $2,
              part          = COALESCE(NULLIF($3,''), part),
              business_unit = COALESCE(NULLIF($4,''), business_unit),
              branch        = COALESCE(NULLIF($5,''), branch)
        WHERE id = $1 RETURNING *`,
      [cur.id, nextRoles, req.part || '', req.business_unit || '', req.branch || ''],
    )
    await pool.query(
      `UPDATE staff_requests SET status = 'approved', reviewed_at = now() WHERE id = $1`,
      [id],
    )
    // 기존 계정이므로 비밀번호를 새로 설정할 필요가 없다 — 링크를 만들지 않는다
    return { staff: mapStaff(upd[0]), resetLink: '', merged: true }
  }

  const userRecord = await auth.createUser({ email: req.email, displayName: req.name })
  try {
    await pool.query(
      `INSERT INTO staff_accounts (id, name, phone, email, role, roles, part, business_unit, branch)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        userRecord.uid,
        req.name,
        req.phone,
        req.email,
        req.role,
        [req.role],
        req.part,
        req.business_unit || '',
        req.branch || '',
      ],
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

/** 등록정보 수정 — 이름/전화번호/사업부/역할/소속 파트
 *  role 변경 시 roles 의 '섭외축'만 교체하고 다른 축(store_owner 등)은 보존한다.
 *  매장 등록 권한(can_register_store)은 더 이상 화면에서 개별 부여하지 않는다(승인된 섭외조직 전원 등록 가능) —
 *  기존 값은 그대로 둔다. */
async function updateStaff(id, { name, phone, businessUnit, role, part, branch }) {
  const { rows: cur } = await pool.query(`SELECT roles, role FROM staff_accounts WHERE id = $1`, [id])
  if (!cur.length) return null
  const prev = Array.isArray(cur[0].roles) && cur[0].roles.length ? cur[0].roles : [cur[0].role]
  // role 이 속한 축만 교체한다 → 다른 축(섭외조직↔매장운영)의 겸직 역할은 그대로 유지
  const axis = FIELD_AXIS_ROLES.includes(role) ? FIELD_AXIS_ROLES : STORE_AXIS_ROLES
  const nextRoles = [...new Set([...prev.filter((r) => !axis.includes(r)), role])]

  const { rows } = await pool.query(
    `UPDATE staff_accounts SET name = $2, phone = $3, business_unit = $4, role = $5, roles = $6, part = $7, branch = $8
       WHERE id = $1 RETURNING *`,
    [id, name, phone || '', businessUnit || '', role, nextRoles, part || '', branch || ''],
  )
  if (!rows.length) return null
  if (name) await auth.updateUser(id, { displayName: name }).catch(() => {})
  return mapStaff(rows[0])
}

/**
 * 비밀번호 초기화 — 관리자는 새 비밀번호를 모르고, 본인 이메일로 재설정 링크만 발송한다.
 * 실제 이메일 발송은 index.js에서 mailer로 처리한다(레포지토리는 링크 생성만 담당).
 */
async function resetStaffPassword(id) {
  const { rows } = await pool.query(`SELECT * FROM staff_accounts WHERE id = $1`, [id])
  if (!rows.length) return null
  const staff = mapStaff(rows[0])
  const resetLink = await auth.generatePasswordResetLink(staff.email)
  return { staff, resetLink }
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
  updateStaff,
  resetStaffPassword,
  deleteStaff,
}
