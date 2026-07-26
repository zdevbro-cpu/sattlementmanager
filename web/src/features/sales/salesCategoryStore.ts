// 카드결제(매출) 분류 관리 — 분류명 + 최대 매수(전표 최대 등록 수)
// 어드민이 등록한 분류가 매출등록 페이지의 드롭다운에 노출된다.
// Cloud SQL(app_settings) 저장, localStorage는 로딩 전 캐시로만 사용.
import { useSyncExternalStore } from 'react'
import { fetchSalesCategories, updateSalesCategoriesApi } from '../../lib/api'

export interface SalesCategory {
  name: string
  max: number // 최대 매수
}

const DEFAULTS: SalesCategory[] = [
  { name: 'LAS-On파트장', max: 10 },
  { name: 'LAS-On파트너', max: 10 },
  { name: '매장결제', max: 10 },
  { name: '구독회원 S2', max: 10 },
  { name: '현금(소득공제)', max: 10 },
  { name: '독서지도사', max: 5 },
  { name: '점주보증금', max: 10 },
]

// 계약구분과 동일한 표기(LAS-On파트장/LAS-On파트너)로 매출 종류를 맞추면서 추가된 코드 —
// 이미 저장된 목록에도 없으면 자동으로 채워 넣어(마이그레이션) 기존 사용자도 바로 필터에서 쓸 수 있게 한다.
const REQUIRED: SalesCategory[] = [
  { name: 'LAS-On파트장', max: 10 },
  { name: 'LAS-On파트너', max: 10 },
]

const KEY = 'sm.salesCategories.v1'

function parseList(raw: string): SalesCategory[] {
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) return [...DEFAULTS]
  const list = parsed
    .filter((x) => x && typeof x.name === 'string')
    .map((x) => ({ name: x.name, max: Number(x.max) || 10 }))
  const missing = REQUIRED.filter((r) => !list.some((c) => c.name === r.name))
  return missing.length ? [...list, ...missing] : list
}

function loadCache(): SalesCategory[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return [...DEFAULTS]
    return parseList(raw)
  } catch {
    return [...DEFAULTS]
  }
}

let state: SalesCategory[] = loadCache()
const listeners = new Set<() => void>()

function emit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

function save() {
  updateSalesCategoriesApi(JSON.stringify(state)).catch(() => {
    /* 서버 저장 실패는 조용히 무시 — 다음 로드 시 재동기화 */
  })
}

fetchSalesCategories()
  .then((raw) => {
    if (!raw) {
      // 서버에 아직 값이 없으면(최초 마이그레이션) 이 기기의 기존 캐시를 그대로 서버에 올려 보존한다
      save()
      return
    }
    state = parseList(raw)
    emit()
  })
  .catch(() => {
    /* 서버 미응답 시 로컬 캐시 유지 */
  })

export function getSalesCategories(): SalesCategory[] {
  return state
}

export function addSalesCategory(name: string, max: number): boolean {
  const n = name.trim()
  if (!n || state.some((c) => c.name === n)) return false
  state = [...state, { name: n, max: Number(max) || 10 }]
  emit()
  save()
  return true
}

export function removeSalesCategory(name: string): void {
  state = state.filter((c) => c.name !== name)
  emit()
  save()
}

/** 목록에서 한 칸 위/아래로 이동 */
export function moveSalesCategory(name: string, direction: 'up' | 'down'): void {
  const idx = state.findIndex((c) => c.name === name)
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (idx < 0 || swapIdx < 0 || swapIdx >= state.length) return
  const next = [...state]
  ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
  state = next
  emit()
  save()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useSalesCategories(): SalesCategory[] {
  return useSyncExternalStore(subscribe, getSalesCategories, getSalesCategories)
}
