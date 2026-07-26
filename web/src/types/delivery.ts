// 배송관리 도메인 타입 — server/shipmentRepo.js 와 1:1 대응한다.

/**
 * 배송 상태.
 * 접수 ≠ 배송: 신청 시점에 배송지가 확정되지 않을 수 있어(현장의 "추후배송" 조건)
 * 배송지가 없는 건은 '추후배송'으로 시작하고 배송목록 전송 대상에서 제외한다.
 */
export const SHIPMENT_STATUSES = [
  '접수',
  '추후배송',
  '목록확정',
  '전송완료',
  '배송중',
  '배송완료',
  '완료확인',
  '취소',
] as const

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number]

/**
 * 허용 전이표 — 서버(shipmentRepo.TRANSITIONS)와 동일하다.
 * 화면에서는 여기 있는 상태만 버튼으로 보여주고, 최종 판정은 서버가 한다.
 */
export const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  접수: ['추후배송', '목록확정', '취소'],
  추후배송: ['목록확정', '취소'],
  목록확정: ['추후배송', '전송완료', '취소'],
  전송완료: ['배송중'],
  배송중: ['배송완료'],
  배송완료: ['배송중', '완료확인'], // 배송중은 오배송·반송 복구 경로(사유 필수)
  완료확인: [],
  취소: [],
}

export interface ShipmentLog {
  id: string
  fromStatus: string
  toStatus: string
  actor: string
  memo: string
  createdAt: string
}

export interface Shipment {
  id: string
  textbookApplicationId: string
  /** 배송지 스냅샷 — 신청 원본과 분리되어 배송건에서 따로 수정한다 */
  recipientName: string
  phone: string
  address: string
  deliveryMemo: string
  book1Name: string
  book2Name: string
  status: ShipmentStatus
  carrier: string
  trackingNo: string
  batchId: string
  sentToLogisticsAt: string
  shippedAt: string
  deliveredAt: string
  confirmedAt: string
  memo: string
  createdAt: string
  updatedAt: string
  /** 상세 조회에서만 채워진다 */
  log?: ShipmentLog[]
}

export interface ShipmentFilter {
  startDate: string
  endDate: string
  status: string
  keyword: string
}

export const EMPTY_SHIPMENT_FILTER: ShipmentFilter = {
  startDate: '',
  endDate: '',
  status: '전체',
  keyword: '',
}

export interface ShipmentSummary {
  total: number
  deferred: number
  waitingSend: number
  shipping: number
  done: number
  byStatus: Record<string, number>
}
