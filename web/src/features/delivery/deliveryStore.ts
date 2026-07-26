// 배송관리 데이터 접근 계층 — Cloud SQL(server/shipmentRepo.js)을 통해 조회/저장한다.
import type { Shipment, ShipmentFilter, ShipmentSummary } from '../../types/delivery'
import {
  createShipmentApi,
  sendShipmentListApi,
  fetchShipment,
  fetchShipmentSummary,
  fetchShipments,
  setShipmentStatusApi,
  updateShipmentApi,
} from '../../lib/api'

export function listShipments(filter: ShipmentFilter): Promise<Shipment[]> {
  return fetchShipments(filter)
}

/** 신규 배송 수동 등록 — 교재신청과 무관한 배송건(전화·방문 접수 등)을 단독 생성한다 */
export function createShipment(
  data: Pick<
    Shipment,
    'recipientName' | 'phone' | 'address' | 'deliveryMemo' | 'book1Name' | 'book2Name' | 'carrier' | 'trackingNo' | 'memo'
  > & {
    /** 접수 상태 — 배송지가 있어도 '추후배송'을 고를 수 있다. 배송지가 없으면 서버가 추후배송으로 고정한다 */
    status?: string
  },
): Promise<Shipment> {
  return createShipmentApi(data)
}

/** 상세 — 상태 전이 이력(log)이 함께 온다 */
export function getShipment(id: string): Promise<Shipment> {
  return fetchShipment(id)
}

export function summarizeShipments(): Promise<ShipmentSummary> {
  return fetchShipmentSummary()
}

/** 배송지·택배사·송장·메모 수정 (상태는 setStatus 로만 바꾼다) */
export function updateShipment(id: string, patch: Partial<Shipment>): Promise<Shipment> {
  return updateShipmentApi(id, patch)
}

/** 상태 전이 — 실패 사유(전이 불가/배송지 미확정 등)는 서버 메시지를 그대로 화면에 보여준다 */
export function setShipmentStatus(id: string, toStatus: string, memo?: string): Promise<Shipment> {
  return setShipmentStatusApi(id, toStatus, memo)
}

/** 배송목록 전송 — '목록확정' 건만 대상이며, 메일 발송에 성공해야 전송완료로 바뀐다 */
export function sendShipmentList(ids: string[]) {
  return sendShipmentListApi(ids)
}
