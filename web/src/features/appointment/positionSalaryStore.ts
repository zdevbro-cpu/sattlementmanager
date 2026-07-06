// 직급별 기본급여 저장소 — Cloud SQL(app_settings) 저장, localStorage는 로딩 전 캐시로만 사용
// 조직관리 등록/수정 화면, 급여지급관리, 대시보드가 모두 이 값을 참조하므로 기기·브라우저와
// 무관하게 동일한 값을 봐야 한다.
import { useSyncExternalStore } from 'react'
import { fetchPositionSalaries, updatePositionSalariesApi } from '../../lib/api'

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

/** 저장된 목록을 그대로 사용 — 처음 사용(저장된 값 없음)일 때만 기본 7종으로 시작한다. */
function normalize(parsed: PositionSalary[]): PositionSalary[] {
  return parsed.length > 0 ? parsed : DEFAULTS
}

function loadCache(): PositionSalary[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    return normalize(JSON.parse(raw) as PositionSalary[])
  } catch {
    return DEFAULTS
  }
}

let state: PositionSalary[] = loadCache()
const listeners = new Set<() => void>()

function emit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

fetchPositionSalaries()
  .then((raw) => {
    if (!raw) return
    const parsed = normalize(JSON.parse(raw) as PositionSalary[])
    state = parsed
    emit()
  })
  .catch(() => {
    /* 서버 미응답 시 로컬 캐시 유지 */
  })

export function getPositionSalaries(): PositionSalary[] {
  return state
}

/** 직급의 기본급여 수정 */
export function updatePositionSalary(position: string, basic: number): void {
  state = state.map((p) => (p.position === position ? { ...p, basic } : p))
  emit()
  updatePositionSalariesApi(JSON.stringify(state)).catch(() => {
    /* 서버 저장 실패는 조용히 무시 — 다음 로드 시 재동기화 */
  })
}

/**
 * 신규 직급 추가 — 기존 고정 직급은 그대로 두고 목록 뒤에 추가한다.
 * 이후 등록되는 임용계약부터 선택·연봉연동에 사용된다 (기존 임용계약은 영향 없음).
 * 이름이 비었거나 이미 있는 직급이면 false를 반환한다.
 */
export function addPosition(position: string, basic: number): boolean {
  const name = position.trim()
  if (!name) return false
  if (state.some((p) => p.position === name)) return false
  state = [...state, { position: name, basic }]
  emit()
  updatePositionSalariesApi(JSON.stringify(state)).catch(() => {
    /* 서버 저장 실패는 조용히 무시 — 다음 로드 시 재동기화 */
  })
  return true
}

/** 직급 삭제 (기존/신규 구분 없이 삭제 가능) */
export function removePosition(position: string): void {
  state = state.filter((p) => p.position !== position)
  emit()
  updatePositionSalariesApi(JSON.stringify(state)).catch(() => {
    /* 서버 저장 실패는 조용히 무시 — 다음 로드 시 재동기화 */
  })
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** React 훅: 직급별 기본급여 구독 */
export function usePositionSalaries(): PositionSalary[] {
  return useSyncExternalStore(subscribe, getPositionSalaries, getPositionSalaries)
}
