import { useEffect, useState } from 'react'
import {
  type AppointmentDoc,
  type AppointmentType,
  type IncomeType,
} from '../../types/appointment'
import { APPOINTMENT_TYPES } from '../../data/mockAppointments'
import { createAppointment, nextContractNo } from './appointmentStore'
import InstitutionSelect from './InstitutionSelect'
import { getBanks } from './bankStore'
import DocUploadList from './DocUploadList'
import { usePositionSalaries } from './positionSalaryStore'
import { todayIso } from '../../lib/format'
const inputCls =
  'h-[38px] w-full rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary'

function addMonths(iso: string, m: number): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return ''
  d.setMonth(d.getMonth() + m)
  return d.toISOString().slice(0, 10)
}
function addYears(iso: string, y: number): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return ''
  d.setFullYear(d.getFullYear() + y)
  // 하루 전(계약 종료일 관례)
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}
function rrnFmt(v: string): string {
  const n = v.replace(/\D/g, '').slice(0, 13)
  return n.length > 6 ? `${n.slice(0, 6)}-${n.slice(6)}` : n
}
function phoneFmt(v: string): string {
  const n = v.replace(/\D/g, '').slice(0, 11)
  if (n.length < 4) return n
  if (n.length < 8) return `${n.slice(0, 3)}-${n.slice(3)}`
  return `${n.slice(0, 3)}-${n.slice(3, 7)}-${n.slice(7)}`
}

export default function AppointmentRegisterModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const positionSalaries = usePositionSalaries()
  const [TODAY] = useState(() => todayIso())
  const [type, setType] = useState<AppointmentType>(APPOINTMENT_TYPES[0])
  const [contractNo, setContractNo] = useState('')

  useEffect(() => {
    nextContractNo(TODAY).then(setContractNo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [ref, setRef] = useState('')
  const [name, setName] = useState('')
  const [residentNo, setResidentNo] = useState('')
  const [phone, setPhone] = useState('')
  const [position, setPosition] = useState('')
  const [salary, setSalary] = useState(0)
  const [activity, setActivity] = useState(0)
  const insuranceType: IncomeType = '사업소득'
  const [contractDate, setContractDate] = useState(TODAY)
  const [payoutDate, setPayoutDate] = useState(
    addMonths(TODAY, APPOINTMENT_TYPES[0].payoutMonths),
  )
  const workStartDate = TODAY
  const reportStartDate = TODAY
  const [endDate, setEndDate] = useState(
    addYears(TODAY, APPOINTMENT_TYPES[0].contractYears),
  )
  const [manualPayout, setManualPayout] = useState(false)
  const [manualEnd, setManualEnd] = useState(false)
  const [bankName, setBankName] = useState(getBanks()[0])
  const [accountNo, setAccountNo] = useState('')
  const [accountOwner, setAccountOwner] = useState('')
  const [documents, setDocuments] = useState<AppointmentDoc[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const changeType = (id: string) => {
    const t = APPOINTMENT_TYPES.find((x) => x.id === id) ?? APPOINTMENT_TYPES[0]
    setType(t)
    setPosition('')
    setSalary(0)
    setActivity(0)
    if (!manualPayout) setPayoutDate(addMonths(contractDate, t.payoutMonths))
    if (!manualEnd) setEndDate(addYears(contractDate, t.contractYears))
  }
  const changeContractDate = (v: string) => {
    setContractDate(v)
    nextContractNo(v).then(setContractNo)
    if (!manualPayout) setPayoutDate(addMonths(v, type.payoutMonths))
    if (!manualEnd) setEndDate(addYears(v, type.contractYears))
  }
  const changePosition = (p: string) => {
    setPosition(p)
    // 시스템관리 "직급별 기본급여" 테이블에서 연봉 자동표시 (이후 수동 수정 가능)
    const salaryRow = positionSalaries.find((r) => r.position === p)
    if (salaryRow) setSalary(salaryRow.basic)
    const rule = type.positions.find((r) => r.position === p)
    if (rule) setActivity(rule.activity)
  }

  const submit = async () => {
    if (!name.trim()) return setErr('계약자명을 입력하세요.')
    if (!residentNo.trim()) return setErr('주민번호를 입력하세요.')
    if (!phone.trim()) return setErr('연락처를 입력하세요.')
    if (!position) return setErr('직급을 선택하세요.')
    setSaving(true)
    setErr('')
    try {
      await createAppointment({
        contractNo,
        name: name.trim(),
        typeName: type.name,
        ref: ref.trim(),
        residentNo,
        phone,
        position,
        salary,
        activity,
        insuranceType,
        contractDate,
        payoutDate,
        workStartDate,
        reportStartDate,
        endDate,
        bankName,
        accountNo: accountNo.trim(),
        accountOwner: accountOwner.trim() || name.trim(),
        status: '정상운영',
        createdAt: contractDate,
        documents,
      })
      onCreated()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-6 overflow-y-auto">
      <div className="w-full max-w-[960px] rounded-[14px] border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-[17px] font-extrabold text-text-strong">임용계약 등록</h2>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-white">✕</button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[74vh] overflow-y-auto">
          {/* A. 기본정보 */}
          <section>
            <SectionTitle>기본정보</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <Field label="계약명">
                <select value={type.id} onChange={(e) => changeType(e.target.value)} className={inputCls}>
                  {APPOINTMENT_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="계약번호">
                <input value={contractNo} onChange={(e) => setContractNo(e.target.value)} className={inputCls} />
              </Field>
            </div>
          </section>

          {/* B. 계약정보 */}
          <section>
            <SectionTitle>계약정보</SectionTitle>
            <div className="grid grid-cols-3 gap-3">
              <Field label="지점명">
                <input value={ref} onChange={(e) => setRef(e.target.value)} className={inputCls} placeholder="지점명 입력" />
              </Field>
              <Field label="계약자명">
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
              </Field>
              <Field label="주민번호">
                <input value={residentNo} onChange={(e) => setResidentNo(rrnFmt(e.target.value))} className={inputCls} placeholder="000000-0000000" maxLength={14} />
              </Field>
              <Field label="연락처">
                <input value={phone} onChange={(e) => setPhone(phoneFmt(e.target.value))} className={inputCls} placeholder="010-0000-0000" maxLength={13} />
              </Field>
              <Field label="직급">
                <select value={position} onChange={(e) => changePosition(e.target.value)} className={inputCls}>
                  <option value="">-- 선택 --</option>
                  {positionSalaries.map((r) => (
                    <option key={r.position} value={r.position}>{r.position}</option>
                  ))}
                </select>
              </Field>
              <Field label="연봉(원)">
                <NumInput value={salary} onChange={setSalary} />
              </Field>
              <Field label="계약일">
                <input type="date" value={contractDate} onChange={(e) => changeContractDate(e.target.value)} className={inputCls} />
              </Field>
              <Field label="급여일">
                <input type="date" value={payoutDate} onChange={(e) => { setManualPayout(true); setPayoutDate(e.target.value) }} className={inputCls} />
              </Field>
              <Field label="계약종료일">
                <input type="date" value={endDate} onChange={(e) => { setManualEnd(true); setEndDate(e.target.value) }} className={inputCls} />
              </Field>
            </div>
          </section>

          {/* C. 계좌정보 */}
          <section>
            <SectionTitle>계좌정보</SectionTitle>
            <div className="grid grid-cols-3 gap-3">
              <Field label="은행/기관">
                <InstitutionSelect value={bankName} onChange={setBankName} className={inputCls} />
              </Field>
              <Field label="계좌번호">
                <input value={accountNo} onChange={(e) => setAccountNo(e.target.value)} className={inputCls} />
              </Field>
              <Field label="예금주">
                <input value={accountOwner} onChange={(e) => setAccountOwner(e.target.value)} className={inputCls} placeholder="미입력 시 계약자명" />
              </Field>
            </div>
          </section>

          {/* D. 제출서류 등록 */}
          <section>
            <SectionTitle>제출서류 등록 (Google Drive 저장)</SectionTitle>
            <DocUploadList
              refId={contractNo}
              value={documents}
              onChange={setDocuments}
              uploadedAt={contractDate}
            />
          </section>

          {err && <div className="text-[13px] text-danger">{err}</div>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="h-10 rounded-[10px] border border-border px-4 text-sm font-semibold text-[#c2cde0] hover:bg-hover">취소</button>
          <button onClick={submit} disabled={saving} className="h-10 rounded-[10px] bg-primary px-5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-60">
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">{children}</h3>
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
