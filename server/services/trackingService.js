// 배송추적 서비스 — 송장번호로 택배사 배송상태를 조회한다.
//
// 【설계 원칙】
// 1. "접수·송장발급 API"와 "조회 API"는 다른 서비스다. 접수는 택배사 실계약이 전제라
//    수동으로 두고, 송장번호만 있으면 되는 조회만 자동화한다.
// 2. 제공사를 갈아끼울 수 있게 track() 단일 인터페이스로 감싼다.
//    스마트택배를 다른 서비스로 바꿔도 호출부(cron)는 그대로다.
// 3. 조회 실패가 배송 업무를 막으면 안 된다 — 예외를 밖으로 던지지 않고 null 을 반환한다.
//    수동 상태변경 경로는 항상 살아 있어야 한다.

const PROVIDER = 'sweettracker'
const BASE = 'http://info.sweettracker.co.kr/api/v1/trackingInfo'

/**
 * 공통코드 '택배사' 값 → 스마트택배 택배사 코드.
 * 키는 시스템관리 공통코드(codesRepo DEFAULTS.carriers)와 일치해야 한다.
 * 여기 없는 택배사는 조회하지 않고 건너뛴다(수동 관리 대상).
 */
const CARRIER_CODE = {
  우체국택배: '01',
  CJ대한통운: '04',
  한진택배: '05',
  로젠택배: '06',
  롯데택배: '08',
}

/**
 * 조회가 실제로 성공했는지 — 긍정 확인 방식으로 판정한다.
 * 잘못된 송장번호는 HTTP 200 에 `status:false` + msg 로 돌아온다(200 만 보고 믿으면 안 된다).
 * "실패가 아니면 성공"이 아니라 `result:'Y'` 가 있을 때만 성공으로 본다 —
 * 응답 형식이 바뀌어도 배송완료로 오판하지 않는 방향으로 실패한다.
 */
function isSuccess(json) {
  if (!json || json.status === false) return false
  return json.result === 'Y'
}

/**
 * 배송완료 여부.
 * completeYN/complete 이 공식 신호이고, 표기가 바뀔 때를 대비해 마지막 진행 문구도 함께 본다.
 * 진행 이력이 하나도 없으면 완료로 보지 않는다(빈 응답을 완료로 오판하지 않기 위함).
 */
function isDelivered(json) {
  const details = Array.isArray(json?.trackingDetails) ? json.trackingDetails : []
  if (!details.length) return false
  if (json.completeYN === 'Y' || json.complete === true) return true
  const last = details.at(-1)
  return /배달완료|배송완료/.test(String(last?.kind ?? ''))
}

/** 마지막 진행 상태 원문 (화면·로그에 남겨 담당자가 상황을 알 수 있게) */
function statusText(json) {
  const last = Array.isArray(json?.trackingDetails) ? json.trackingDetails.at(-1) : null
  return (last?.kind || json?.itemName || '').toString().slice(0, 100)
}

/**
 * 배송 조회.
 * @returns {Promise<null | { provider, delivered, statusText, raw }>}
 *   null = 조회하지 않았거나 실패 — 호출부는 상태를 바꾸지 않고 넘어간다.
 */
async function track(carrier, trackingNo) {
  const key = process.env.SWEETTRACKER_API_KEY
  if (!key) return null // 키 미설정 — 자동추적을 끈 상태로 본다(수동 운영)
  const code = CARRIER_CODE[(carrier || '').trim()]
  if (!code || !trackingNo) return null // 매핑 없는 택배사·송장번호 없음

  try {
    const url = `${BASE}?t_key=${encodeURIComponent(key)}&t_code=${code}&t_invoice=${encodeURIComponent(trackingNo)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    const json = await res.json()
    // 잘못된 송장번호도 HTTP 200 으로 돌아온다 — 성공 여부는 본문으로 판정해야 한다
    if (!isSuccess(json)) return null
    return {
      provider: PROVIDER,
      delivered: isDelivered(json),
      statusText: statusText(json),
      raw: json,
    }
  } catch {
    // 타임아웃·네트워크 오류 — 다음 주기에 다시 조회한다
    return null
  }
}

module.exports = { track, PROVIDER, CARRIER_CODE }
