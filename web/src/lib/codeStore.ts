// 공통 코드 저장소 — 소속 / 계약구분 / 상태 / 사업부 / 임용상태
// 시스템관리 화면에서 추가·삭제하며, 서버 DB(system_codes 테이블)에 저장한다.
// 로그인 없는 공개 페이지(파트너 가입요청)에서도 조회해야 해서 브라우저 localStorage가 아니라 서버에 둔다.

import { useSyncExternalStore } from 'react'
import { addCodeApi, fetchCodes, reorderCodeApi, removeCodeApi, type CodeSetApi } from './api'

export type CodeKind =
  | 'orgs'
  | 'contractTypes'
  | 'statuses'
  | 'businessUnits'
  | 'appointmentStatuses'
  | 'carriers'
export type CodeSet = CodeSetApi

const DEFAULTS: CodeSet = {
  orgs: ['A', 'B'],
  contractTypes: ['LAS매장점주', '직원', 'LAS-On파트장', 'LAS-On파트너'],
  statuses: ['신규', '증액', '양수', '양도', '해지', '폐기'],
  businessUnits: ['교육선교위원회', '교육사업부', 'LAS-On', '구독'],
  appointmentStatuses: ['정상', '휴직', '해지'],
  carriers: ['CJ대한통운', '롯데택배', '한진택배', '우체국택배', '로젠택배'],
}

let state: CodeSet = { ...DEFAULTS }
let loaded = false
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

function ensureLoaded() {
  if (loaded || loading) return
  loading = fetchCodes()
    .then((data) => {
      state = data
      loaded = true
      emit()
    })
    .catch(() => {
      // 서버 조회 실패 시 기본값 유지 — 다음 구독 시 재시도
      loading = null
    })
}

export function getCodes(): CodeSet {
  return state
}

/** 코드 추가 — 서버 저장 후 최신 목록으로 갱신 */
export async function addCode(kind: CodeKind, value: string): Promise<boolean> {
  const v = value.trim()
  if (!v || state[kind].includes(v)) return false
  state = await addCodeApi(kind, v)
  emit()
  return true
}

export async function removeCode(kind: CodeKind, value: string): Promise<void> {
  state = await removeCodeApi(kind, value)
  emit()
}

/** 항목을 한 칸 위/아래로 이동 */
export async function moveCode(kind: CodeKind, value: string, direction: 'up' | 'down'): Promise<void> {
  state = await reorderCodeApi(kind, value, direction)
  emit()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  ensureLoaded()
  return () => listeners.delete(cb)
}

/** React 훅: 코드셋 구독 — 최초 구독 시 서버에서 조회한다 */
export function useCodes(): CodeSet {
  return useSyncExternalStore(subscribe, getCodes, getCodes)
}
