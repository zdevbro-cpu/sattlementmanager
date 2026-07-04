// 카드결제(매출) 분류 관리 — 분류명 + 최대 매수(전표 최대 등록 수)
// 어드민이 등록한 분류가 매출등록 페이지의 드롭다운에 노출된다. localStorage 영속화.
import { useSyncExternalStore } from 'react'

export interface SalesCategory {
  name: string
  max: number // 최대 매수
}

const DEFAULTS: SalesCategory[] = [
  { name: 'LAS On 파트장', max: 10 },
  { name: 'LAS On 파트너', max: 10 },
  { name: '매장결제', max: 10 },
  { name: '구독회원 S2', max: 10 },
  { name: '현금(소득공제)', max: 10 },
  { name: '독서지도사', max: 5 },
  { name: '점주보증금', max: 10 },
]

const KEY = 'sm.salesCategories.v1'

function load(): SalesCategory[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return [...DEFAULTS]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...DEFAULTS]
    return parsed
      .filter((x) => x && typeof x.name === 'string')
      .map((x) => ({ name: x.name, max: Number(x.max) || 10 }))
  } catch {
    return [...DEFAULTS]
  }
}

let state: SalesCategory[] = load()
const listeners = new Set<() => void>()

function emit() {
  localStorage.setItem(KEY, JSON.stringify(state))
  listeners.forEach((l) => l())
}

export function getSalesCategories(): SalesCategory[] {
  return state
}

export function addSalesCategory(name: string, max: number): boolean {
  const n = name.trim()
  if (!n || state.some((c) => c.name === n)) return false
  state = [...state, { name: n, max: Number(max) || 10 }]
  emit()
  return true
}

export function removeSalesCategory(name: string): void {
  state = state.filter((c) => c.name !== name)
  emit()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useSalesCategories(): SalesCategory[] {
  return useSyncExternalStore(subscribe, getSalesCategories, getSalesCategories)
}
