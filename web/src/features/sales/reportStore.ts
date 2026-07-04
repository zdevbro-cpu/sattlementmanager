// 일일보고 수신 이메일 설정 — localStorage 영속화
// (매일 오후 10시 매출내용 양식을 이 수신자에게 메일링 — 실제 발송은 백엔드 스케줄러 연동)
import { useSyncExternalStore } from 'react'

const KEY = 'sm.reportEmails.v1'
const DEFAULT =
  'gospress.dckwak@gmail.com, najulove76@naver.com, eunjooni@naver.com'

function load(): string {
  try {
    return localStorage.getItem(KEY) ?? DEFAULT
  } catch {
    return DEFAULT
  }
}

let state = load()
const listeners = new Set<() => void>()

export function getReportEmails(): string {
  return state
}

export function setReportEmails(v: string): void {
  state = v
  localStorage.setItem(KEY, v)
  listeners.forEach((l) => l())
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
