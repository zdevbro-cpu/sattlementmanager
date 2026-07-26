import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { verifyOwnerApi } from '../../lib/api'

const inputCls =
  'h-11 w-full rounded-[8px] bg-input border border-border px-3 text-[14px] text-input-text outline-none focus:border-primary'

/**
 * 기존 LAS 점주·점장 계정 개설 — 로그인 없이 접속하는 공개 페이지.
 *
 * LAS 고유번호 + 이름으로 기존 명단과 대조하고, 일치하면 그 사람의 등록 이메일로
 * 비밀번호 설정 링크를 보낸다. 이미 등록된 정보를 다시 입력받지 않는 것이 목적이다.
 *
 * 고유번호는 순차 채번이라 추측이 가능해, 대조만으로는 본인 확인이 되지 않는다.
 * 그래서 "메일을 받는 사람만" 계정을 열 수 있게 설계했다.
 * 결과 문구는 성공·실패를 구분하지 않는다 — 고유번호 존재 여부를 알려주지 않기 위함이다.
 */
export default function OwnerVerifyPage() {
  const [referralCode, setReferralCode] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<{ message: string; sentTo: string } | null>(null)

  const submit = async () => {
    const code = referralCode.trim().toUpperCase()
    if (!/^LAS\d{4}$/.test(code)) return setErr('LAS 고유번호 형식이 올바르지 않습니다. (예: LAS1000)')
    if (!name.trim()) return setErr('이름을 입력하세요.')
    setSaving(true)
    setErr('')
    try {
      setDone(await verifyOwnerApi(code, name.trim()))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0e1a] px-4">
        <div className="w-full max-w-[420px] rounded-[14px] border border-border bg-card p-6 text-center">
          <CheckCircle2 size={36} className="mx-auto mb-3 text-success" />
          <h1 className="text-[17px] font-extrabold text-text-strong">확인 요청이 접수되었습니다</h1>
          <p className="mt-2 text-[13px] text-[#94a3b8]">{done.message}</p>
          {done.sentTo && (
            <p className="mt-2 text-[12.5px] font-semibold text-[#c2cde0]">발송 대상: {done.sentTo}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0e1a] px-4 py-10">
      <div className="w-full max-w-[440px] rounded-[14px] border border-border bg-card p-6">
        <div className="mb-5 text-center">
          <img src="/logo.png" alt="Settlement Manager" className="mx-auto mb-2 h-10 w-10 rounded-[9px] object-cover" />
          <h1 className="text-[17px] font-extrabold text-text-strong">기존 점주·점장 계정 개설</h1>
          <p className="mt-1 text-[12.5px] text-[#94a3b8]">
            LAS 고유번호와 이름을 입력하시면 등록된 이메일로 비밀번호 설정 안내를 보내드립니다.
          </p>
        </div>

        <div className="space-y-3">
          <Field label="LAS 고유번호">
            <input
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
              className={inputCls}
              placeholder="LAS1000"
              autoCapitalize="characters"
            />
          </Field>
          <Field label="이름">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Field>
        </div>

        {err && <div className="mt-3 text-[12.5px] text-danger">{err}</div>}

        <button
          onClick={submit}
          disabled={saving}
          className="mt-5 h-11 w-full rounded-[10px] bg-primary text-[14px] font-bold text-white hover:brightness-110 disabled:opacity-60"
        >
          {saving ? '확인 중…' : '확인 요청'}
        </button>

        <p className="mt-4 text-center text-[12px] text-[#64748b]">
          고유번호가 없거나 신규 점주라면{' '}
          <a href="/owner-request" className="font-semibold text-primary hover:brightness-125">
            가입 요청
          </a>
          을 이용하세요.
        </p>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-[#94a3b8]">{label}</span>
      {children}
    </label>
  )
}
