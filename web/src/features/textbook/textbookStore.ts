// 교재구매 신청 관리 데이터 접근 계층 — Cloud SQL(server/textbookRepo.js)을 통해 조회/저장한다.
import type { TextbookApplication, TextbookApplicationFilter } from '../../types/textbook'
import type { PaymentInfo } from '../../types/contract'
import {
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
