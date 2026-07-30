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

/** 매장 사진 분류 */
export const STORE_PHOTO_KINDS = ['건물외관', '라스온설치공간', '겨냥도', '완성이미지'] as const
export type StorePhotoKind = (typeof STORE_PHOTO_KINDS)[number]

/**
 * 사진 열람 URL — 서버가 Drive 파일을 중계해 내려주는 경로.
 * driveViewUrl(Drive 뷰어 링크)을 직접 열면 서비스 계정 소유 파일이라 사용자에게
 * "액세스 요청" 화면이 뜨므로, 우리 서버 경로로 연다.
 */
export function storePhotoUrl(driveFileId: string): string {
  return `/api/stores/photo/${encodeURIComponent(driveFileId)}`
}

export interface StorePhoto {
  id: string
  driveFileId: string
  driveViewUrl: string
  kind: string
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
  /** 행정구역 — 지도 화면의 시/도 → 시/군/구 필터 기준 (지오코딩으로 채워진다) */
  sido?: string
  sigungu?: string
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
  businessUnit: string
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
  /** 사업부 — 매장 자체 값(store.businessUnit) 기준. 계정 조회에 의존하지 않아 파트너도 동작한다 */
  businessUnit: string
}

/** 상태 필터 전용 특수값 — 실제 STORE_STATUSES 값이 아니라 "선점파트/선점담당이 비어있음(선점해지)"을 뜻한다 */
export const RELEASED_FILTER_VALUE = '선점해지'

export const EMPTY_STORE_FILTER: StoreFilter = {
  keyword: '',
  status: '전체',
  claimedPart: '',
  claimedStaff: '',
  businessUnit: '',
}
