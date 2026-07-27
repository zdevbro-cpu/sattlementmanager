import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  RecaptchaVerifier,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signOut as fbSignOut,
  type ConfirmationResult,
  type User,
} from 'firebase/auth'
import { auth } from '../../lib/firebase'

interface AuthState {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  /** 문자 인증 1단계 — 번호로 인증문자를 보낸다. 돌려받은 값으로 2단계를 진행한다 */
  sendPhoneCode: (phone: string, containerId: string) => Promise<ConfirmationResult>
  signOut: () => Promise<void>
}

/**
 * 국내 휴대폰 번호를 Firebase 가 요구하는 E.164 형식(+8210…)으로 바꾼다.
 * 파트너가 010-1234-5678, 01012345678 어느 쪽으로 적어도 통과해야 한다.
 */
export function toE164(phone: string): string | null {
  const d = phone.replace(/[^0-9]/g, '')
  if (/^010\d{8}$/.test(d)) return '+82' + d.slice(1)
  if (/^8210\d{8}$/.test(d)) return '+' + d
  return null
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
    })
  }, [])

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
  }

  /**
   * 문자 인증 — reCAPTCHA 는 보이지 않는 방식(invisible)으로 붙인다.
   * 파트너에게 "사진 고르기" 같은 화면이 뜨면 그 자체가 장벽이 되므로,
   * 정상적인 접속에서는 아무것도 보이지 않고 넘어가야 한다.
   *
   * 검증기는 매번 새로 만든다 — 한 번 쓴 것을 재사용하면 재시도 시 실패한다.
   */
  const sendPhoneCode = async (phone: string, containerId: string) => {
    const e164 = toE164(phone)
    if (!e164) throw new Error('휴대폰 번호를 정확히 입력해주세요. (예: 010-1234-5678)')
    const el = document.getElementById(containerId)
    if (el) el.innerHTML = ''
    const verifier = new RecaptchaVerifier(auth, containerId, { size: 'invisible' })
    try {
      return await signInWithPhoneNumber(auth, e164, verifier)
    } catch (e) {
      verifier.clear()
      throw e
    }
  }

  const signOut = () => fbSignOut(auth)

  return (
    <AuthContext.Provider value={{ user, loading, signIn, sendPhoneCode, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
