// 공통 코드 저장소 — 소속 / 계약구분 / 상태
// 시스템관리 화면에서 추가·삭제하며, localStorage에 영속화한다.
// (추후 백엔드 code 테이블로 교체 가능)

import { useSyncExternalStore } from 'react'

export type CodeKind = 'orgs' | 'contractTypes' | 'statuses'

export interface CodeSet {
  orgs: string[] // 소속 (예: A, B)
  contractTypes: string[] // 계약구분 (LAS매장점주/직원/LAS-On파트장/LAS-On파트너)
  statuses: string[] // 상태 (신규/증액/양수/양도/해지/폐기)
}

const DEFAULTS: CodeSet = {
  orgs: ['A', 'B'],
  contractTypes: ['LAS매장점주', '직원', 'LAS-On파트장', 'LAS-On파트너'],
  statuses: ['신규', '증액', '양수', '양도', '해지', '폐기'],
}

const KEY = 'sm.codes.v1'

function load(): CodeSet {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw)
    return {
      orgs: parsed.orgs ?? DEFAULTS.orgs,
      contractTypes: parsed.contractTypes ?? DEFAULTS.contractTypes,
      statuses: parsed.statuses ?? DEFAULTS.statuses,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

let state: CodeSet = load()
const listeners = new Set<() => void>()

function emit() {
  localStorage.setItem(KEY, JSON.stringify(state))
  listeners.forEach((l) => l())
}

export function getCodes(): CodeSet {
  return state
}

export function addCode(kind: CodeKind, value: string): boolean {
  const v = value.trim()
  if (!v || state[kind].includes(v)) return false
  state = { ...state, [kind]: [...state[kind], v] }
  emit()
  return true
}

export function removeCode(kind: CodeKind, value: string): void {
  state = { ...state, [kind]: state[kind].filter((x) => x !== value) }
  emit()
}

export function resetCodes(): void {
  state = { ...DEFAULTS }
  emit()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** React 훅: 코드셋 구독 */
export function useCodes(): CodeSet {
  return useSyncExternalStore(subscribe, getCodes, getCodes)
}
