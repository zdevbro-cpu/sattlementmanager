// 시스템 사용자 저장소 — 시스템관리 > 사용자관리에서 등록·수정·삭제. localStorage 영속화.
import { useSyncExternalStore } from 'react'

export const USER_ROLES = ['시스템관리자', '운영자', '조회자'] as const
export type UserRole = (typeof USER_ROLES)[number]

export interface User {
  id: string
  name: string // 이름
  email: string // 이메일 (로그인 식별)
  role: UserRole // 역할(권한)
  active: boolean // 사용 여부
}

const DEFAULTS: User[] = [
  { id: 'U001', name: '관리자', email: 'admin@las.com', role: '시스템관리자', active: true },
]

const KEY = 'sm.users.v1'

function load(): User[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return [...DEFAULTS]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...DEFAULTS]
    return parsed
      .filter((x) => x && typeof x.email === 'string')
      .map((x) => ({
        id: String(x.id),
        name: String(x.name ?? ''),
        email: String(x.email),
        role: (USER_ROLES.includes(x.role) ? x.role : '조회자') as UserRole,
        active: x.active !== false,
      }))
  } catch {
    return [...DEFAULTS]
  }
}

let state: User[] = load()
const listeners = new Set<() => void>()

function emit() {
  localStorage.setItem(KEY, JSON.stringify(state))
  listeners.forEach((l) => l())
}

function nextId(): string {
  const n = state.reduce((m, u) => {
    const v = Number(String(u.id).replace(/\D/g, '')) || 0
    return Math.max(m, v)
  }, 0)
  return `U${String(n + 1).padStart(3, '0')}`
}

export function getUsers(): User[] {
  return state
}

/** 사용자 추가 (이메일 중복 무시). 성공 시 true */
export function addUser(u: { name: string; email: string; role: UserRole }): boolean {
  const email = u.email.trim()
  if (!email || state.some((x) => x.email === email)) return false
  state = [
    ...state,
    { id: nextId(), name: u.name.trim(), email, role: u.role, active: true },
  ]
  emit()
  return true
}

/** 사용자 정보 수정 (역할/상태/이름 등) */
export function updateUser(id: string, patch: Partial<Omit<User, 'id'>>): void {
  state = state.map((u) => (u.id === id ? { ...u, ...patch } : u))
  emit()
}

/** 사용자 삭제 */
export function removeUser(id: string): void {
  state = state.filter((u) => u.id !== id)
  emit()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** React 훅: 사용자 목록 구독 */
export function useUsers(): User[] {
  return useSyncExternalStore(subscribe, getUsers, getUsers)
}
