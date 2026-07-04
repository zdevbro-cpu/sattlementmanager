import { useState } from 'react'
import {
  PAYOUT_STATUSES,
  PAYOUT_TYPES,
  type PayoutCategory,
  type PayoutStatus,
} from '../../types/payout'
import { createPayout } from './payoutStore'
import InstitutionSelect from '../appointment/InstitutionSelect'

const TODAY = '2026-07-04'
const inputCls =
  'h-[38px] w-full rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary'

export default function PayoutRegisterModal({
  category,
  onClose,
  onCreated,
}: {
  category: PayoutCategory
  onClose: () => void
  onCreated: () => void
}) {
  const types = PAYOUT_TYPES[category]
  const [payDate, setPayDate] = useState(TODAY)
  const [payee, setPayee] = useState('')
  const [type, setType] = useState(types[0])
  const [amount, setAmount] = useState(0)
  const [bankName, setBankName] = useState('')
  const [accountNo, setAccountNo] = useState('')
  const [status, setStatus] = useState<PayoutStatus>('예정')
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = () => {
    if (!payee.trim()) return setErr('수령인을 입력하세요.')
    if (!amount) return setErr('금액을 입력하세요.')
    setSaving(true)
    setErr('')
    try {
      createPayout({
        category,
        payDate,
        payee: payee.trim(),
        type,
        amount,
        status,
        bankName,
        accountNo: accountNo.trim(),
        memo: memo.trim(),
      })
      onCreated()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-6 overflow-y-auto">
      <div className="w-full max-w-[720px] rounded-[14px] border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-[17px] font-extrabold text-text-strong">
            {category} 지급 등록
          </h2>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-white">
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="지급일">
              <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="수령인">
              <input value={payee} onChange={(e) => setPayee(e.target.value)} className={inputCls} placeholder="수령인 이름/기관" />
            </Field>
            <Field label="지급종류">
              <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
                {types.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="금액(원)">
              <NumInput value={amount} onChange={setAmount} />
            </Field>
            <Field label="은행/기관">
              <InstitutionSelect value={bankName} onChange={setBankName} className={inputCls} />
            </Field>
            <Field label="계좌번호">
              <input value={accountNo} onChange={(e) => setAccountNo(e.target.value)} className={inputCls} />
            </Field>
            <Field label="상태">
              <select value={status} onChange={(e) => setStatus(e.target.value as PayoutStatus)} className={inputCls}>
                {PAYOUT_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="비고">
              <input value={memo} onChange={(e) => setMemo(e.target.value)} className={inputCls} placeholder="메모" />
            </Field>
          </div>
          {err && <div className="text-[13px] text-danger">{err}</div>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="h-10 rounded-[10px] border border-border px-4 text-sm font-semibold text-[#c2cde0] hover:bg-hover">
            취소
          </button>
          <button onClick={submit} disabled={saving} className="h-10 rounded-[10px] bg-primary px-5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-60">
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-semibold text-[#94a3b8]">{label}</span>
      {children}
    </label>
  )
}

function NumInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      inputMode="numeric"
      value={value ? value.toLocaleString('ko-KR') : ''}
      onChange={(e) => onChange(Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
      className={`${inputCls} text-right tabular`}
      placeholder="0"
    />
  )
}
