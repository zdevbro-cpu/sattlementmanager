// 은행/기관 목록 저장소 — Cloud SQL(app_settings) 저장, localStorage는 로딩 전 캐시로만 사용.
// 임용계약 등록·수정의 은행/기관 선택(InstitutionSelect)에서 사용한다.
import { useSyncExternalStore } from 'react'
import { fetchBanks, updateBanksApi } from '../../lib/api'
import { BANKS } from '../../types/appointment'

const KEY = 'sm.banks.v1'

function loadCache(): string[] {
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

let state: string[] = loadCache()
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
  updateBanksApi(JSON.stringify(state)).catch(() => {
    /* 서버 저장 실패는 조용히 무시 — 다음 로드 시 재동기화 */
  })
}

fetchBanks()
  .then((raw) => {
    if (!raw) {
      // 서버에 아직 값이 없으면(최초 마이그레이션) 이 기기의 기존 캐시를 그대로 서버에 올려 보존한다
      save()
      return
    }
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      state = parsed.filter((x): x is string => typeof x === 'string')
      emit()
    }
  })
  .catch(() => {
    /* 서버 미응답 시 로컬 캐시 유지 */
  })

export function getBanks(): string[] {
  return state
}

/** 신규 기관 추가 (중복 무시). 성공 시 true */
export function addBank(name: string): boolean {
  const v = name.trim()
  if (!v || state.includes(v)) return false
  state = [...state, v]
  emit()
  save()
  return true
}

/** 기관 삭제 */
export function removeBank(name: string): void {
  state = state.filter((x) => x !== name)
  emit()
  save()
}

/** 목록에서 한 칸 위/아래로 이동 */
export function moveBank(name: string, direction: 'up' | 'down'): void {
  const idx = state.indexOf(name)
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

/** React 훅: 은행/기관 목록 구독 */
export function useBanks(): string[] {
  return useSyncExternalStore(subscribe, getBanks, getBanks)
}
