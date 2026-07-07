import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { PaymentInfo } from '../../types/contract'
import { BUSINESS_UNITS, SALES_MANAGERS } from '../../data/mockSales'
import { useCodes } from '../../lib/codeStore'
import { createSale } from './salesStore'
import { useSalesCategories } from './salesCategoryStore'
import PaymentEditor, { emptyPayment } from '../contract/PaymentEditor'
import { useAuth } from '../auth/AuthContext'
import DateTextInput from '../../components/ui/DateTextInput'
import { Camera, CheckCircle2, ChevronLeft } from 'lucide-react'

const inputCls =
  'h-11 w-full rounded-[8px] bg-input border border-border px-3 text-[14px] text-input-text outline-none focus:border-primary'

/** 매출등록 전용 모바일 화면 — 사이드바/메뉴 없이 매출 등록 폼만 단독으로 표시한다. */
export default function MobileSalesRegisterPage() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const categories = useSalesCategories()
  const { orgs } = useCodes()
  const [org, setOrg] = useState(orgs[0] ?? '')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [category, setCategory] = useState(categories[0]?.name ?? '')
  const [businessUnit, setBusinessUnit] = useState(BUSINESS_UNITS[0])
  const [buyer, setBuyer] = useState('')
  const [manager, setManager] = useState('')
  const [memo, setMemo] = useState('')
  const [payment, setPayment] = useState<PaymentInfo>(emptyPayment())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [doneMsg, setDoneMsg] = useState('')

  const reset = () => {
    setBuyer('')
    setMemo('')
    setPayment(emptyPayment())
  }

  const submit = async () => {
    if (!date) return setErr('매출일을 입력하세요.')
    if (!buyer.trim()) return setErr('구매자를 입력하세요.')
    if (payment.totalAmount <= 0) return setErr('결재 금액을 입력하세요.')
    setSaving(true)
    setErr('')
    setDoneMsg('')
    try {
      await createSale({
        date,
        category,
        org,
        businessUnit,
        buyer: buyer.trim(),
        manager,
        inputterOrg: '본사',
        inputterName: '관리자',
        payment,
        documents: [],
        verified: false,
        memo,
        createdAt: date,
      })
      setDoneMsg(`${buyer.trim()} 매출 등록 완료`)
      reset()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] px-4 py-5">
      <div className="mb-3">
        <button onClick={() => navigate('/')} className="inline-flex items-center gap-0.5 text-[12px] text-[#94a3b8] hover:text-white">
          <ChevronLeft size={14} /> 처음으로
        </button>
      </div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-1.5 text-[18px] font-extrabold text-text-strong"><Camera size={18} /> 매출 등록</h1>
        <div className="flex items-center gap-2">
          <span className="max-w-[140px] truncate text-[11px] text-[#64748b]">{user?.email}</span>
          <button onClick={() => signOut()} className="text-[11px] font-semibold text-[#94a3b8] hover:text-white">
            로그아웃
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <section className="rounded-[14px] border border-border bg-card p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="소속">
              <select value={org} onChange={(e) => setOrg(e.target.value)} className={inputCls}>
                {orgs.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </Field>
            <Field label="매출일">
              <DateTextInput value={date} onChange={setDate} className={inputCls} />
            </Field>
            <Field label="매출구분">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                {categories.map((c) => (
                  <option key={c.name}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="사업부">
              <select value={businessUnit} onChange={(e) => setBusinessUnit(e.target.value)} className={inputCls}>
                {BUSINESS_UNITS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </Field>
            <Field label="담당">
              <input value={manager} onChange={(e) => setManager(e.target.value)} className={inputCls} list="manager-list" />
              <datalist id="manager-list">
                {SALES_MANAGERS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </Field>
          </div>
          <div className="mt-3">
            <Field label="구매자">
              <input value={buyer} onChange={(e) => setBuyer(e.target.value)} className={inputCls} placeholder="구매자명" />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="비고">
              <input value={memo} onChange={(e) => setMemo(e.target.value)} className={inputCls} placeholder="예: 독서지도사 수강료" />
            </Field>
          </div>
        </section>

        <section className="rounded-[14px] border border-border bg-card p-4">
          <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">결재정보 (카메라 촬영 → OCR 자동추출)</h3>
          <PaymentEditor value={payment} onChange={setPayment} variant="mobile" />
        </section>

        {err && <div className="text-[13px] text-danger">{err}</div>}
        {doneMsg && <div className="flex items-center gap-1 text-[13px] font-bold text-success"><CheckCircle2 size={14} /> {doneMsg}</div>}

        <button
          onClick={submit}
          disabled={saving}
          className="h-12 w-full rounded-[10px] bg-primary text-[15px] font-bold text-white hover:brightness-110 disabled:opacity-60"
        >
          {saving ? '저장 중…' : '매출 등록'}
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
