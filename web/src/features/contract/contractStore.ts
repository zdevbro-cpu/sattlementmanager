// 계약 데이터 접근 계층.
// 현재는 인메모리 목데이터로 동작하며, 추후 fetch('/api/contracts')로 교체 가능하도록
// 함수 시그니처를 API 관점으로 유지한다.

import { MOCK_CONTRACTS } from '../../data/mockContracts'
import type {
  Contract,
  ContractFilter,
  ContractSnapshot,
} from '../../types/contract'
import { parseDate } from '../../lib/format'

let store: Contract[] = [...MOCK_CONTRACTS]
let seq = store.length

/** 필터를 적용해 목록 반환 (최신 계약일 내림차순) */
export function listContracts(filter: ContractFilter): Contract[] {
  const from = parseDate(filter.contractDate) // 계약일자: 해당일 이후
  const until = parseDate(filter.contractEndDate) // 계약종료일: 해당일 이전
  const kw = filter.keyword.trim()

  return store
    .filter((c) => {
      const cur = c.current
      if (filter.status !== '전체' && cur.status !== filter.status) return false
      if (filter.org !== '전체' && cur.org !== filter.org) return false
      if (filter.branch !== '전체' && cur.branch !== filter.branch) return false
      if (filter.manager !== '전체' && cur.manager !== filter.manager)
        return false
      if (filter.recruiter !== '전체' && cur.recruiter !== filter.recruiter)
        return false
      if (kw && !cur.contractorName.includes(kw)) return false
      // 계약일자: 계약일이 선택일 이후(>=)
      const cd = parseDate(cur.contractDate)
      if (from && cd && cd < from) return false
      // 계약종료일: 계약종료일이 선택일 이전(<=)
      const ed = parseDate(cur.contractEndDate)
      if (until && ed && ed > until) return false
      return true
    })
    .sort((a, b) =>
      (b.current.contractDate ?? '').localeCompare(a.current.contractDate ?? ''),
    )
}

export function getContract(id: string): Contract | undefined {
  return store.find((c) => c.id === id)
}

/** 신규 계약 생성 */
export function createContract(snapshot: ContractSnapshot): Contract {
  seq += 1
  const id = `C${String(seq).padStart(3, '0')}`
  const snap: ContractSnapshot = {
    ...snapshot,
    historyId: `${id}-H1`,
  }
  const contract: Contract = {
    id,
    contractorId: `M${String(seq).padStart(3, '0')}`,
    current: snap,
    history: [snap],
  }
  store = [contract, ...store]
  return contract
}

/** 기존 계약에 이력(증액/양수/양도/해지/폐기 등) 추가 → current 갱신 */
export function addHistory(
  id: string,
  snapshot: ContractSnapshot,
): Contract | undefined {
  const c = store.find((x) => x.id === id)
  if (!c) return undefined
  const snap: ContractSnapshot = {
    ...snapshot,
    historyId: `${id}-H${c.history.length + 1}`,
  }
  c.history = [snap, ...c.history]
  c.current = snap
  return c
}

/** 요약 카드용 집계 */
export function summarize(list: Contract[]) {
  const total = list.length
  const active = list.filter(
    (c) => c.current.status !== '해지' && c.current.status !== '폐기',
  ).length
  const newThisMonth = list.filter((c) =>
    (c.current.contractDate ?? '').startsWith('2026-06'),
  ).length
  const terminated = list.filter(
    (c) => c.current.status === '해지' || c.current.status === '폐기',
  ).length
  return { total, active, newThisMonth, terminated }
}
