// LAS-ON 매장선정관리 도메인 타입 — LAS-On_Store_Manager.md 요구사항서 Phase 1 대응

export const STORE_STATUSES = [
  '신규등록',
  '접촉중',
  '실무협의',
  '실측예정',
  '실측완료',
  '모델링',
  '계약완료',
  '공사',
  '집기발주',
  '도서불출',
  '오픈',
] as const

export interface RecruitmentLog {
  id: string
  part: string
  staff: string
  contactDate: string
  contactMethod: string // 방문/전화/기타
  result: string // 관심/보류/거절
  nextAction: string
  memo: string
  createdAt: string
}

export interface StorePhoto {
  id: string
  driveFileId: string
  driveViewUrl: string
  uploadedAt: string
}

export interface Store {
  id: string
  businessRegNo: string
  storePhone: string
  roadAddress: string
  detailAddress: string
  lat?: number
  lng?: number
  storeName: string
  businessType: string
  totalArea: string
  availableArea: string
  floorLocation: string
  businessHours: string
  commercialNote: string
  chainBrand: string
  contactName: string
  contactPosition: string
  contactMobile: string
  decisionAuthority: string
  progressStatus: string
  ceoConfirm: string
  surveyDate: string
  status: string
  claimedPart: string
  claimedStaff: string
  claimedAt: string
  claimExpiresAt: string
  rejectReason: string
  recontactAvailableAt: string
  memo: string
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  log: RecruitmentLog[]
  photos: StorePhoto[]
}

export interface StoreFilter {
  keyword: string
  status: string
  claimedPart: string
  claimedStaff: string
}

/** 상태 필터 전용 특수값 — 실제 STORE_STATUSES 값이 아니라 "선점파트/선점담당이 비어있음(선점해지)"을 뜻한다 */
export const RELEASED_FILTER_VALUE = '선점해지'

export const EMPTY_STORE_FILTER: StoreFilter = {
  keyword: '',
  status: '전체',
  claimedPart: '',
  claimedStaff: '',
}
