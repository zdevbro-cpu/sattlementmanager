/**
 * 택배사별 배송조회 페이지 링크.
 *
 * 키는 시스템관리 공통코드 '택배사'(codesRepo DEFAULTS.carriers)의 값과 일치해야 한다.
 * 택배사를 자유 입력으로 두면 표기가 조금만 달라도(예: "CJ 대한통운") 매칭이 깨져
 * 링크가 사라지므로, 배송 화면에서는 공통코드 목록에서 선택하게 한다.
 *
 * 조회 API 연동(Phase 4) 전까지는 이 링크가 유일한 추적 수단이다.
 */
export const TRACKING_URL: Record<string, string> = {
  CJ대한통운: 'https://trace.cjlogistics.com/next/tracking.html?wblNo=',
  롯데택배: 'https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=',
  한진택배: 'https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2=',
  우체국택배: 'https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=',
  로젠택배: 'https://www.ilogen.com/web/personal/trace/',
}

/** 조회 링크 — 매핑에 없는 택배사이거나 송장번호가 없으면 빈 문자열 */
export function trackingUrl(carrier: string, trackingNo: string): string {
  const base = TRACKING_URL[(carrier || '').trim()]
  if (!base || !trackingNo) return ''
  return base + encodeURIComponent(trackingNo)
}
