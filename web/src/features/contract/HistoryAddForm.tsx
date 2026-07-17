import { useEffect, useState } from 'react'
import { Paperclip, Search } from 'lucide-react'
import { EMPTY_FILTER, type Contract, type ContractSnapshot, type PaymentInfo } from '../../types/contract'
import { useCodes } from '../../lib/codeStore'
import { addHistory, listContracts, transferIn } from './contractStore'
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
  const [contractNo, setContractNo] = useState(base.contractNo ?? '')
  const [deposit, setDeposit] = useState(base.deposit)
  const [allowance, setAllowance] = useState(base.allowance)
  const [allowancePayDay, setAllowancePayDay] = useState(base.allowancePayDay || 25)
  const [contractEndDate, setContractEndDate] = useState(base.contractEndDate)
  const [memo, setMemo] = useState('')
  const [payment, setPayment] = useState<PaymentInfo>(base.payment)
  const [contractFile, setContractFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // LAS-On파트너 소속 파트장 변경 — 파트장 교체도 이력(감사 기록)으로 남긴다
  const isPartner = base.contractType === 'LAS-On파트너'
  const [parentContractId, setParentContractId] = useState(base.parentContractId ?? '')
  const [recipientName, setRecipientName] = useState(base.recipientName ?? '')
  const [recipientBankName, setRecipientBankName] = useState(base.recipientBankName ?? '')
  const [recipientAccountNo, setRecipientAccountNo] = useState(base.recipientAccountNo ?? '')
  const [recipientAccountOwner, setRecipientAccountOwner] = useState(base.recipientAccountOwner ?? '')
  const [recipientResidentNo, setRecipientResidentNo] = useState(base.recipientResidentNo ?? '')
  const [leaders, setLeaders] = useState<Contract[]>([])

  useEffect(() => {
    if (!isPartner) return
    let alive = true
    listContracts(EMPTY_FILTER).then((list) => {
      if (alive)
        setLeaders(
          list.filter(
            (c) => c.current.contractType === 'LAS-On파트장' && c.current.status !== '폐기' && c.id !== contractId,
          ),
        )
    })
    return () => {
      alive = false
    }
  }, [isPartner, contractId])

  const selectLeader = (id: string) => {
    setParentContractId(id)
    const leader = leaders.find((l) => l.id === id)
    if (leader) {
      // 소속 파트장 변경 시 수당 수령인 기본값도 새 파트장 본인 정보로 갱신
      setRecipientName(leader.current.contractorName)
      setRecipientBankName(leader.current.bankName || '')
      setRecipientAccountNo(leader.current.accountNo || '')
      setRecipientAccountOwner(leader.current.accountOwner || '')
      setRecipientResidentNo(leader.current.residentNo || '')
    }
  }

  // 양수 처리 — 양도인 검색/선택 (동명이인 대비 주민번호·전화번호로 확인 후 확정)
  const [transferorQuery, setTransferorQuery] = useState('')
  const [transferorCandidates, setTransferorCandidates] = useState<Contract[]>([])
  const [selectedTransferor, setSelectedTransferor] = useState<Contract | null>(null)
  const [transferAmount, setTransferAmount] = useState(0)
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  // 계약자명 입력 시 자동 검색 (디바운스)
  useEffect(() => {
    if (selectedTransferor || !transferorQuery.trim()) {
      setSearched(false)
      setTransferorCandidates([])
      return
    }
    const timer = setTimeout(() => {
      searchTransferor()
    }, 350)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferorQuery])

  const searchTransferor = async () => {
    if (!transferorQuery.trim()) return
    setSearching(true)
    setSearched(true)
    try {
      const list = await listContracts({ ...EMPTY_FILTER, keyword: transferorQuery.trim() })
      setTransferorCandidates(list.filter((c) => c.id !== contractId))
    } finally {
      setSearching(false)
    }
  }

  const selectTransferor = (c: Contract) => {
    setSelectedTransferor(c)
    setTransferAmount(c.current.deposit)
    setTransferorCandidates([])
  }

  const cancelTransferor = () => {
    setSelectedTransferor(null)
    setTransferorCandidates([])
    setTransferorQuery('')
    setSearched(false)
  }

  const save = async () => {
    if (!eventDate) return setErr('변경일(이벤트 발생일)을 입력하세요.')
    if (status === '양수' && !selectedTransferor) return setErr('양도인을 검색해서 선택하세요.')
    setSaving(true)
    setErr('')
    try {
      const snap: ContractSnapshot = {
        ...base,
        historyId: '',
        status,
        eventDate,
        contractNo,
        deposit,
        allowance,
        allowancePayDay,
        contractEndDate,
        payment,
        memo,
        createdAt: eventDate,
        documents: [],
        ...(isPartner
          ? {
              parentContractId,
              recipientName,
              recipientBankName,
              recipientAccountNo,
              recipientAccountOwner,
              recipientResidentNo,
            }
          : {}),
      }
      const updated =
        status === '양수' && selectedTransferor
          ? await transferIn(contractId, selectedTransferor.id, transferAmount, snap)
          : await addHistory(contractId, snap)
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
      <div className="grid grid-cols-3 gap-2.5">
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
        <Field label="계약번호">
          <input value={contractNo} onChange={(e) => setContractNo(e.target.value)} className={inputCls} placeholder="계약번호" />
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
        {isPartner && (
          <Field label="소속 파트장 변경">
            <select value={parentContractId} onChange={(e) => selectLeader(e.target.value)} className={inputCls}>
              <option value="">선택 안 함</option>
              {leaders.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.current.contractorName} ({l.id})
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <Field label="변경 사유/메모">
        <input value={memo} onChange={(e) => setMemo(e.target.value)} className={inputCls} placeholder="예: 보증금 증액" />
      </Field>

      {status === '양수' && (
        <div className="rounded-[10px] border border-primary/40 bg-input/40 p-3 space-y-2.5">
          <div className="text-[12.5px] font-bold text-text-strong">양도인 지정</div>
          {!selectedTransferor && (
            <>
              <div className="flex gap-2">
                <input
                  value={transferorQuery}
                  onChange={(e) => setTransferorQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchTransferor()}
                  placeholder="양도인 계약자명 입력"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={searchTransferor}
                  disabled={searching}
                  className="h-9 shrink-0 inline-flex items-center gap-1 rounded-[8px] border border-border px-3 text-[12.5px] font-semibold text-[#c2cde0] hover:bg-hover disabled:opacity-60"
                >
                  <Search size={13} /> 검색
                </button>
              </div>
              {transferorCandidates.length > 0 && (
                <div className="rounded-[8px] border border-border divide-y divide-border max-h-40 overflow-y-auto">
                  {transferorCandidates.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => selectTransferor(c)}
                      className="w-full text-left px-3 py-2 text-[12.5px] hover:bg-hover flex items-center justify-between gap-2"
                    >
                      <span className="font-semibold text-text-strong">
                        {c.current.contractorName}{' '}
                        <span className="font-normal text-[#94a3b8]">({c.current.contractType})</span>
                      </span>
                      <span className="text-[#94a3b8] whitespace-nowrap">
                        주민번호 : {c.current.residentNo || '-'}    연락처 : {c.current.phone || '-'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {searched && !searching && transferorCandidates.length === 0 && (
                <div className="text-[12px] text-[#94a3b8]">검색된 계약자가 없습니다.</div>
              )}
            </>
          )}
          {selectedTransferor && (
            <div className="rounded-[8px] border border-primary/40 bg-primary/5 p-2.5 text-[12.5px] space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-text-strong">{selectedTransferor.current.contractorName}</span>
                <button type="button" onClick={cancelTransferor} className="text-[11.5px] text-danger hover:underline">
                  선택 취소
                </button>
              </div>
              <div className="text-[#94a3b8]">주민번호 : {selectedTransferor.current.residentNo || '-'}</div>
              <div className="text-[#94a3b8]">연락처 : {selectedTransferor.current.phone || '-'}</div>
              <div className="text-[#94a3b8]">
                계약구분: {selectedTransferor.current.contractType} · 보증금 {comma(selectedTransferor.current.deposit)}원
              </div>
            </div>
          )}
          <Field label="양수받는 금액 (일부양도 시 수정)">
            <NumInput value={transferAmount} onChange={setTransferAmount} />
          </Field>
        </div>
      )}

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
