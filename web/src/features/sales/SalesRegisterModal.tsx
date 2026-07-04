import { useState } from 'react'
import type { PaymentInfo } from '../../types/contract'
import { BUSINESS_UNITS, SALES_MANAGERS } from '../../data/mockSales'
import { createSale } from './salesStore'
import { useSalesCategories } from './salesCategoryStore'
import PaymentEditor, { emptyPayment } from '../contract/PaymentEditor'

const inputCls =
  'h-[38px] w-full rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary'

export default function SalesRegisterModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const categories = useSalesCategories()
  const [date, setDate] = useState('')
  const [category, setCategory] = useState(categories[0]?.name ?? '')
  const [businessUnit, setBusinessUnit] = useState(BUSINESS_UNITS[0])
  const [buyer, setBuyer] = useState('')
  const [manager, setManager] = useState(SALES_MANAGERS[0])
  const [memo, setMemo] = useState('')
  const [payment, setPayment] = useState<PaymentInfo>(emptyPayment())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = () => {
    if (!date) return setErr('매출일을 입력하세요.')
    if (!buyer.trim()) return setErr('구매자를 입력하세요.')
    if (payment.totalAmount <= 0) return setErr('결재 금액을 입력하세요.')
    setSaving(true)
    setErr('')
    try {
      createSale({
        date,
        category,
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
      onCreated()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-6 overflow-y-auto">
      <div className="w-full max-w-[1000px] rounded-[14px] border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-[17px] font-extrabold text-text-strong">매출 등록</h2>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-white">✕</button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[74vh] overflow-y-auto">
          <section>
            <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">매출 정보</h3>
            <div className="grid grid-cols-4 gap-3">
              <Field label="매출일">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
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
              <Field label="구매자">
                <input value={buyer} onChange={(e) => setBuyer(e.target.value)} className={inputCls} placeholder="구매자명" />
              </Field>
              <Field label="담당">
                <select value={manager} onChange={(e) => setManager(e.target.value)} className={inputCls}>
                  {SALES_MANAGERS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="mt-3">
              <Field label="비고">
                <input value={memo} onChange={(e) => setMemo(e.target.value)} className={inputCls} placeholder="예: 독서지도사 수강료" />
              </Field>
            </div>
          </section>

          <section>
            <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">
              결재정보 (카드/현금 · 모바일 촬영 OCR / PC 입력)
            </h3>
            <PaymentEditor value={payment} onChange={setPayment} />
          </section>

          {err && <div className="text-[13px] text-danger">{err}</div>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="h-10 rounded-[10px] border border-border px-4 text-sm font-semibold text-[#c2cde0] hover:bg-hover">
            취소
          </button>
          <button onClick={submit} disabled={saving} className="h-10 rounded-[10px] bg-primary px-5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-60">
            {saving ? '저장 중…' : '매출 등록'}
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
