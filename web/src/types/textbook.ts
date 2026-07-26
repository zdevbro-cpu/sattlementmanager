// 교재구매 신청 관리 도메인 타입 — 교재구입 정보만 취급 (결제/입금은 매출관리에서 별도 처리)

export interface TextbookApplication {
  id: string
  applyDate: string // 신청 날짜
  buyerName: string // 구매자 성명
  childName: string // 자녀 성명
  childBirthdate: string // 자녀 생년월일
  phone: string // 전화번호
  address: string // 배송지 주소
  deliveryMemo: string // 배송메모
  book1Name: string // 교재구입 1
  book2Name: string // 교재구입 2
  subscriptionType: string // 구독회원 구분
  managementType: string // 관리회원 구분
  sellerName: string // 담당자 소속·성명
  sellerPhone: string // 담당자 연락처
  drivePhotoFileId: string // 수기 신청서 원본 사진 (Google Drive)
  drivePhotoViewUrl: string
  drivePdfFileId: string // 양식 기반 생성 PDF (수기신청서 없을 때)
  drivePdfViewUrl: string
  createdAt: string
  /** 연결된 매출 (목록 조회에서만 채워진다) — 결제 등록 여부를 대장에서 바로 본다 */
  saleId?: string
  saleTotal?: number
  /** 연결된 배송건 (목록 조회에서만 채워진다) */
  shipmentId?: string
  shipmentStatus?: string
  /** 구독 정기발송 — shipProduct 가 있으면 정기발송이 걸린 신청이다 */
  shipProduct?: string
  shipIntervalDays?: number
  shipTotal?: number
  shipSeq?: number
  shipNextDate?: string
  shipPaused?: boolean
  shipCanceledAt?: string
}

export interface TextbookApplicationFilter {
  startDate: string
  endDate: string
  buyer: string
}

export const EMPTY_TEXTBOOK_FILTER: TextbookApplicationFilter = {
  startDate: '',
  endDate: '',
  buyer: '',
}
