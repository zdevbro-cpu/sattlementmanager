import { useEffect, useState } from 'react'
import type { Contract, ContractSnapshot, PaymentInfo } from '../../types/contract'
import { EMPTY_FILTER } from '../../types/contract'
import { useCodes } from '../../lib/codeStore'
import { correctHistory, listContracts } from './contractStore'
import { BRANCHES, MANAGERS, RECRUITERS } from '../../data/mockContracts'
import PaymentEditor from './PaymentEditor'
import DateTextInput from '../../components/ui/DateTextInput'
import { comma, phoneFmt, residentNoFmt } from '../../lib/format'

const inputCls =
  'h-9 w-full rounded-[8px] bg-input border border-border px-2.5 text-[13px] text-input-text outline-none focus:border-primary'
const PAY_DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

/**
 * 계약상세 — 오타수정 폼.
 * 상태 변경/이력 추가와 달리 새 이력행을 남기지 않고, 지정된 스냅샷(historyId)의
 * 입력값 자체를 그대로 고친다 (상태·변경일은 감사 이벤트라 수정 대상에서 제외).
 */
export default function HistoryCorrectForm({
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
  const [org, setOrg] = useState(base.org)
  const [businessUnit, setBusinessUnit] = useState(base.businessUnit)
  const [contractorName, setContractorName] = useState(base.contractorName)
  const [contractNo, setContractNo] = useState(base.contractNo ?? '')
  const [contractType, setContractType] = useState(base.contractType)
  const [parentContractId, setParentContractId] = useState(base.parentContractId ?? '')
  const [contractDate, setContractDate] = useState(base.contractDate)
  const [leaders, setLeaders] = useState<Contract[]>([])

  useEffect(() => {
    let alive = true
    listContracts(EMPTY_FILTER).then((list) => {
      if (alive) setLeaders(list.filter((c) => c.current.contractType === 'LAS-On파트장' && c.id !== contractId))
    })
    return () => {
      alive = false
    }
  }, [contractId])
  const [deposit, setDeposit] = useState(base.deposit)
  const [allowance, setAllowance] = useState(base.allowance)
  const [allowancePayDay, setAllowancePayDay] = useState(base.allowancePayDay || 25)
  const [firstAllowancePayDate, setFirstAllowancePayDate] = useState(base.firstAllowancePayDate)
  const [contractEndDate, setContractEndDate] = useState(base.contractEndDate)
  const [phone, setPhone] = useState(base.phone)
  const [residentNo, setResidentNo] = useState(base.residentNo)
  const [branch, setBranch] = useState(base.branch)
  const [manager, setManager] = useState(base.manager)
  const [recruiter, setRecruiter] = useState(base.recruiter)
  const [bankName, setBankName] = useState(base.bankName)
  const [accountNo, setAccountNo] = useState(base.accountNo)
  const [accountOwner, setAccountOwner] = useState(base.accountOwner)
  const [recipientName, setRecipientName] = useState(base.recipientName ?? '')
  const [recipientBankName, setRecipientBankName] = useState(base.recipientBankName ?? '')
  const [recipientAccountNo, setRecipientAccountNo] = useState(base.recipientAccountNo ?? '')
  const [recipientAccountOwner, setRecipientAccountOwner] = useState(base.recipientAccountOwner ?? '')
  const [recipientResidentNo, setRecipientResidentNo] = useState(base.recipientResidentNo ?? '')
  const [memo, setMemo] = useState(base.memo ?? '')
  const [payment, setPayment] = useState<PaymentInfo>(base.payment)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    if (!contractorName.trim()) return setErr('계약자명을 입력하세요.')
    if (!contractDate) return setErr('계약일을 입력하세요.')
    setSaving(true)
    setErr('')
    try {
      const snap: ContractSnapshot = {
        ...base,
        org,
        businessUnit,
        contractorName: contractorName.trim(),
        contractNo: contractNo.trim(),
        contractType,
        parentContractId: contractType === 'LAS-On파트너' ? parentContractId : '',
        contractDate,
        deposit,
        allowance,
        allowancePayDay,
        firstAllowancePayDate,
        contractEndDate,
        phone,
        residentNo,
        branch,
        manager,
        recruiter,
        bankName,
        accountNo,
        accountOwner,
        recipientName: recipientName.trim(),
        recipientBankName,
        recipientAccountNo,
        recipientAccountOwner: recipientAccountOwner.trim() || recipientName.trim(),
        recipientResidentNo,
        memo,
        payment,
      }
      await correctHistory(contractId, base.historyId, snap)
      onSaved()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-[10px] border border-warning/40 bg-input/30 p-3 space-y-3">
      <div className="grid grid-cols-5 gap-2.5">
        <Field label="소속">
          <select value={org} onChange={(e) => setOrg(e.target.value)} className={inputCls}>
            {codes.orgs.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </Field>
        <Field label="사업부">
          <select value={businessUnit} onChange={(e) => setBusinessUnit(e.target.value)} className={inputCls}>
            {codes.businessUnits.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </Field>
        <Field label="계약자명">
          <input value={contractorName} onChange={(e) => setContractorName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="계약구분">
          <select value={contractType} onChange={(e) => setContractType(e.target.value)} className={inputCls}>
            {codes.contractTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="계약일">
          <DateTextInput value={contractDate} onChange={setContractDate} className={inputCls} />
        </Field>

        <Field label="보증금">
          <NumInput value={deposit} onChange={setDeposit} />
        </Field>
        <Field label="수당">
          <NumInput value={allowance} onChange={setAllowance} />
        </Field>
        <Field label="수당지급기준일">
          <DateTextInput value={firstAllowancePayDate} onChange={setFirstAllowancePayDate} className={inputCls} />
        </Field>
        <Field label="수당지급일(매월)">
          <select value={allowancePayDay} onChange={(e) => setAllowancePayDay(Number(e.target.value))} className={inputCls}>
            {PAY_DAYS.map((d) => (
              <option key={d} value={d}>
                {d}일
              </option>
            ))}
          </select>
        </Field>
        <Field label="종료일">
          <DateTextInput value={contractEndDate} onChange={setContractEndDate} className={inputCls} />
        </Field>

        <Field label="연락처">
          <input value={phone} onChange={(e) => setPhone(phoneFmt(e.target.value))} className={inputCls} />
        </Field>
        <Field label="주민번호">
          <input value={residentNo} onChange={(e) => setResidentNo(residentNoFmt(e.target.value))} className={inputCls} />
        </Field>
        <Field label="지점명">
          <input value={branch} onChange={(e) => setBranch(e.target.value)} className={inputCls} list="branch-list-correct" />
          <datalist id="branch-list-correct">
            {BRANCHES.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </Field>
        <Field label="관리자">
          <input value={manager} onChange={(e) => setManager(e.target.value)} className={inputCls} list="manager-list-correct" />
          <datalist id="manager-list-correct">
            {MANAGERS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
        <Field label="유치자">
          <input value={recruiter} onChange={(e) => setRecruiter(e.target.value)} className={inputCls} list="recruiter-list-correct" />
          <datalist id="recruiter-list-correct">
            {RECRUITERS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>

        <Field label="은행명">
          <input value={bankName} onChange={(e) => setBankName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="계좌번호">
          <input value={accountNo} onChange={(e) => setAccountNo(e.target.value)} className={inputCls} />
        </Field>
        <Field label="예금주">
          <input value={accountOwner} onChange={(e) => setAccountOwner(e.target.value)} className={inputCls} />
        </Field>
        <Field label="계약번호">
          <input value={contractNo} onChange={(e) => setContractNo(e.target.value)} className={inputCls} />
        </Field>
        {contractType === 'LAS-On파트너' && (
          <Field label="소속 파트장">
            <select
              value={parentContractId}
              onChange={(e) => {
                const id = e.target.value
                setParentContractId(id)
                const leader = leaders.find((l) => l.id === id)
                if (leader) {
                  // 소속 파트장 선택 시 수당 수령인 기본값을 파트장 본인 정보(이름/계좌)로 자동입력
                  setRecipientName(leader.current.contractorName)
                  setRecipientBankName(leader.current.bankName || '')
                  setRecipientAccountNo(leader.current.accountNo || '')
                  setRecipientAccountOwner(leader.current.accountOwner || '')
                  setRecipientResidentNo(leader.current.residentNo || '')
                }
              }}
              className={inputCls}
            >
              <option value="">선택 안 함</option>
              {leaders.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.current.contractorName} ({l.id})
                </option>
              ))}
            </select>
          </Field>
        )}
        {(contractType === 'LAS-On파트너' || contractType === 'LAS-On파트장') && (
          <>
            <Field label="수령인">
              <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className={inputCls} placeholder="수당 받을 사람" />
            </Field>
            <Field label="수령인 은행명">
              <input value={recipientBankName} onChange={(e) => setRecipientBankName(e.target.value)} className={inputCls} />
            </Field>
            <Field label="수령인 계좌번호">
              <input value={recipientAccountNo} onChange={(e) => setRecipientAccountNo(e.target.value)} className={inputCls} />
            </Field>
            <Field label="수령인 예금주">
              <input value={recipientAccountOwner} onChange={(e) => setRecipientAccountOwner(e.target.value)} className={inputCls} placeholder="미입력 시 수령인명" />
            </Field>
            <Field label="수령인 주민번호">
              <input value={recipientResidentNo} onChange={(e) => setRecipientResidentNo(residentNoFmt(e.target.value))} className={inputCls} />
            </Field>
          </>
        )}
      </div>
      <Field label="비고">
        <input value={memo} onChange={(e) => setMemo(e.target.value)} className={inputCls} />
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

      {err && <div className="text-[12px] text-danger">{err}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="h-9 rounded-[8px] border border-border px-3 text-[13px] font-semibold text-[#c2cde0] hover:bg-hover">
          취소
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="h-9 rounded-[8px] bg-warning px-4 text-[13px] font-bold text-white hover:brightness-110 disabled:opacity-60"
        >
          {saving ? '저장 중…' : '오타수정 저장'}
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
