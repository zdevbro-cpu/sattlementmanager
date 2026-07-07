import { useState } from 'react'
import type { PaymentInfo } from '../../types/contract'
import type { Sale } from '../../types/sales'
import { SALES_MANAGERS } from '../../data/mockSales'
import { useCodes } from '../../lib/codeStore'
import { createSale, updateSale } from './salesStore'
import { useSalesCategories } from './salesCategoryStore'
import PaymentEditor, { emptyPayment } from '../contract/PaymentEditor'
import DateTextInput from '../../components/ui/DateTextInput'
import { AlertTriangle, X } from 'lucide-react'

const inputCls =
  'h-[38px] w-full rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary'

export default function SalesRegisterModal({
  sale,
  onClose,
  onCreated,
}: {
  /** 수정 대상 매출 — 지정 시 해당 매출 값으로 초기화되고 저장 시 수정(PATCH) 처리된다. */
  sale?: Sale
  onClose: () => void
  onCreated: () => void
}) {
  const isEdit = !!sale
  const categories = useSalesCategories()
  const { orgs, businessUnits } = useCodes()
  const [org, setOrg] = useState(sale?.org ?? orgs[0] ?? '')
  const [date, setDate] = useState(sale?.date ?? '')
  const [category, setCategory] = useState(sale?.category ?? categories[0]?.name ?? '')
  const [businessUnit, setBusinessUnit] = useState(sale?.businessUnit ?? businessUnits[0] ?? '')
  const [buyer, setBuyer] = useState(sale?.buyer ?? '')
  const [manager, setManager] = useState(sale?.manager ?? '')
  const [memo, setMemo] = useState(sale?.memo ?? '')
  const [payment, setPayment] = useState<PaymentInfo>(sale?.payment ?? emptyPayment())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [warnMsg, setWarnMsg] = useState('')

  const submit = async () => {
    if (!date) return setErr('매출일을 입력하세요.')
    if (!buyer.trim()) return setErr('구매자를 입력하세요.')
    if (payment.totalAmount <= 0) return setErr('결재 금액을 입력하세요.')
    if (payment.cardInstallments.length > 1) {
      const empty = payment.cardInstallments.filter((c) => (c.amount || 0) <= 0).map((c) => c.seq)
      if (empty.length > 0) {
        return setWarnMsg(`카드 ${empty.join(', ')}회차 금액이 입력되지 않았습니다.\n해당 회차를 입력한 후 등록하세요.`)
      }
    }
    if (payment.cashInstallments.length > 1) {
      const empty = payment.cashInstallments.filter((c) => (c.amount || 0) <= 0).map((c) => c.seq)
      if (empty.length > 0) {
        return setWarnMsg(`현금 ${empty.join(', ')}회차 금액이 입력되지 않았습니다.\n해당 회차를 입력한 후 등록하세요.`)
      }
    }
    setSaving(true)
    setErr('')
    try {
      if (isEdit && sale) {
        await updateSale(sale.id, {
          date,
          category,
          org,
          businessUnit,
          buyer: buyer.trim(),
          manager,
          inputterOrg: sale.inputterOrg,
          inputterName: sale.inputterName,
          payment,
          documents: sale.documents,
          verified: sale.verified,
          memo,
          createdAt: sale.createdAt,
        })
      } else {
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
          <h2 className="text-[17px] font-extrabold text-text-strong">{isEdit ? '매출 수정' : '매출 등록'}</h2>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-white"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[74vh] overflow-y-auto">
          <section>
            <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">매출 정보</h3>
            <div className="grid grid-cols-6 gap-3">
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
                  {businessUnits.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </Field>
              <Field label="구매자">
                <input value={buyer} onChange={(e) => setBuyer(e.target.value)} className={inputCls} />
              </Field>
              <Field label="담당">
                <input
                  value={manager}
                  onChange={(e) => setManager(e.target.value)}
                  className={inputCls}
                  list="manager-list"
                />
                <datalist id="manager-list">
                  {SALES_MANAGERS.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </Field>
            </div>
            <div className="mt-3">
              <Field label="비고">
                <input value={memo} onChange={(e) => setMemo(e.target.value)} className={inputCls} />
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
            {saving ? '저장 중…' : isEdit ? '매출 수정' : '매출 등록'}
          </button>
        </div>
      </div>

      {warnMsg && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="w-full max-w-[380px] rounded-[14px] border border-border bg-card p-5 shadow-xl">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle size={18} className="text-warning" />
              <h3 className="text-[15px] font-extrabold text-text-strong">회차 금액 확인 필요</h3>
            </div>
            <p className="whitespace-pre-line text-[13px] text-[#c2cde0]">{warnMsg}</p>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setWarnMsg('')}
                className="h-9 rounded-[8px] bg-primary px-4 text-sm font-bold text-white hover:brightness-110"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
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
