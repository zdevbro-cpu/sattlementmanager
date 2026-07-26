// 교재구매 신청 관리 데이터 접근 계층 — Cloud SQL(server/textbookRepo.js)을 통해 조회/저장한다.
import type { TextbookApplication, TextbookApplicationFilter } from '../../types/textbook'
import type { PaymentInfo } from '../../types/contract'
import {
  startSubscriptionApi,
  pauseSubscriptionApi,
  cancelSubscriptionApi,
  createTextbookApplicationApi,
  deleteTextbookApplicationApi,
  fetchTextbookApplication,
  fetchTextbookApplications,
} from '../../lib/api'

export function listApplications(filter: TextbookApplicationFilter): Promise<TextbookApplication[]> {
  return fetchTextbookApplications(filter)
}

export function getApplication(id: string): Promise<TextbookApplication> {
  return fetchTextbookApplication(id)
}

export function createApplication(
  a: Omit<TextbookApplication, 'id' | 'createdAt'> & { payment?: PaymentInfo },
): Promise<TextbookApplication> {
  return createTextbookApplicationApi(a)
}

export function deleteApplication(id: string): Promise<void> {
  return deleteTextbookApplicationApi(id)
}

export function summarizeApplications(list: TextbookApplication[]) {
  const today = new Date().toISOString().slice(0, 10)
  const todayCount = list.filter((a) => a.createdAt === today).length
  const withPhoto = list.filter((a) => a.drivePhotoFileId).length
  const withPdf = list.filter((a) => a.drivePdfFileId).length
  return { total: list.length, todayCount, withPhoto, withPdf }
}

/* ── 구독 정기발송 ────────────────────────────────────────── */

/** 구독 시작 — 상품과 주기를 걸면 다음 회차부터 크론이 배송건을 만든다 */
export function startSubscription(id: string, data: { product: string; intervalDays?: number; total?: number }) {
  return startSubscriptionApi(id, data)
}

/** 일시정지·재개 — 재개하면 다음 예정일을 오늘 기준으로 다시 잡는다(밀린 회차를 몰아 보내지 않는다) */
export function pauseSubscription(id: string, paused: boolean) {
  return pauseSubscriptionApi(id, paused)
}

/** 해지 — 이후 회차를 만들지 않는다. 이미 나간 배송건은 그대로 둔다 */
export function cancelSubscription(id: string) {
  return cancelSubscriptionApi(id)
}
