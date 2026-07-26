// 직급별 기본급여 저장소 — Cloud SQL(app_settings) 저장, localStorage는 로딩 전 캐시로만 사용
// 조직관리 등록/수정 화면, 급여지급관리, 대시보드가 모두 이 값을 참조하므로 기기·브라우저와
// 무관하게 동일한 값을 봐야 한다.
import { useSyncExternalStore } from 'react'
import { fetchPositionSalaries, onSignedIn, updatePositionSalariesApi } from '../../lib/api'

export interface PositionSalary {
  position: string // 직급
  basic: number // 기본급여(연봉, 원)
  /** 근로소득 기본급여 (월, 원) — 근로소득 선택자의 급여소득 */
  laborBasic: number
  /** 근로소득 공제 정액 (월, 원) — 직급별로 정해 정액 공제 */
  pension: number // 국민연금 (60세 생일 이후 제외)
  healthCare: number // 건강.요양 (건강보험 + 장기요양)
  employment: number // 고용보험
  incomeTax: number // 소득세
}

/** 이전 버전 저장값 — 건강보험/장기요양이 분리되어 있던 형태 */
interface LegacyPositionSalary {
  health?: number
  longTermCare?: number
}

export const POSITIONS = ['예비과장', '과장', '차장', '부장', '이사', '상무', '전무']

/**
 * 확장 필드가 없는 기존 저장값도 안전하게 읽는다.
 * 구버전의 health + longTermCare 는 healthCare 로 합산해 이어받는다.
 */
function withDefaults(
  p: Partial<PositionSalary> & LegacyPositionSalary & { position: string },
): PositionSalary {
  const legacyHealthCare = (p.health ?? 0) + (p.longTermCare ?? 0)
  return {
    position: p.position,
    basic: p.basic ?? 0,
    laborBasic: p.laborBasic ?? 0,
    pension: p.pension ?? 0,
    healthCare: p.healthCare ?? legacyHealthCare,
    employment: p.employment ?? 0,
    incomeTax: p.incomeTax ?? 0,
  }
}

const DEFAULTS: PositionSalary[] = POSITIONS.map((position) =>
  withDefaults({ position }),
)

const KEY = 'sm.positionSalaries.v1'

/** 저장(JSON)에서 읽어들이는 형태 — 구버전 필드가 섞여 있을 수 있다 */
type StoredPositionSalary = Partial<PositionSalary> &
  LegacyPositionSalary & { position: string }

/** 저장된 목록을 그대로 사용 — 처음 사용(저장된 값 없음)일 때만 기본 7종으로 시작한다. */
function normalize(parsed: StoredPositionSalary[]): PositionSalary[] {
  return parsed.length > 0 ? parsed.map(withDefaults) : DEFAULTS
}

function loadCache(): PositionSalary[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    return normalize(JSON.parse(raw) as StoredPositionSalary[])
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

// 로그인 이후에 동기화한다 — 로그인 화면에서 보내면 토큰이 없어 401 이 되고, 이 호출은 1회뿐이라 복구되지 않는다
onSignedIn(() => {
  fetchPositionSalaries()
    .then((raw) => {
      if (!raw) return
      const parsed = normalize(JSON.parse(raw) as StoredPositionSalary[])
      state = parsed
      emit()
    })
    .catch(() => {
      /* 서버 미응답 시 로컬 캐시 유지 */
    })
})

export function getPositionSalaries(): PositionSalary[] {
  return state
}

/** 직급의 기본급여(연봉) 수정 */
export function updatePositionSalary(position: string, basic: number): void {
  updatePositionField(position, { basic })
}

/** 직급 행의 임의 필드 수정 (근로기본급여·4대보험 정액 등) */
export function updatePositionField(
  position: string,
  patch: Partial<Omit<PositionSalary, 'position'>>,
): void {
  state = state.map((p) => (p.position === position ? { ...p, ...patch } : p))
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
  state = [...state, withDefaults({ position: name, basic })]
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
