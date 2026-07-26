import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { phoneFmt } from '../../lib/format'
import type { StoreRole } from '../../types/staff'
import { submitStaffRequest } from './staffStore'

const inputCls =
  'h-11 w-full rounded-[8px] bg-input border border-border px-3 text-[14px] text-input-text outline-none focus:border-primary'

/**
 * 점주/점장 가입 요청 — 로그인 없이 접속 가능한 공개 페이지 (App.tsx Gate에서 인증 우회 처리).
 *
 * 섭외 조직(파트너/파트장)과 매장 운영(점주/점장)은 별도로 운영되므로 신청 폼을 나눈다.
 * 파트너/파트장 요청은 기존 /staff-request 페이지가 그대로 담당한다.
 * 겸직(파트장이면서 점주 등)은 공개 폼에서 스스로 고르게 하지 않고, 승인 후 관리자가 부여한다.
 */
export default function OwnerRequestPage() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<StoreRole>('store_owner')
  const [businessUnit, setBusinessUnit] = useState('')
  const [branch, setBranch] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  const submit = async () => {
    if (!name.trim()) return setErr('이름을 입력하세요.')
    if (!phone.trim()) return setErr('전화번호를 입력하세요.')
    if (!email.trim()) return setErr('이메일을 입력하세요.')
    if (!businessUnit.trim()) return setErr('사업부를 입력하세요.')
    setSaving(true)
    setErr('')
    try {
      await submitStaffRequest({
        name: name.trim(),
        phone,
        email: email.trim(),
        role,
        part: '',
        businessUnit: businessUnit.trim(),
        branch: branch.trim(),
      })
      setDone(true)
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
          <h1 className="text-[17px] font-extrabold text-text-strong">가입 요청이 접수되었습니다</h1>
          <p className="mt-2 text-[13px] text-[#94a3b8]">
            관리자 승인 후 입력하신 이메일로 비밀번호 설정 안내를 보내드립니다.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0e1a] px-4 py-10">
      <div className="w-full max-w-[440px] rounded-[14px] border border-border bg-card p-6">
        <div className="mb-5 text-center">
          <img src="/logo.png" alt="Settlement Manager" className="mx-auto mb-2 h-10 w-10 rounded-[9px] object-cover" />
          <h1 className="text-[17px] font-extrabold text-text-strong">점주 · 점장 가입 요청</h1>
          <p className="mt-1 text-[12.5px] text-[#94a3b8]">
            매장 운영 계정을 신청합니다. 승인 후 이메일로 안내드립니다.
          </p>
        </div>

        <div className="space-y-3">
          <Field label="이름">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Field>
          <Field label="전화번호">
            <input
              value={phone}
              onChange={(e) => setPhone(phoneFmt(e.target.value))}
              className={inputCls}
              placeholder="010-1234-5678"
            />
          </Field>
          <Field label="이메일 (로그인 아이디)">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="example@company.com"
            />
          </Field>
          <Field label="희망 역할">
            <select value={role} onChange={(e) => setRole(e.target.value as StoreRole)} className={inputCls}>
              <option value="store_owner">점주</option>
              <option value="store_manager">점장</option>
            </select>
          </Field>
          <Field label="사업부">
            {/* 로그인 없이 열리는 공개 페이지라 사업부 목록을 내려주지 않는다.
                직접 입력받고, 최종 값은 승인 시 관리자가 확정한다. */}
            <input
              value={businessUnit}
              onChange={(e) => setBusinessUnit(e.target.value)}
              className={inputCls}
              placeholder="예: 교육사업부"
            />
          </Field>
          <Field label="지점">
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className={inputCls}
              placeholder="소속 지점 (모르면 비워두세요)"
            />
          </Field>
        </div>

        {err && <div className="mt-3 text-[12.5px] text-danger">{err}</div>}

        <button
          onClick={submit}
          disabled={saving}
          className="mt-5 h-11 w-full rounded-[10px] bg-primary text-[14px] font-bold text-white hover:brightness-110 disabled:opacity-60"
        >
          {saving ? '제출 중…' : '가입 요청'}
        </button>
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
