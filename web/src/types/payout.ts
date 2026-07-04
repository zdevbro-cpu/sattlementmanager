// 지급관리 — 지급 내역(수익금/급여) 도메인 타입
// 지급종류·상태는 docs 사양(예정·승인·지급완료·보류·취소) 준용

/** 탭 구분: 수익금관리 / 급여관리 */
export type PayoutCategory = '수익금' | '급여'

export const PAYOUT_STATUSES = [
  '예정',
  '승인',
  '지급완료',
  '보류',
  '취소',
] as const
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number]

/** 지급 내역 1건 */
export interface Payout {
  id: string
  category: PayoutCategory // 수익금 / 급여 (탭 구분)
  payDate: string // 지급일
  payee: string // 수령인
  type: string // 지급종류 (직원급여 / 파트너수당 / 점주수익금 등)
  amount: number // 금액
  status: PayoutStatus // 상태
  bankName: string // 은행
  accountNo: string // 계좌번호
  memo: string // 비고
}

/** 목록 필터 */
export interface PayoutFilter {
  keyword: string // 수령인
  status: PayoutStatus | '전체'
  startDate: string // 지급일 시작
  endDate: string // 지급일 종료
}

export const EMPTY_PAYOUT_FILTER: PayoutFilter = {
  keyword: '',
  status: '전체',
  startDate: '',
  endDate: '',
}

/** 지급종류 기본 목록 (카테고리별) */
export const PAYOUT_TYPES: Record<PayoutCategory, string[]> = {
  수익금: ['파트너수당', '점주수익금', '추천수당', '기타수익금'],
  급여: ['직원급여', '임용급여', '상여금', '기타급여'],
}

/** 상태 → 배지 톤 */
export function payoutStatusTone(
  status: string,
): 'green' | 'blue' | 'amber' | 'red' | 'slate' {
  switch (status) {
    case '지급완료':
      return 'green'
    case '승인':
      return 'blue'
    case '예정':
      return 'amber'
    case '취소':
      return 'red'
    case '보류':
    default:
      return 'slate'
  }
}
