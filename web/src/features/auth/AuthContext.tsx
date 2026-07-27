import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
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
   * 【같은 요소에 두 번 붙이면 안 된다】
   * reCAPTCHA 는 한 번 렌더된 DOM 요소를 기억하고 있어서, 같은 요소에 다시 붙이면
   * "reCAPTCHA has already been rendered in this element" 로 실패한다.
   * innerHTML 을 비우는 것만으로는 부족하다 — 위젯 등록이 남아 있기 때문이다.
   * 그래서 ①이전 검증기를 clear() 로 확실히 해제하고 ②컨테이너 안에 매번
   * 새 div 를 만들어 거기에 붙인다. 재시도·번호 다시입력·StrictMode 이중 렌더
   * 어느 경우에도 항상 처음 쓰는 요소가 된다.
   */
  const verifierRef = useRef<RecaptchaVerifier | null>(null)

  const clearVerifier = () => {
    if (!verifierRef.current) return
    try {
      verifierRef.current.clear()
    } catch {
      // 이미 정리된 경우 — 무시해도 다음 단계에서 새로 만든다
    }
    verifierRef.current = null
  }

  const sendPhoneCode = async (phone: string, containerId: string) => {
    const e164 = toE164(phone)
    if (!e164) throw new Error('휴대폰 번호를 정확히 입력해주세요. (예: 010-1234-5678)')

    clearVerifier()
    const wrapper = document.getElementById(containerId)
    if (!wrapper) throw new Error('인증 준비에 실패했습니다. 새로고침 후 다시 시도해주세요.')
    wrapper.innerHTML = ''
    const host = document.createElement('div')
    wrapper.appendChild(host)

    const verifier = new RecaptchaVerifier(auth, host, { size: 'invisible' })
    verifierRef.current = verifier
    try {
      return await signInWithPhoneNumber(auth, e164, verifier)
    } catch (e) {
      clearVerifier()
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
