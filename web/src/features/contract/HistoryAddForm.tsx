import { useState } from 'react'
import { Paperclip } from 'lucide-react'
import type { ContractSnapshot, PaymentInfo } from '../../types/contract'
import { useCodes } from '../../lib/codeStore'
import { addHistory } from './contractStore'
import PaymentEditor from './PaymentEditor'
import DateTextInput from '../../components/ui/DateTextInput'
import DropZone from '../../components/ui/DropZone'
import { uploadToDrive } from '../../lib/api'
import { comma } from '../../lib/format'

const inputCls =
  'h-9 w-full rounded-[8px] bg-input border border-border px-2.5 text-[13px] text-input-text outline-none focus:border-primary'
const PAY_DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

/**
 * 계약상세 — 상태 변경 / 이력 추가 폼.
 * 현재 계약 내용을 기준값으로 채우고, 상태(증액/양수/양도/해지/폐기 등)를 바꿔
 * 새 이력 스냅샷을 추가한다. (히스토리 관리)
 */
export default function HistoryAddForm({
  contractId,
  base,
  onSaved,
  onCancel,
}: {
  contractId: string
  base: ContractSnapshot
  onSaved: () => void
  onCancel: () => void
}) {
  const codes = useCodes()
  const [status, setStatus] = useState<string>(
    codes.statuses.find((s) => s !== '신규') ?? codes.statuses[0] ?? '증액',
  )
  const [eventDate, setEventDate] = useState('')
  const [deposit, setDeposit] = useState(base.deposit)
  const [allowance, setAllowance] = useState(base.allowance)
  const [allowancePayDay, setAllowancePayDay] = useState(base.allowancePayDay || 25)
  const [contractEndDate, setContractEndDate] = useState(base.contractEndDate)
  const [memo, setMemo] = useState('')
  const [payment, setPayment] = useState<PaymentInfo>(base.payment)
  const [contractFile, setContractFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    if (!eventDate) return setErr('변경일(이벤트 발생일)을 입력하세요.')
    setSaving(true)
    setErr('')
    try {
      const snap: ContractSnapshot = {
        ...base,
        historyId: '',
        status,
        eventDate,
        deposit,
        allowance,
        allowancePayDay,
        contractEndDate,
        payment,
        memo,
        createdAt: eventDate,
        documents: [],
      }
      const updated = await addHistory(contractId, snap)
      if (contractFile) {
        try {
          await uploadToDrive(contractId, contractFile, status, updated.current.historyId)
        } catch {
          /* Drive 업로드 실패해도 이력 추가는 유지 */
        }
      }
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
        <Field label="변경 상태">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
            {codes.statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="변경일">
          <DateTextInput value={eventDate} onChange={setEventDate} className={inputCls} />
        </Field>
        <Field label="보증금">
          <NumInput value={deposit} onChange={setDeposit} />
        </Field>
        <Field label="수당">
          <NumInput value={allowance} onChange={setAllowance} />
        </Field>
        <Field label="수당지급일 (매월)">
          <select value={allowancePayDay} onChange={(e) => setAllowancePayDay(Number(e.target.value))} className={inputCls}>
            {PAY_DAYS.map((d) => (
              <option key={d} value={d}>
                {d}일
              </option>
            ))}
          </select>
        </Field>
        <Field label="계약종료일">
          <DateTextInput value={contractEndDate} onChange={setContractEndDate} className={inputCls} />
        </Field>
      </div>
      <Field label="변경 사유/메모">
        <input value={memo} onChange={(e) => setMemo(e.target.value)} className={inputCls} placeholder="예: 보증금 증액" />
      </Field>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[12px] font-bold text-text-strong">결재정보</span>
          <span className="text-[11.5px] text-[#94a3b8]">
            결재합계 {comma(payment.totalAmount)}원 / 보증금 {comma(deposit)}원
          </span>
        </div>
        <PaymentEditor value={payment} onChange={setPayment} />
      </div>

      <div>
        <div className="mb-1.5 text-[12px] font-bold text-text-strong">계약서 등록 (Google Drive 저장)</div>
        <DropZone
          onFile={setContractFile}
          accept=".pdf,image/*"
          hint="증액/양수·양도/해지 등 변경 계약서 — 드래그드롭 또는 탐색기 선택"
        >
          {contractFile ? (
            <div className="inline-flex items-center gap-1.5 text-[13px] text-[#c2cde0]">
              <Paperclip size={13} /> {contractFile.name}{' '}
              <span className="text-[#64748b]">(다시 등록하려면 클릭/드롭)</span>
            </div>
          ) : (
            <div className="text-[12.5px] text-[#94a3b8]">
              <span className="text-primary font-bold">클릭(탐색기)</span> 또는{' '}
              <span className="text-primary font-bold">드래그드롭</span>으로 계약서 등록
            </div>
          )}
        </DropZone>
      </div>

      {err && <div className="text-[12px] text-danger">{err}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="h-9 rounded-[8px] border border-border px-3 text-[13px] font-semibold text-[#c2cde0] hover:bg-hover">
          취소
        </button>
        <button onClick={save} disabled={saving} className="h-9 rounded-[8px] bg-primary px-4 text-[13px] font-bold text-white hover:brightness-110 disabled:opacity-60">
          {saving ? '저장 중…' : '이력 추가'}
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
