// 계약 데이터 접근 계층 — Cloud SQL(PostgreSQL) 백엔드(server/contractRepo.js)를 통해 조회/저장한다.

import type { Contract, ContractFilter, ContractSnapshot } from '../../types/contract'
import {
  addContractHistoryApi,
  correctContractHistoryApi,
  createContractApi,
  fetchContract,
  fetchContracts,
  transferInApi,
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

/** 양수 처리 — 양수인 계약(id)에 이력 추가 + 선택된 양도인 계약에 자동으로 '양도' 이력 추가 */
export function transferIn(
  id: string,
  transferorContractId: string,
  transferAmount: number,
  snapshot: ContractSnapshot,
): Promise<Contract> {
  return transferInApi(id, transferorContractId, transferAmount, snapshot)
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
/** 로컬 날짜 → 'YYYY-MM-DD' */
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function summarize(list: Contract[]) {
  const total = list.length
  const isEnded = (c: Contract) =>
    c.current.status === '해지' || c.current.status === '폐기'
  const activeList = list.filter((c) => !isEnded(c))
  const active = activeList.length
  const terminated = list.filter(isEnded).length

  // 이번달·이번주(월요일 시작) 경계 — 로컬 날짜 기준
  const now = new Date()
  const monthPrefix = isoLocal(now).slice(0, 7) // 'YYYY-MM'
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)) // 월요일로 이동
  const weekStart = isoLocal(monday)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const weekEnd = isoLocal(sunday)

  const newThisMonth = activeList.filter((c) =>
    (c.current.contractDate ?? '').startsWith(monthPrefix),
  ).length

  // 계약총액 = 보증금 합계 (해지·폐기 제외)
  const depositTotal = activeList.reduce((a, c) => a + (c.current.deposit || 0), 0)
  const monthTotal = activeList
    .filter((c) => (c.current.contractDate ?? '').startsWith(monthPrefix))
    .reduce((a, c) => a + (c.current.deposit || 0), 0)
  const weekTotal = activeList
    .filter((c) => {
      const d = c.current.contractDate ?? ''
      return d >= weekStart && d <= weekEnd
    })
    .reduce((a, c) => a + (c.current.deposit || 0), 0)

  return { total, active, newThisMonth, terminated, depositTotal, monthTotal, weekTotal }
}
