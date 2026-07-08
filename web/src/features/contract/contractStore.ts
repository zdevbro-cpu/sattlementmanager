// 계약 데이터 접근 계층 — Cloud SQL(PostgreSQL) 백엔드(server/contractRepo.js)를 통해 조회/저장한다.

import type { Contract, ContractFilter, ContractSnapshot } from '../../types/contract'
import {
  addContractHistoryApi,
  correctContractHistoryApi,
  createContractApi,
  fetchContract,
  fetchContracts,
} from '../../lib/api'

/** 필터를 적용해 목록 반환 (최신 계약일 내림차순, 서버에서 정렬)
 *  등록일(createdAt) 구간은 서버 필터에 없으므로 클라이언트에서 함께 적용한다. */
export async function listContracts(filter: ContractFilter): Promise<Contract[]> {
  const list = await fetchContracts(filter)
  const { regStartDate, regEndDate } = filter
  if (!regStartDate && !regEndDate) return list
  return list.filter((c) => {
    const reg = (c.current.createdAt ?? '').slice(0, 10)
    if (regStartDate && (!reg || reg < regStartDate)) return false
    if (regEndDate && (!reg || reg > regEndDate)) return false
    return true
  })
}

export function getContract(id: string): Promise<Contract> {
  return fetchContract(id)
}

/** 신규 계약 생성 */
export function createContract(snapshot: ContractSnapshot): Promise<Contract> {
  return createContractApi(snapshot)
}

/** 기존 계약에 이력(증액/양수/양도/해지/폐기 등) 추가 → current 갱신 */
export function addHistory(
  id: string,
  snapshot: ContractSnapshot,
): Promise<Contract> {
  return addContractHistoryApi(id, snapshot)
}

/** 오타수정 — 새 이력행을 추가하지 않고 지정 스냅샷(historyId)을 그대로 고침 */
export function correctHistory(
  id: string,
  historyId: string,
  snapshot: ContractSnapshot,
): Promise<Contract> {
  return correctContractHistoryApi(id, historyId, snapshot)
}

/** 요약 카드용 집계 */
export function summarize(list: Contract[]) {
  const total = list.length
  const active = list.filter(
    (c) => c.current.status !== '해지' && c.current.status !== '폐기',
  ).length
  const newThisMonth = list.filter((c) =>
    (c.current.contractDate ?? '').startsWith(new Date().toISOString().slice(0, 7)),
  ).length
  const terminated = list.filter(
    (c) => c.current.status === '해지' || c.current.status === '폐기',
  ).length
  return { total, active, newThisMonth, terminated }
}
