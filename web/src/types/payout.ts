// 지급관리 도메인 타입

/** 탭 구분: 수익금관리 / 급여관리 / LAS-On 수당지급 */
export type PayoutCategory = '수익금' | '급여' | 'LAS-On'

/** 추가지급 대상자 — 수익금지급 화면에서 계약자/조직관리(임용계약) 중 선택해 수동 등록 */
export interface ExtraPayee {
  id: string
  source: '조직관리' | '계약자'
  name: string
  memo: string // 지급내역
  amount: number
  residentNo: string
  bankName: string
  accountNo: string
  accountOwner: string
}
