// 은행/기관 목록 저장소 — 시스템관리에서 추가·삭제, localStorage 영속화.
// 임용계약 등록·수정의 은행/기관 선택(InstitutionSelect)에서 사용한다.
import { useSyncExternalStore } from 'react'
import { BANKS } from '../../types/appointment'

const KEY = 'sm.banks.v1'

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return [...BANKS]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...BANKS]
    return parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    return [...BANKS]
  }
}

let state: string[] = load()
const listeners = new Set<() => void>()

function emit() {
  localStorage.setItem(KEY, JSON.stringify(state))
  listeners.forEach((l) => l())
}

export function getBanks(): string[] {
  return state
}

/** 신규 기관 추가 (중복 무시). 성공 시 true */
export function addBank(name: string): boolean {
  const v = name.trim()
  if (!v || state.includes(v)) return false
  state = [...state, v]
  emit()
  return true
}

/** 기관 삭제 */
export function removeBank(name: string): void {
  state = state.filter((x) => x !== name)
  emit()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** React 훅: 은행/기관 목록 구독 */
export function useBanks(): string[] {
  return useSyncExternalStore(subscribe, getBanks, getBanks)
}
