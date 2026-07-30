import { useEffect, useRef, useState } from 'react'
import type { ConfirmationResult } from 'firebase/auth'
import { phoneFmt } from '../../lib/format'
import { useAuth } from './AuthContext'

function friendlyError(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return '이메일 형식이 올바르지 않습니다.'
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return '이메일 또는 비밀번호가 올바르지 않습니다.'
    case 'auth/too-many-requests':
      return '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.'
    // ── 문자 인증 ──
    case 'auth/invalid-phone-number':
      return '휴대폰 번호를 정확히 입력해주세요.'
    case 'auth/user-disabled':
      return '사용이 중지된 계정입니다. 관리자에게 문의해주세요.'
    case 'auth/invalid-verification-code':
      return '인증번호가 올바르지 않습니다. 문자로 받은 6자리를 다시 확인해주세요.'
    case 'auth/code-expired':
      return '인증번호가 만료되었습니다. 다시 받아주세요.'
    case 'auth/quota-exceeded':
      return '인증문자 발송이 일시적으로 제한되었습니다. 잠시 후 다시 시도해주세요.'
    case 'auth/missing-phone-number':
      return '휴대폰 번호를 입력하세요.'
    case 'auth/operation-not-allowed':
      return '문자 로그인이 아직 켜져 있지 않습니다. 관리자에게 문의해주세요.'
    case 'auth/billing-not-enabled':
      return '문자 발송 설정이 완료되지 않았습니다. 관리자에게 문의해주세요.'
    // reCAPTCHA 확인 실패 — 대부분 도메인·API 키 설정 문제라 사용자가 할 수 있는 게 없다
    case 'auth/invalid-app-credential':
    case 'auth/captcha-check-failed':
    case 'auth/argument-error':
      return '인증 확인에 실패했습니다. 관리자에게 문의해주세요.'
    case 'auth/network-request-failed':
      return '네트워크 연결을 확인해주세요.'
    default:
      return ''
  }
}

/**
 * 화면에 보여줄 오류 문구.
 * 아는 코드는 사람 말로 바꾸고, 모르는 코드는 코드 자체를 함께 남긴다 —
 * "로그인에 실패했습니다" 만 뜨면 담당자도 원인을 못 찾는다.
 */
function errorText(code: string, raw: string): string {
  const known = friendlyError(code)
  if (known) return known
  if (code) return `로그인에 실패했습니다. (${code})`
  return raw || '로그인에 실패했습니다.'
}

/** 문자 인증에서 등록되지 않은 번호는 새 계정을 만들어버린다 — 그 상황을 사람 말로 알린다 */
const UNREGISTERED = '등록되지 않은 번호입니다. 관리자에게 문의해주세요.'

type Mode = 'phone' | 'email'

const RECAPTCHA_ID = 'recaptcha-container'

/* ══════════════════════════════════════════════════════════
 * 문자 로그인 재시도 제한
 *
 * Firebase 는 짧은 시간에 요청이 몰리면 그 번호·기기를 남용 방지로 차단한다
 * (auth/too-many-requests). 한번 걸리면 수십 분~수 시간 풀리지 않고, 그 사이
 * 재시도할수록 차단이 연장된다. 사용법에 익숙하지 않은 사용자가 문자가 안 오면
 * 버튼을 연달아 누르므로, 차단에 닿기 전에 앱에서 먼저 간격을 둔다.
 *
 * 5회까지는 자유롭게 시도하고, 그 다음부터 30초 → 1분으로 대기를 늘린다.
 * 새로고침으로 초기화되면 의미가 없어 번호별로 localStorage 에 남긴다.
 * ══════════════════════════════════════════════════════════ */

/** 이 횟수까지는 대기 없이 시도할 수 있다 */
const FREE_ATTEMPTS = 5
/** 5회 초과 시 첫 대기(초) → 그 다음부터는 60초 */
const COOLDOWN_SECONDS = [30, 60]

interface Throttle {
  fails: number
  until: number // 이 시각(ms)까지 대기
}

const throttleKey = (phone: string) => `phoneLoginThrottle:${phone.replace(/\D/g, '')}`

function readThrottle(phone: string): Throttle {
  try {
    const raw = localStorage.getItem(throttleKey(phone))
    if (raw) return JSON.parse(raw) as Throttle
  } catch {
    /* 저장값이 깨졌으면 초기 상태로 본다 */
  }
  return { fails: 0, until: 0 }
}

function writeThrottle(phone: string, t: Throttle) {
  try {
    localStorage.setItem(throttleKey(phone), JSON.stringify(t))
  } catch {
    /* 저장 실패는 기능을 막지 않는다 */
  }
}

/** 대기 안내 문구 — 남은 시간을 분·초로 읽어준다 */
function waitText(sec: number): string {
  if (sec >= 60) {
    const m = Math.ceil(sec / 60)
    return `시도가 많아 잠시 제한되었습니다. ${m}분 후에 다시 시도하세요.`
  }
  return `시도가 많아 잠시 제한되었습니다. ${sec}초 후에 다시 시도하세요.`
}

function clearThrottle(phone: string) {
  try {
    localStorage.removeItem(throttleKey(phone))
  } catch {
    /* 무시 */
  }
}

export default function LoginPage() {
  const { signIn, signInWithToken, sendPhoneCode } = useAuth()
  // 파트너가 훨씬 많으므로 문자 로그인을 기본으로 연다. 관리자는 이메일 탭으로 넘어간다.
  const [mode, setMode] = useState<Mode>('phone')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)
  /** 남은 대기 시간(초) — 0이면 바로 시도할 수 있다 */
  const [wait, setWait] = useState(0)

  /**
   * 즉시 로그인 링크 처리 — 관리자가 발급한 토큰(?t=)이 있으면 바로 로그인한다.
   * 문자 한도 등으로 막힌 사용자를 하루 기다리게 하지 않기 위한 복구 경로다.
   * 토큰이 주소창·기록에 남지 않도록 사용 직후 URL 에서 지운다.
   */
  const [tokenBusy, setTokenBusy] = useState(false)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('t')
    if (!t) return
    window.history.replaceState(null, '', window.location.pathname)
    setTokenBusy(true)
    signInWithToken(t)
      .catch((e) => {
        const c = (e as { code?: string }).code || ''
        console.error('[login:token]', c, e)
        setErr(
          c === 'auth/invalid-custom-token' || c === 'auth/custom-token-mismatch'
            ? '로그인 링크가 올바르지 않습니다. 관리자에게 다시 요청해 주세요.'
            : '로그인 링크가 만료되었습니다. 관리자에게 다시 요청해 주세요.',
        )
      })
      .finally(() => setTokenBusy(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 번호를 바꿔 입력하면 그 번호의 저장된 대기 상태를 반영한다
  useEffect(() => {
    const t = readThrottle(phone)
    setWait(Math.max(0, Math.ceil((t.until - Date.now()) / 1000)))
  }, [phone])

  // 대기 시간 카운트다운
  useEffect(() => {
    if (wait <= 0) return
    const id = setInterval(() => setWait((n) => (n <= 1 ? 0 : n - 1)), 1000)
    return () => clearInterval(id)
  }, [wait])

  /** 문자 로그인 실패 1회 기록 — 5회를 넘기면 대기를 걸어 Firebase 차단에 닿지 않게 한다 */
  const registerPhoneFail = () => {
    const t = readThrottle(phone)
    const fails = t.fails + 1
    if (fails <= FREE_ATTEMPTS) {
      writeThrottle(phone, { fails, until: 0 })
      return 0
    }
    const idx = Math.min(fails - FREE_ATTEMPTS - 1, COOLDOWN_SECONDS.length - 1)
    const sec = COOLDOWN_SECONDS[idx]
    writeThrottle(phone, { fails, until: Date.now() + sec * 1000 })
    setWait(sec)
    return sec
  }

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setErr('')
    try {
      await fn()
    } catch (e) {
      const c = (e as { code?: string }).code || ''
      // 원인 추적용 — 화면 문구만으로는 부족한 경우가 있어 콘솔에 원본을 남긴다
      console.error('[login]', c, e)
      setErr(errorText(c, (e as Error).message))
    } finally {
      setBusy(false)
    }
  }

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return setErr('이메일과 비밀번호를 입력하세요.')
    run(() => signIn(email.trim(), password))
  }

  const submitPhone = (e: React.FormEvent) => {
    e.preventDefault()
    if (wait > 0) return setErr(waitText(wait))

    // 1단계 — 인증문자 발송
    if (!confirmation) {
      if (!phone.trim()) return setErr('휴대폰 번호를 입력하세요.')
      return run(async () => {
        try {
          const c = await sendPhoneCode(phone, RECAPTCHA_ID)
          setConfirmation(c)
          setCode('')
          // 문자가 오면 바로 입력할 수 있게 커서를 옮겨 준다
          setTimeout(() => codeRef.current?.focus(), 50)
        } catch (e2) {
          const sec = registerPhoneFail()
          if (sec > 0) throw new Error(waitText(sec))
          throw e2
        }
      })
    }
    // 2단계 — 6자리 확인
    if (code.trim().length < 6) return setErr('문자로 받은 6자리를 입력하세요.')
    run(async () => {
      try {
        const cred = await confirmation.confirm(code.trim())
        // 등록되지 않은 번호면 Firebase 가 새 계정을 만들어 버린다.
        // 그 계정은 staff_accounts 에 없어 권한 판정이 어긋나므로 즉시 지우고 되돌린다.
        if (!cred.user.email) {
          await cred.user.delete().catch(() => {})
          throw new Error(UNREGISTERED)
        }
        clearThrottle(phone) // 성공했으면 기록을 지운다
      } catch (e2) {
        if ((e2 as Error).message === UNREGISTERED) throw e2
        const sec = registerPhoneFail()
        if (sec > 0) throw new Error(waitText(sec))
        throw e2
      }
    })
  }

  const resetPhone = () => {
    setConfirmation(null)
    setCode('')
    setErr('')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0e1a] px-4">
      <form
        onSubmit={mode === 'phone' ? submitPhone : submitEmail}
        className="w-full max-w-[380px] rounded-[16px] border border-border bg-card p-8"
      >
        <div className="mb-6 flex items-center gap-2.5">
          <img src="/logo.png" alt="Settlement Manager" className="h-[38px] w-[38px] rounded-[10px] object-cover" />
          <div className="leading-tight">
            <div className="text-[16px] font-extrabold text-text-strong">Settlement</div>
            <div className="text-[10.5px] font-semibold tracking-[1.5px] text-[#5f7ba6]">MANAGER</div>
          </div>
        </div>

        <h1 className="mb-1 text-[18px] font-extrabold text-text-strong">로그인</h1>
        <p className="mb-4 text-[13px] text-[#94a3b8]">
          {mode === 'phone'
            ? '휴대폰 번호를 입력하면 인증문자를 보내드립니다.'
            : '계정 정보를 입력해주세요.'}
        </p>

        {/* 문자 / 이메일 선택 — 파트너는 왼쪽만 쓰면 되고, 관리자는 오른쪽으로 넘어간다 */}
        <div className="mb-4 flex gap-1 rounded-[10px] bg-input p-1">
          <ModeButton active={mode === 'phone'} onClick={() => { setMode('phone'); setErr('') }}>
            휴대폰
          </ModeButton>
          <ModeButton active={mode === 'email'} onClick={() => { setMode('email'); setErr('') }}>
            이메일
          </ModeButton>
        </div>

        {mode === 'phone' ? (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-semibold text-[#94a3b8]">휴대폰 번호</span>
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(phoneFmt(e.target.value))}
                disabled={!!confirmation}
                placeholder="010-1234-5678"
                autoComplete="tel"
                className="h-11 w-full rounded-[8px] bg-input border border-border px-3 text-[14px] text-input-text outline-none focus:border-primary disabled:opacity-60"
              />
            </label>
            {confirmation && (
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-semibold text-[#94a3b8]">인증번호 6자리</span>
                <input
                  ref={codeRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
                  autoComplete="one-time-code"
                  className="h-11 w-full rounded-[8px] bg-input border border-border px-3 text-[18px] font-bold tracking-[6px] text-input-text outline-none focus:border-primary"
                />
              </label>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-semibold text-[#94a3b8]">이메일</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                className="h-11 w-full rounded-[8px] bg-input border border-border px-3 text-[14px] text-input-text outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-semibold text-[#94a3b8]">비밀번호</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="h-11 w-full rounded-[8px] bg-input border border-border px-3 text-[14px] text-input-text outline-none focus:border-primary"
              />
            </label>
          </div>
        )}

        {err && <div className="mt-3 text-[12.5px] text-danger">{err}</div>}

        {tokenBusy && (
          <div className="mt-4 rounded-[8px] border border-primary/40 bg-primary/10 px-3 py-2 text-center text-[12.5px] text-primary">
            로그인 링크로 접속 중…
          </div>
        )}

        <button
          type="submit"
          disabled={busy || tokenBusy || (mode === 'phone' && wait > 0)}
          className="mt-5 h-11 w-full rounded-[10px] bg-primary text-[14px] font-bold text-white hover:brightness-110 disabled:opacity-60"
        >
          {busy
            ? mode === 'phone' && !confirmation
              ? '문자 보내는 중…'
              : '로그인 중…'
            : mode === 'phone' && wait > 0
              ? // 남은 시간을 버튼에 직접 보여줘 무엇을 기다리는지 알 수 있게 한다
                wait >= 60
                ? `${Math.floor(wait / 60)}분 ${wait % 60}초 후 가능`
                : `${wait}초 후 가능`
              : mode === 'phone'
                ? confirmation
                  ? '로그인'
                  : '인증문자 받기'
                : '로그인'}
        </button>

        {mode === 'phone' && confirmation && (
          <button
            type="button"
            onClick={resetPhone}
            className="mt-2 h-9 w-full rounded-[8px] text-[12.5px] font-semibold text-[#94a3b8] hover:bg-hover"
          >
            번호 다시 입력
          </button>
        )}

        {/* reCAPTCHA(보이지 않음) 붙는 자리 — 정상 접속에서는 아무것도 표시되지 않는다 */}
        <div id={RECAPTCHA_ID} />
      </form>
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 flex-1 rounded-[8px] text-[13px] font-bold ${
        active ? 'bg-primary text-white' : 'text-[#94a3b8] hover:bg-hover'
      }`}
    >
      {children}
    </button>
  )
}
