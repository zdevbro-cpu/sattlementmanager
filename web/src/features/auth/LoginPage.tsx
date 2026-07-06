import { useState } from 'react'
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
    default:
      return '로그인에 실패했습니다.'
  }
}

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return setErr('이메일과 비밀번호를 입력하세요.')
    setBusy(true)
    setErr('')
    try {
      await signIn(email.trim(), password)
    } catch (e) {
      const code = (e as { code?: string }).code || ''
      setErr(friendlyError(code))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0e1a] px-4">
      <form
        onSubmit={submit}
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
        <p className="mb-5 text-[13px] text-[#94a3b8]">계정 정보를 입력해주세요.</p>

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

        {err && <div className="mt-3 text-[12.5px] text-danger">{err}</div>}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 h-11 w-full rounded-[10px] bg-primary text-[14px] font-bold text-white hover:brightness-110 disabled:opacity-60"
        >
          {busy ? '로그인 중…' : '로그인'}
        </button>
      </form>
    </div>
  )
}
