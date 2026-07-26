// las-mgmt 점주/점장 명단 조회 — 읽기 전용.
//
// 【설계 원칙】
// 1. las-mgmt 코드는 일절 수정하지 않는다. 명단만 읽어 쓴다.
// 2. las-mgmt 비밀번호는 어떤 형태로도 가져오지 않는다.
//    users 테이블에 평문 비밀번호가 남아 있어(마이그레이션 미완) 신뢰할 수 없다.
//    본인확인은 "등록된 이메일로 보낸 비밀번호 설정 링크"로 한다.
// 3. 브라우저에서 직접 조회하지 않는다. anon 키는 las-mgmt 소스에 하드코딩되어 공개돼 있고,
//    현재 users 테이블에 RLS 가 없어 그 키로 전체 명단이 읽힌다(확인함).
//    우리 서버는 service_role 키로만 접근해, 나중에 RLS 를 켜도 동작이 깨지지 않게 한다.
// 4. 조회 컬럼은 최소화한다 — 비밀번호·주민번호 등은 아예 select 하지 않는다.

const BASE = process.env.LAS_SUPABASE_URL || 'https://sgxnxbhbyvrmgrzhosyh.supabase.co'

/** 점주/점장만 대상. 그 외 user_type 은 교재·배송과 무관하다. */
const OWNER_TYPES = ['점주', '점장']

/** las-mgmt user_type → 우리 roles 값 */
const ROLE_BY_TYPE = { 점주: 'store_owner', 점장: 'store_manager' }

function keyOrNull() {
  return process.env.LAS_SUPABASE_SERVICE_KEY || null
}

/**
 * LAS 고유번호 + 이름으로 점주/점장을 찾는다.
 * 이름은 공백을 무시하고 정확히 일치할 때만 통과시킨다(부분일치는 타인 조회 위험).
 * @returns {Promise<null | {referralCode,name,email,phone,branch,userType,role}>}
 */
async function findOwnerByReferralCode(referralCode, name) {
  const key = keyOrNull()
  if (!key) return null // 키 미설정 — 연동을 끈 상태로 본다

  const code = String(referralCode || '').trim().toUpperCase()
  const who = String(name || '').replace(/\s+/g, '')
  if (!/^LAS\d{4}$/.test(code) || !who) return null

  try {
    const params = new URLSearchParams({
      select: 'referral_code,name,email,phone,branch,user_type,status',
      referral_code: `eq.${code}`,
      status: 'eq.approved',
      limit: '5',
    })
    const res = await fetch(`${BASE}/rest/v1/users?${params}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    const rows = await res.json()
    if (!Array.isArray(rows)) return null

    const hit = rows.find(
      (r) =>
        OWNER_TYPES.includes(r.user_type) &&
        String(r.name || '').replace(/\s+/g, '') === who &&
        String(r.email || '').includes('@'),
    )
    if (!hit) return null

    return {
      referralCode: hit.referral_code,
      name: hit.name,
      email: String(hit.email).trim(),
      phone: hit.phone || '',
      branch: hit.branch || '',
      userType: hit.user_type,
      role: ROLE_BY_TYPE[hit.user_type] || 'store_owner',
    }
  } catch {
    // 네트워크·타임아웃 — 조회 실패는 "찾지 못함"과 같게 취급한다(사유를 밖으로 흘리지 않는다)
    return null
  }
}

/** 이메일 마스킹 — 어디로 보냈는지 알려주되 주소 전체는 노출하지 않는다 */
function maskEmail(email) {
  const [id, domain] = String(email || '').split('@')
  if (!domain) return ''
  const head = id.slice(0, 2)
  return `${head}${'*'.repeat(Math.max(1, id.length - 2))}@${domain}`
}

module.exports = { findOwnerByReferralCode, maskEmail, OWNER_TYPES }
