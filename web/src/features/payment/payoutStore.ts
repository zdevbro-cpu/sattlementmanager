// 지급관리(수익금/급여) 데이터 접근 계층 (인메모리 목데이터)
import { MOCK_PAYOUTS } from '../../data/mockPayouts'
import type {
  Payout,
  PayoutCategory,
  PayoutFilter,
  PayoutStatus,
} from '../../types/payout'
import { parseDate } from '../../lib/format'

let store: Payout[] = [...MOCK_PAYOUTS]
let seq = store.length

export function listPayouts(
  category: PayoutCategory,
  filter: PayoutFilter,
): Payout[] {
  const start = parseDate(filter.startDate)
  const end = parseDate(filter.endDate)
  const kw = filter.keyword.trim()

  return store
    .filter((p) => {
      if (p.category !== category) return false
      if (filter.status !== '전체' && p.status !== filter.status) return false
      if (kw && !p.payee.includes(kw) && !p.type.includes(kw)) return false
      const d = parseDate(p.payDate)
      if (start && d && d < start) return false
      if (end && d && d > end) return false
      return true
    })
    .sort((a, b) => (b.payDate ?? '').localeCompare(a.payDate ?? ''))
}

export function updatePayoutStatus(id: string, status: PayoutStatus): void {
  store = store.map((p) => (p.id === id ? { ...p, status } : p))
}

export function createPayout(p: Omit<Payout, 'id'>): Payout {
  seq += 1
  const created: Payout = { ...p, id: `PO${String(seq).padStart(3, '0')}` }
  store = [created, ...store]
  return created
}

export function deletePayout(id: string): void {
  store = store.filter((p) => p.id !== id)
}

/** 요약 집계 */
export function summarizePayouts(list: Payout[]) {
  const total = list.length
  const amount = list.reduce((s, p) => s + p.amount, 0)
  const paid = list
    .filter((p) => p.status === '지급완료')
    .reduce((s, p) => s + p.amount, 0)
  const unpaid = list
    .filter((p) => p.status !== '지급완료' && p.status !== '취소')
    .reduce((s, p) => s + p.amount, 0)
  return { total, amount, paid, unpaid }
}
