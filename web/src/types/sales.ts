// 매출관리 도메인 타입
// 결재정보(카드/현금 분할)·문서는 계약 도메인 타입을 재사용한다.
import type { DriveDocument, PaymentInfo } from './contract'

/** 매출 1건 */
export interface Sale {
  id: string
  date: string // 매출일
  category: string // 매출구분 (시스템관리 salesCategories)
  businessUnit: string // 사업부
  buyer: string // 구매자
  manager: string // 담당 (지점/담당자)
  inputterOrg: string // 입력자 소속
  inputterName: string // 입력자 성명
  payment: PaymentInfo // 카드/현금 + 분할결제 (재사용)
  documents: DriveDocument[] // 전표/입금증 Drive 링크
  verified: boolean // 전표 검증 여부
  memo?: string
  createdAt: string
  /** 출처 — 매출 직접등록('sale') / 계약 보증금 연동('contract') */
  source: 'sale' | 'contract'
  /** 계약 연동 시 원본 계약 id */
  contractId?: string
}

/** 매출 목록 필터 */
export interface SalesFilter {
  startDate: string // 기간 시작
  endDate: string // 기간 종료
  category: string // 종류(매출구분) ('전체' 포함)
  businessUnit: string // 사업부 (포함 검색)
  buyer: string // 구매자 (포함 검색)
  inputterOrg: string // 입력자 소속 (포함 검색)
  inputterName: string // 입력자 성명 (포함 검색)
}

export const EMPTY_SALES_FILTER: SalesFilter = {
  startDate: '',
  endDate: '',
  category: '전체',
  businessUnit: '',
  buyer: '',
  inputterOrg: '',
  inputterName: '',
}

/** 결재구분 배지 라벨 (카드/현금/카드현금) */
export function salesMethodLabel(method: string): string {
  if (method === '혼합') return '카드현금'
  if (method === '없음') return '-'
  return method
}
