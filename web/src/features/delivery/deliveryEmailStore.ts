// 물류업체 수신 이메일 저장소 — 배송목록 전송 대상.
// 일일보고 이메일(reportStore)과 같은 구조이며, 서버 app_settings 에 보관한다.
// 로그인 이후에 동기화한다 — 로그인 화면에서 보내면 토큰이 없어 401 이 되고,
// 이 호출은 1회뿐이라 이후에도 채워지지 않는다(reportStore 와 동일한 이유).
import { useSyncExternalStore } from 'react'
import { fetchDeliveryEmails, onSignedIn, updateDeliveryEmailsApi } from '../../lib/api'

const KEY = 'sm.deliveryEmails.v1'

let state = load()
const listeners = new Set<() => void>()

function load(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

function emit() {
  try {
    localStorage.setItem(KEY, state)
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

onSignedIn(() => {
  fetchDeliveryEmails()
    .then((v) => {
      if (v !== state) {
        state = v
        emit()
      }
    })
    .catch(() => {
      /* 서버 미응답 시 로컬 캐시 유지 */
    })
})

export function getDeliveryEmails(): string {
  return state
}

export function setDeliveryEmails(v: string): void {
  state = v
  emit()
  updateDeliveryEmailsApi(v).catch(() => {
    /* 서버 저장 실패는 조용히 무시 — 다음 로드 시 재동기화 */
  })
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useDeliveryEmails(): string {
  return useSyncExternalStore(subscribe, getDeliveryEmails, getDeliveryEmails)
}

/** 이메일 문자열 → 유효 주소 배열 */
export function parseDeliveryEmails(s: string): string[] {
  return s
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))
}

/** 1건 추가 (유효성·중복 검사). 성공 시 true */
export function addDeliveryEmail(email: string): boolean {
  const e = email.trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return false
  const list = parseDeliveryEmails(state)
  if (list.includes(e)) return false
  setDeliveryEmails([...list, e].join(', '))
  return true
}

/** 1건 삭제 */
export function removeDeliveryEmail(email: string): void {
  setDeliveryEmails(parseDeliveryEmails(state).filter((x) => x !== email).join(', '))
}
