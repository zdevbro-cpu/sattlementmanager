// 직급별 기본급여 저장소 — 시스템관리에서 관리, localStorage 영속화
// (추후 백엔드 연동 시 교체 가능)
import { useSyncExternalStore } from 'react'

export interface PositionSalary {
  position: string // 직급
  basic: number // 기본급여(연봉, 원)
}

export const POSITIONS = ['예비과장', '과장', '차장', '부장', '이사', '상무', '전무']

const DEFAULTS: PositionSalary[] = POSITIONS.map((position) => ({
  position,
  basic: 0,
}))

const KEY = 'sm.positionSalaries.v1'

function load(): PositionSalary[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as PositionSalary[]
    return POSITIONS.map(
      (position) =>
        parsed.find((p) => p.position === position) ?? { position, basic: 0 },
    )
  } catch {
    return DEFAULTS
  }
}

let state: PositionSalary[] = load()
const listeners = new Set<() => void>()

function emit() {
  localStorage.setItem(KEY, JSON.stringify(state))
  listeners.forEach((l) => l())
}

export function getPositionSalaries(): PositionSalary[] {
  return state
}

/** 직급의 기본급여 수정 */
export function updatePositionSalary(position: string, basic: number): void {
  state = state.map((p) => (p.position === position ? { ...p, basic } : p))
  emit()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** React 훅: 직급별 기본급여 구독 */
export function usePositionSalaries(): PositionSalary[] {
  return useSyncExternalStore(subscribe, getPositionSalaries, getPositionSalaries)
}
