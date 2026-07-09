import { useState } from 'react'
import {
  APPOINTMENT_STATUSES,
  INCOME_TYPES,
  normalizeIncomeType,
  type Appointment,
  type AppointmentStatus,
  type IncomeType,
} from '../../types/appointment'
import { updateAppointment } from './appointmentStore'
import InstitutionSelect from './InstitutionSelect'
import { usePositionSalaries } from './positionSalaryStore'
import { todayIso } from '../../lib/format'
import DateTextInput from '../../components/ui/DateTextInput'

const inputCls =
  'h-9 w-full rounded-[8px] bg-input border border-border px-2.5 text-[13px] text-input-text outline-none focus:border-primary'

/**
 * 임용계약 상세 — 수정 폼.
 * 현재 값을 기준으로 편집하고, 변경된 항목은 자동으로 변경이력에 기록된다.
 */
export default function AppointmentEditForm({
  base,
  onSaved,
  onCancel,
}: {
  base: Appointment
  onSaved: () => void
  onCancel: () => void
}) {
  const positionSalaries = usePositionSalaries()
  const [name, setName] = useState(base.name)
  const [phone, setPhone] = useState(base.phone)
  const [position, setPosition] = useState(base.position)
  const [salary, setSalary] = useState(base.salary)
  // 소득구분 — 근로소득 ↔ 사업소득 상호 변경 가능
  const [insuranceType, setInsuranceType] = useState<IncomeType>(
    normalizeIncomeType(base.insuranceType),
  )

  /** 직급 변경 시 시스템관리(직급별 기본급여)의 연봉으로 자동 연동 */
  const onPositionChange = (p: string) => {
    setPosition(p)
    const match = positionSalaries.find((x) => x.position === p)
    if (match) setSalary(match.basic)
  }
  const [contractDate, setContractDate] = useState(base.contractDate)
  const [payoutDate, setPayoutDate] = useState(base.payoutDate)
  const [endDate, setEndDate] = useState(base.endDate)
  const [status, setStatus] = useState<AppointmentStatus>(base.status)
  const [bankName, setBankName] = useState(base.bankName)
  const [accountNo, setAccountNo] = useState(base.accountNo)
  const [accountOwner, setAccountOwner] = useState(base.accountOwner)
  const [editedAt, setEditedAt] = useState(() => todayIso())
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    if (!name.trim()) return setErr('계약자명을 입력하세요.')
    if (!editedAt) return setErr('변경일을 입력하세요.')
    setSaving(true)
    setErr('')
    try {
      await updateAppointment(
        base.id,
        {
          name: name.trim(),
          phone,
          position,
          salary,
          insuranceType,
          contractDate,
          payoutDate,
          endDate,
          status,
          bankName,
          accountNo: accountNo.trim(),
          accountOwner: accountOwner.trim() || name.trim(),
        },
        { memo: memo.trim(), editedAt },
      )
      onSaved()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-[10px] border border-primary/40 bg-input/30 p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="계약자명">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="연락처">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
        </Field>
        <Field label="직급">
          <select value={position} onChange={(e) => onPositionChange(e.target.value)} className={inputCls}>
            {!positionSalaries.some((x) => x.position === position) && position && (
              <option value={position}>{position}</option>
            )}
            {positionSalaries.map((x) => (
              <option key={x.position}>{x.position}</option>
            ))}
          </select>
        </Field>
        <Field label="소득구분">
          <select
            value={insuranceType}
            onChange={(e) => setInsuranceType(e.target.value as IncomeType)}
            className={inputCls}
          >
            {INCOME_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="연봉(원)">
          <NumInput value={salary} onChange={setSalary} />
        </Field>
        <Field label="계약일">
          <DateTextInput value={contractDate} onChange={setContractDate} className={inputCls} />
        </Field>
        <Field label="급여일">
          <DateTextInput value={payoutDate} onChange={setPayoutDate} className={inputCls} />
        </Field>
        <Field label="계약종료일">
          <DateTextInput value={endDate} onChange={setEndDate} className={inputCls} />
        </Field>
        <Field label="계약상태">
          <select value={status} onChange={(e) => setStatus(e.target.value as AppointmentStatus)} className={inputCls}>
            {APPOINTMENT_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="은행/기관">
          <InstitutionSelect value={bankName} onChange={setBankName} className={inputCls} />
        </Field>
        <Field label="계좌번호">
          <input value={accountNo} onChange={(e) => setAccountNo(e.target.value)} className={inputCls} />
        </Field>
        <Field label="예금주">
          <input value={accountOwner} onChange={(e) => setAccountOwner(e.target.value)} className={inputCls} placeholder="미입력 시 계약자명" />
        </Field>
        <Field label="변경일">
          <DateTextInput value={editedAt} onChange={setEditedAt} className={inputCls} />
        </Field>
      </div>
      <Field label="변경 사유/메모">
        <input value={memo} onChange={(e) => setMemo(e.target.value)} className={inputCls} placeholder="예: 직급 변경, 연봉 조정" />
      </Field>

      {err && <div className="text-[12px] text-danger">{err}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="h-9 rounded-[8px] border border-border px-3 text-[13px] font-semibold text-[#c2cde0] hover:bg-hover">
          취소
        </button>
        <button onClick={save} disabled={saving} className="h-9 rounded-[8px] bg-primary px-4 text-[13px] font-bold text-white hover:brightness-110 disabled:opacity-60">
          {saving ? '저장 중…' : '수정 저장'}
        </button>
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
