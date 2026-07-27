import { useRef, useState } from 'react'
import type { ConfirmationResult } from 'firebase/auth'
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
    default:
      return '로그인에 실패했습니다.'
  }
}

/** 문자 인증에서 등록되지 않은 번호는 새 계정을 만들어버린다 — 그 상황을 사람 말로 알린다 */
const UNREGISTERED = '등록되지 않은 번호입니다. 관리자에게 문의해주세요.'

type Mode = 'phone' | 'email'

const RECAPTCHA_ID = 'recaptcha-container'

export default function LoginPage() {
  const { signIn, sendPhoneCode } = useAuth()
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

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setErr('')
    try {
      await fn()
    } catch (e) {
      const c = (e as { code?: string }).code || ''
      // toE164 가 던지는 메시지는 코드가 없으므로 그대로 보여준다
      setErr(c ? friendlyError(c) : (e as Error).message || '로그인에 실패했습니다.')
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
    // 1단계 — 인증문자 발송
    if (!confirmation) {
      if (!phone.trim()) return setErr('휴대폰 번호를 입력하세요.')
      return run(async () => {
        const c = await sendPhoneCode(phone, RECAPTCHA_ID)
        setConfirmation(c)
        setCode('')
        // 문자가 오면 바로 입력할 수 있게 커서를 옮겨 준다
        setTimeout(() => codeRef.current?.focus(), 50)
      })
    }
    // 2단계 — 6자리 확인
    if (code.trim().length < 6) return setErr('문자로 받은 6자리를 입력하세요.')
    run(async () => {
      const cred = await confirmation.confirm(code.trim())
      // 등록되지 않은 번호면 Firebase 가 새 계정을 만들어 버린다.
      // 그 계정은 staff_accounts 에 없어 권한 판정이 어긋나므로 즉시 지우고 되돌린다.
      if (!cred.user.email) {
        await cred.user.delete().catch(() => {})
        throw new Error(UNREGISTERED)
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
                onChange={(e) => setPhone(e.target.value)}
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

        <button
          type="submit"
          disabled={busy}
          className="mt-5 h-11 w-full rounded-[10px] bg-primary text-[14px] font-bold text-white hover:brightness-110 disabled:opacity-60"
        >
          {busy
            ? mode === 'phone' && !confirmation
              ? '문자 보내는 중…'
              : '로그인 중…'
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
