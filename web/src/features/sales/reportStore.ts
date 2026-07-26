// 일일보고 수신 이메일 설정 — Cloud SQL(app_settings) 저장, localStorage는 로딩 전 캐시로만 사용
// 백엔드 cron(/api/cron/daily-sales-report)이 동일한 DB 값을 참조해 실제 발송 대상자로 사용한다.
import { useSyncExternalStore } from 'react'
import { fetchReportEmails, onSignedIn, updateReportEmailsApi } from '../../lib/api'

const KEY = 'sm.reportEmails.v1'
const DEFAULT =
  'gospress.dckwak@gmail.com, najulove76@naver.com, eunjooni@naver.com'

function loadCache(): string {
  try {
    return localStorage.getItem(KEY) ?? DEFAULT
  } catch {
    return DEFAULT
  }
}

let state = loadCache()
const listeners = new Set<() => void>()

function emit() {
  try {
    localStorage.setItem(KEY, state)
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

// 로그인 이후에 동기화한다 — 로그인 화면에서 보내면 토큰이 없어 401 이 되고, 이 호출은 1회뿐이라 복구되지 않는다
onSignedIn(() => {
  fetchReportEmails()
    .then((v) => {
      if (v && v !== state) {
        state = v
        emit()
      }
    })
    .catch(() => {
      /* 서버 미응답 시 로컬 캐시 유지 */
    })
})

export function getReportEmails(): string {
  return state
}

export function setReportEmails(v: string): void {
  state = v
  emit()
  updateReportEmailsApi(v).catch(() => {
    /* 서버 저장 실패는 조용히 무시 — 다음 로드 시 재동기화 */
  })
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useReportEmails(): string {
  return useSyncExternalStore(subscribe, getReportEmails, getReportEmails)
}

/** 이메일 문자열 → 유효 주소 배열 */
export function parseEmails(s: string): string[] {
  return s
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))
}

/** 수신 이메일 1건 추가 (유효성·중복 검사). 성공 시 true */
export function addReportEmail(email: string): boolean {
  const e = email.trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return false
  const list = parseEmails(state)
  if (list.includes(e)) return false
  setReportEmails([...list, e].join(', '))
  return true
}

/** 수신 이메일 1건 삭제 */
export function removeReportEmail(email: string): void {
  const list = parseEmails(state).filter((x) => x !== email)
  setReportEmails(list.join(', '))
}
