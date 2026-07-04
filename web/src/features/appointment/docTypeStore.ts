// 제출서류 종류 저장소 — 시스템관리에서 추가·삭제, localStorage 영속화.
// 임용계약 등록·상세의 제출서류 업로드(DocUploadList)에서 사용한다.
import { useSyncExternalStore } from 'react'

const DEFAULTS: string[] = ['주민등록등본', '주민증사본', '통장사본', '원천징수']

const KEY = 'sm.appointmentDocTypes.v1'

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return [...DEFAULTS]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...DEFAULTS]
    return parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    return [...DEFAULTS]
  }
}

let state: string[] = load()
const listeners = new Set<() => void>()

function emit() {
  localStorage.setItem(KEY, JSON.stringify(state))
  listeners.forEach((l) => l())
}

export function getDocTypes(): string[] {
  return state
}

/** 신규 서류종류 추가 (중복 무시). 성공 시 true */
export function addDocType(name: string): boolean {
  const v = name.trim()
  if (!v || state.includes(v)) return false
  state = [...state, v]
  emit()
  return true
}

/** 서류종류 삭제 */
export function removeDocType(name: string): void {
  state = state.filter((x) => x !== name)
  emit()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** React 훅: 제출서류 종류 목록 구독 */
export function useDocTypes(): string[] {
  return useSyncExternalStore(subscribe, getDocTypes, getDocTypes)
}
