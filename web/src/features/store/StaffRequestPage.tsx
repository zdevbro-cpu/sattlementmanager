import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { phoneFmt } from '../../lib/format'
import type { StaffRole } from '../../types/staff'
import { submitStaffRequest } from './staffStore'
import { EMPTY_FILTER } from '../../types/contract'
import { listContracts } from '../contract/contractStore'
import { useCodes } from '../../lib/codeStore'

const inputCls =
  'h-11 w-full rounded-[8px] bg-input border border-border px-3 text-[14px] text-input-text outline-none focus:border-primary'

/**
 * 파트너 가입 요청 — 로그인 없이 접속 가능한 공개 페이지 (App.tsx Gate에서 인증 우회 처리).
 * 본인이 이름/전화번호/이메일/희망역할/희망소속을 제출하면 관리자 승인 후 비밀번호 설정 이메일을 받는다.
 */
export default function StaffRequestPage() {
  const codes = useCodes()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [businessUnit, setBusinessUnit] = useState('')
  const [role, setRole] = useState<StaffRole>('field_partner')
  const [part, setPart] = useState('')
  const [partLeaders, setPartLeaders] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    let alive = true
    listContracts(EMPTY_FILTER)
      .then((list) => {
        if (alive) {
          setPartLeaders(
            list
              .filter((c) => c.current.contractType === 'LAS-On파트장' && c.current.status !== '폐기')
              .map((c) => c.current.contractorName),
          )
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const submit = async () => {
    if (!name.trim()) return setErr('이름을 입력하세요.')
    if (!phone.trim()) return setErr('전화번호를 입력하세요.')
    if (!email.trim()) return setErr('이메일을 입력하세요.')
    setSaving(true)
    setErr('')
    try {
      await submitStaffRequest({ name: name.trim(), phone, email: email.trim(), businessUnit, role, part })
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
          <h1 className="text-[17px] font-extrabold text-text-strong">파트너 가입 요청</h1>
          <p className="mt-1 text-[12.5px] text-[#94a3b8]">
            현장 파트장/파트너 계정을 신청합니다. 승인 후 이메일로 안내드립니다.
          </p>
        </div>

        <div className="space-y-3">
          <Field label="이름">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Field>
          <Field label="전화번호">
            <input value={phone} onChange={(e) => setPhone(phoneFmt(e.target.value))} className={inputCls} placeholder="010-1234-5678" />
          </Field>
          <Field label="이메일 (로그인 아이디)">
            <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="example@company.com" />
          </Field>
          <Field label="사업부">
            <select value={businessUnit} onChange={(e) => setBusinessUnit(e.target.value)} className={inputCls}>
              <option value="">선택 안 함</option>
              {codes.businessUnits.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>
          <Field label="소속 파트">
            <select value={part} onChange={(e) => setPart(e.target.value)} className={inputCls}>
              <option value="">선택 안 함</option>
              {partLeaders.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="희망 역할">
            <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)} className={inputCls}>
              <option value="field_partner">파트너</option>
              <option value="part_leader">파트장</option>
            </select>
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
