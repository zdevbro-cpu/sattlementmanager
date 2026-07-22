// LAS-ON 매장선정관리 데이터 접근 계층
import type { RecruitmentLog, Store, StoreFilter } from '../../types/store'
import {
  addRecruitmentLogApi,
  checkDuplicateStores,
  createStoreApi,
  deleteStoreApi,
  fetchStore,
  fetchStores,
  updateStoreApi,
  uploadStorePhoto,
} from '../../lib/api'

export function listStores(filter: StoreFilter): Promise<Store[]> {
  return fetchStores(filter)
}

export function getStore(id: string): Promise<Store> {
  return fetchStore(id)
}

/** 등록 전 중복 판정 후보 검색 — 사업자번호 > 전화번호 > 매장명 순으로 비교 */
export function findDuplicates(params: { bizNo?: string; phone?: string; name?: string }): Promise<Store[]> {
  return checkDuplicateStores(params)
}

export function createStore(data: Partial<Store>): Promise<Store> {
  return createStoreApi(data)
}

export function updateStore(id: string, data: Partial<Store>): Promise<Store> {
  return updateStoreApi(id, data)
}

export function deleteStore(id: string): Promise<void> {
  return deleteStoreApi(id)
}

export function addRecruitmentLog(
  storeId: string,
  log: Omit<RecruitmentLog, 'id' | 'createdAt'>,
): Promise<Store> {
  return addRecruitmentLogApi(storeId, log)
}

export function uploadPhoto(storeId: string, file: File): Promise<Store> {
  return uploadStorePhoto(storeId, file)
}

/** 요약 카드용 집계 */
export function summarizeStores(list: Store[]) {
  const total = list.length
  const active = list.filter((s) => s.status !== '오픈').length
  const contracted = list.filter((s) => s.status === '오픈').length
  const expiringSoon = list.filter((s) => {
    if (!s.claimExpiresAt) return false
    const days = Math.ceil(
      (new Date(s.claimExpiresAt).getTime() - Date.now()) / (24 * 3600 * 1000),
    )
    return days >= 0 && days <= 7
  }).length
  return { total, active, contracted, expiringSoon }
}
