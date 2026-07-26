// 지점명(임용계약 소속지점) 저장소 — Cloud SQL(app_settings) 저장, localStorage는 로딩 전 캐시로만 사용.
// 임용계약 등록/수정, 조직관리 검색필터가 모두 이 목록을 참조하므로 기기·브라우저와 무관하게
// 동일한 값을 봐야 한다. (공통코드 codeStore 는 localStorage 전용이라 여기에 두지 않는다)
import { useSyncExternalStore } from 'react'
import { fetchBranches, onSignedIn, updateBranchesApi } from '../../lib/api'

const KEY = 'sm.branches.v1'

/** 항상 가나다 오름차순 + 중복 제거 */
function normalize(list: string[]): string[] {
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'ko'),
  )
}

function loadCache(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    return normalize(JSON.parse(raw) as string[])
  } catch {
    return []
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
  updateBranchesApi(JSON.stringify(state)).catch(() => {
    /* 서버 저장 실패는 조용히 무시 — 다음 로드 시 재동기화 */
  })
}

// 로그인 이후에 동기화한다 — 로그인 화면에서 보내면 토큰이 없어 401 이 되고, 이 호출은 1회뿐이라 복구되지 않는다
onSignedIn(() => {
  fetchBranches()
    .then((raw) => {
      if (!raw) return
      state = normalize(JSON.parse(raw) as string[])
      emit()
    })
    .catch(() => {
      /* 서버 미응답 시 로컬 캐시 유지 */
    })
})

export function getBranches(): string[] {
  return state
}

/** 지점 추가 — 이미 있으면 false */
export function addBranch(name: string): boolean {
  const n = name.trim()
  if (!n) return false
  if (state.includes(n)) return false
  state = normalize([...state, n])
  emit()
  save()
  return true
}

/** 지점 삭제 */
export function removeBranch(name: string): void {
  state = state.filter((b) => b !== name)
  emit()
  save()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** React 훅: 지점 목록 구독 (가나다 오름차순) */
export function useBranches(): string[] {
  return useSyncExternalStore(subscribe, getBranches, getBranches)
}
