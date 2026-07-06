import { useState } from 'react'
import type {
  ContractSnapshot,
  DriveDocument,
  PaymentInfo,
} from '../../types/contract'
import { BRANCHES, MANAGERS, RECRUITERS } from '../../data/mockContracts'
import { useCodes } from '../../lib/codeStore'
import { createContract } from './contractStore'
import PaymentEditor, { emptyPayment } from './PaymentEditor'
import { uploadToDrive } from '../../lib/api'
import DropZone from '../../components/ui/DropZone'

const inputCls =
  'h-[38px] w-full rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary'

const PAY_DAYS = Array.from({ length: 31 }, (_, i) => i + 1) // 1~31

interface FormState {
  org: string
  contractorName: string
  contractType: string
  contractDate: string
  deposit: number
  allowance: number
  allowancePayDay: number
  firstAllowancePayDate: string
  contractEndDate: string
  branch: string
  manager: string
  recruiter: string
  bankName: string
  accountNo: string
  accountOwner: string
  residentNo: string
  phone: string
  memo: string
}

export default function ContractRegisterModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const codes = useCodes()
  const [f, setF] = useState<FormState>({
    org: codes.orgs[0] ?? '',
    contractorName: '',
    contractType: codes.contractTypes[0] ?? '',
    contractDate: '',
    deposit: 0,
    allowance: 0,
    allowancePayDay: 25,
    firstAllowancePayDate: '',
    contractEndDate: '',
    branch: BRANCHES[0],
    manager: MANAGERS[0],
    recruiter: RECRUITERS[0],
    bankName: '',
    accountNo: '',
    accountOwner: '',
    residentNo: '',
    phone: '',
    memo: '',
  })
  const [payment, setPayment] = useState<PaymentInfo>(emptyPayment())
  const [contractFile, setContractFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF({ ...f, [k]: v })

  const payTotal = payment.totalAmount
  const depositMatched = payTotal === f.deposit

  const submit = async () => {
    if (!f.contractorName.trim()) return setErr('계약자명을 입력하세요.')
    if (!f.contractDate) return setErr('계약일을 입력하세요.')
    // 카드+현금 결재합계가 보증금과 일치해야 계약등록 가능
    if (!depositMatched)
      return setErr(
        `결재합계(카드+현금 ${payTotal.toLocaleString('ko-KR')}원)가 보증금(${f.deposit.toLocaleString('ko-KR')}원)과 일치해야 등록할 수 있습니다.`,
      )
    setSaving(true)
    setErr('')
    try {
      const documents: DriveDocument[] = []
      const snapshot: ContractSnapshot = {
        historyId: '',
        status: '신규', // 신규계약등록 페이지 — 상태는 항상 신규
        eventDate: f.contractDate,
        org: f.org,
        contractorName: f.contractorName.trim(),
        contractType: f.contractType,
        contractDate: f.contractDate,
        deposit: f.deposit,
        allowance: f.allowance,
        allowancePayDay: f.allowancePayDay,
        firstAllowancePayDate: f.firstAllowancePayDate,
        contractEndDate: f.contractEndDate,
        branch: f.branch,
        manager: f.manager,
        recruiter: f.recruiter,
        bankName: f.bankName,
        accountNo: f.accountNo,
        accountOwner: f.accountOwner.trim() || f.contractorName.trim(),
        residentNo: f.residentNo,
        phone: f.phone,
        payment,
        documents,
        memo: f.memo,
        createdAt: f.contractDate,
      }
      const created = await createContract(snapshot)

      if (contractFile) {
        try {
          await uploadToDrive(created.id, contractFile, '신규등록')
        } catch {
          /* 백엔드 미기동 시에도 계약 등록은 유지 */
        }
      }
      onCreated()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-6 overflow-y-auto">
      <div className="w-full max-w-[1000px] rounded-[14px] border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-[17px] font-extrabold text-text-strong">
            신규 계약 등록
          </h2>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-white">
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[74vh] overflow-y-auto">
          {/* ── 계약정보 (16필드 4×4, 상태는 신규 고정이라 미표시) ── */}
          <section>
            <SectionTitle>계약정보</SectionTitle>
            <div className="grid grid-cols-4 gap-3">
              {/* 1행 */}
              <Field label="소속">
                <select value={f.org} onChange={(e) => set('org', e.target.value)} className={inputCls}>
                  {codes.orgs.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </Field>
              <Field label="계약자">
                <input value={f.contractorName} onChange={(e) => set('contractorName', e.target.value)} className={inputCls} placeholder="계약자명" />
              </Field>
              <Field label="계약구분">
                <select value={f.contractType} onChange={(e) => set('contractType', e.target.value)} className={inputCls}>
                  {codes.contractTypes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="계약일">
                <input type="date" value={f.contractDate} onChange={(e) => set('contractDate', e.target.value)} className={inputCls} />
              </Field>

              {/* 2행 */}
              <Field label="보증금">
                <NumInput value={f.deposit} onChange={(v) => set('deposit', v)} />
              </Field>
              <Field label="수당">
                <NumInput value={f.allowance} onChange={(v) => set('allowance', v)} />
              </Field>
              <Field label="수당지급일 (매월)">
                <select value={f.allowancePayDay} onChange={(e) => set('allowancePayDay', Number(e.target.value))} className={inputCls}>
                  {PAY_DAYS.map((d) => (
                    <option key={d} value={d}>
                      {d}일
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="최초수당지급일">
                <input type="date" value={f.firstAllowancePayDate} onChange={(e) => set('firstAllowancePayDate', e.target.value)} className={inputCls} />
              </Field>

              {/* 3행 — 계좌정보 · 주민등록번호 · 전화번호 */}
              <Field label="은행명">
                <input value={f.bankName} onChange={(e) => set('bankName', e.target.value)} className={inputCls} placeholder="예: 국민은행" />
              </Field>
              <Field label="계좌번호">
                <input value={f.accountNo} onChange={(e) => set('accountNo', e.target.value)} className={inputCls} placeholder="계좌번호" />
              </Field>
              <Field label="예금주">
                <input value={f.accountOwner} onChange={(e) => set('accountOwner', e.target.value)} className={inputCls} placeholder="미입력 시 계약자명" />
              </Field>
              <Field label="주민등록번호">
                <input value={f.residentNo} onChange={(e) => set('residentNo', e.target.value)} className={inputCls} placeholder="예: 900101-1******" />
              </Field>
              <Field label="전화번호">
                <input value={f.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} placeholder="예: 010-1234-5678" />
              </Field>

              {/* 4행 */}
              <Field label="계약종료일">
                <input type="date" value={f.contractEndDate} onChange={(e) => set('contractEndDate', e.target.value)} className={inputCls} />
              </Field>
              <Field label="지점명">
                <select value={f.branch} onChange={(e) => set('branch', e.target.value)} className={inputCls}>
                  {BRANCHES.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </Field>
              <Field label="관리자">
                <select value={f.manager} onChange={(e) => set('manager', e.target.value)} className={inputCls}>
                  {MANAGERS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Field>
              <Field label="유치자">
                <select value={f.recruiter} onChange={(e) => set('recruiter', e.target.value)} className={inputCls}>
                  {RECRUITERS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="mt-3">
              <Field label="비고">
                <input value={f.memo} onChange={(e) => set('memo', e.target.value)} className={inputCls} placeholder="변경 사유/메모" />
              </Field>
            </div>
          </section>

          {/* ── 결재정보 ── */}
          <section>
            <div className="mb-2.5 flex items-center justify-between">
              <SectionTitle>결재정보</SectionTitle>
              <span
                className="text-[12px] font-semibold"
                style={{ color: depositMatched ? '#16a34a' : '#ef4444' }}
              >
                결재합계 {payTotal.toLocaleString('ko-KR')}원 / 보증금{' '}
                {f.deposit.toLocaleString('ko-KR')}원{' '}
                {depositMatched ? '✓ 일치' : '✗ 불일치'}
              </span>
            </div>
            <PaymentEditor value={payment} onChange={setPayment} />
          </section>

          {/* ── 계약서 등록 ── */}
          <section>
            <SectionTitle>계약서 등록 (Google Drive 저장)</SectionTitle>
            <DropZone
              onFile={setContractFile}
              accept=".pdf,image/*"
              hint="계약서 스캔본(PDF/이미지) — 드래그드롭 또는 탐색기 선택"
            >
              {contractFile ? (
                <div className="text-[13px] text-[#c2cde0]">
                  📎 {contractFile.name}{' '}
                  <span className="text-[#64748b]">(다시 등록하려면 클릭/드롭)</span>
                </div>
              ) : (
                <div className="text-[12.5px] text-[#94a3b8]">
                  <span className="text-primary font-bold">클릭(탐색기)</span> 또는{' '}
                  <span className="text-primary font-bold">드래그드롭</span>으로 계약서 등록
                </div>
              )}
            </DropZone>
          </section>

          {err && <div className="text-[13px] text-danger">{err}</div>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="h-10 rounded-[10px] border border-border px-4 text-sm font-semibold text-[#c2cde0] hover:bg-hover">
            취소
          </button>
          <button
            onClick={submit}
            disabled={saving || !depositMatched}
            title={depositMatched ? '' : '결재합계와 보증금이 일치해야 등록 가능'}
            className="h-10 rounded-[10px] bg-primary px-5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-60"
          >
            {saving ? '저장 중…' : '계약 등록'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">
      {children}
    </h3>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-semibold text-[#94a3b8]">
        {label}
      </span>
      {children}
    </label>
  )
}

function NumInput({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
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
