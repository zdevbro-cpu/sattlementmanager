// 인증·인가 미들웨어 — Firebase ID 토큰 검증 + staff_accounts 역할 기반 접근 제어
//
// 【단계적 적용】운영 중인 시스템에 인증을 켜는 것이므로, 토큰을 붙이지 않는 구버전
// 프론트가 배포되어 있으면 전 기능이 즉시 중단된다. 이를 막기 위해 AUTH_ENFORCE 로
// 강제 여부를 분리한다.
//   AUTH_ENFORCE=false (기본) → 토큰이 없거나 틀려도 통과시키되 경고 로그만 남긴다(관찰 모드)
//   AUTH_ENFORCE=true         → 토큰 없으면 401, 권한 부족하면 403
// 배포 순서: ①프론트(토큰 첨부) 배포 → ②서버 배포(false) → ③로그로 토큰 도달 확인
//            → ④Cloud Run 환경변수만 true 로 변경(재배포 불필요, 문제 시 즉시 되돌림)
const { auth } = require('../services/firebaseAdmin')
const { pool } = require('../db')

const enforce = () => process.env.AUTH_ENFORCE === 'true'

/** 인증 없이 접근 가능한 경로 (정확히 일치하는 메서드+경로만 허용) */
const PUBLIC_ROUTES = [
  { method: 'GET', path: '/api/health' },
  { method: 'POST', path: '/api/staff-requests' }, // 파트너 본인 가입요청(공개 페이지 /staff-request)
  { method: 'GET', path: '/api/codes' }, // 가입요청 공개 페이지의 사업부 선택창 — 로그인 전에도 읽어야 한다
  // 점주 온보딩 — 아직 계정이 없는 사람이 쓰는 경로라 로그인 전에 열려 있어야 한다.
  // 무차별 대입은 라우트 안에서 IP·고유번호 단위 rate limit 으로 막는다.
  { method: 'POST', path: '/api/owner/verify' },
]

/** /api/cron/* 와 /api/admin/migrate 는 기존 CRON_SECRET 헤더로 보호된다(사용자 토큰 아님) */
function isSecretProtected(req) {
  return req.path.startsWith('/api/cron/') || req.path === '/api/admin/migrate'
}

function isPublic(req) {
  return PUBLIC_ROUTES.some((r) => r.method === req.method && r.path === req.path)
}

/**
 * staff_accounts 조회로 역할을 확정한다.
 * staff_accounts 에 없는 Firebase 계정은 기존 동작(관리자)을 그대로 유지한다.
 *   — App.tsx 가 지금까지 "staff_accounts 에 없으면 전체 접근"으로 동작해 왔으므로,
 *     여기서 정책을 바꾸면 기존 관리자가 잠긴다. 동작 보존이 우선이다.
 */
async function resolveRoles(email) {
  const { rows } = await pool.query(
    `SELECT name, roles, role, status, part, branch, las_code, can_register_store
       FROM staff_accounts WHERE email = $1`,
    [email],
  )
  if (!rows.length) {
    return { roles: ['admin'], status: 'active', isStaff: false, name: '' }
  }
  const s = rows[0]
  // roles 이관 전 행 대비 — 비어 있으면 단일 role 로 대체
  const roles = Array.isArray(s.roles) && s.roles.length ? s.roles : [s.role]
  return {
    roles,
    status: s.status,
    isStaff: true,
    name: s.name || '',
    part: s.part || '',
    branch: s.branch || '',
    lasCode: s.las_code || '',
    canRegisterStore: !!s.can_register_store,
  }
}

/** 모든 /api/* 앞단에 장착 — 토큰 검증 후 req.user 를 채운다 */
async function authenticate(req, res, next) {
  if (!req.path.startsWith('/api/')) return next()
  if (isPublic(req) || isSecretProtected(req)) return next()

  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''

  if (!token) {
    if (!enforce()) {
      console.warn(`[auth] 토큰 없음(관찰 모드 통과) ${req.method} ${req.path}`)
      return next()
    }
    return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' })
  }

  try {
    const decoded = await auth.verifyIdToken(token)
    const info = await resolveRoles(decoded.email)

    if (info.status === 'inactive') {
      return res.status(403).json({ ok: false, error: '비활성화된 계정입니다.' })
    }

    req.user = { uid: decoded.uid, email: decoded.email, ...info }
    next()
  } catch (e) {
    if (!enforce()) {
      console.warn(`[auth] 토큰 검증 실패(관찰 모드 통과) ${req.method} ${req.path}: ${e.message}`)
      return next()
    }
    res.status(401).json({ ok: false, error: '인증에 실패했습니다. 다시 로그인해 주세요.' })
  }
}

/**
 * 역할 인가 — 지정 역할 중 하나라도 보유하면 통과(합집합).
 * 관찰 모드에서는 차단하지 않고 로그만 남긴다.
 */
function requireRole(...allowed) {
  return (req, res, next) => {
    const roles = req.user?.roles || []
    const ok = roles.some((r) => allowed.includes(r))
    if (ok) return next()

    if (!enforce()) {
      console.warn(
        `[authz] 권한 없음(관찰 모드 통과) ${req.method} ${req.path} ` +
          `user=${req.user?.email || '(없음)'} roles=[${roles}] 필요=[${allowed}]`,
      )
      return next()
    }
    res.status(403).json({ ok: false, error: '접근 권한이 없습니다.' })
  }
}

/** 관리자 전용 */
const requireAdmin = requireRole('admin')

/* ══════════════════════════════════════════════════════════
 * 경로별 접근 정책 — 설계문서 §5.4 권한표와 1:1 대응한다.
 * 라우트 60개를 개별 수정하지 않고 정책을 한 곳에 모아, 신규 라우트가 추가돼도
 * 기본이 "관리자 전용"이 되도록 한다(누락 시 열리는 게 아니라 닫히는 방향).
 * ══════════════════════════════════════════════════════════ */

const ANY = '*' // 로그인한 사용자면 누구나(역할 무관)
const FIELD = ['admin', 'part_leader', 'field_partner'] // 섭외 조직 — 매장섭외관리
const STORE = ['admin', 'store_manager', 'store_owner'] // 매장 운영 — 교재 판매·배송

const POLICY = [
  // 본인 정보 — 모든 로그인 사용자
  { prefix: '/api/me', roles: ANY },
  // 본인 신청·배송 조회 — 범위(본인/지점)는 라우트 안에서 req.user 로 강제한다
  { prefix: '/api/my-applications', roles: STORE },
  // 교재구매 신청 — 책 판매는 매장 운영 조직(점주·점장)의 업무다.
  // 섭외 조직(파트너·파트장)은 교재 판매와 무관하므로 접근시키지 않는다.
  { prefix: '/api/textbook-applications', roles: STORE },
  // 첨부·OCR·임시파일 — 신청/매출 등록 과정에서 공용
  { prefix: '/api/ocr', roles: ANY },
  { prefix: '/api/drive/upload', roles: ANY },
  { prefix: '/api/local-files', roles: ANY },
  // 매장섭외관리 — 관리자 + 섭외 조직(점주는 제외)
  { prefix: '/api/stores', roles: FIELD },
  // 선점 파트 선택용 파트장 이름 목록(계약 원장이 아니라 이름만 반환)
  { prefix: '/api/part-leaders', roles: FIELD },
  // 공통코드(소속/계약구분/상태/사업부/임용상태) — 로그인한 사용자는 누구나 읽어야 각자 화면의
  // 드롭다운(매장등록 사업부 선택 등)이 채워진다. 로그인 전 조회는 PUBLIC_ROUTES에서 별도 허용한다.
  { prefix: '/api/codes', roles: ANY },
  // 나머지(계약·매출·임용·지급·시스템설정·계정관리)는 아래 기본값(관리자 전용)
]

/** 경로에 해당하는 정책 조회 — 일치하는 게 없으면 관리자 전용 */
function policyFor(path) {
  const hit = POLICY.find((p) => path === p.prefix || path.startsWith(p.prefix + '/'))
  return hit ? hit.roles : ['admin']
}

/** 전역 인가 — authenticate 다음에 한 번만 장착한다 */
function authorize(req, res, next) {
  if (!req.path.startsWith('/api/')) return next()
  if (isPublic(req) || isSecretProtected(req)) return next()

  const allowed = policyFor(req.path)
  if (allowed === ANY) {
    // 로그인 자체는 필요 — 관찰 모드에서는 req.user 가 없을 수 있다
    if (req.user || !enforce()) return next()
    return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' })
  }
  return requireRole(...allowed)(req, res, next)
}

module.exports = { authenticate, authorize, requireRole, requireAdmin, resolveRoles }
