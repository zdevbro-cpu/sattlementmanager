import { useState } from 'react'
import { X } from 'lucide-react'
import { phoneFmt } from '../../lib/format'
import { createShipment } from './deliveryStore'
import { useCodes } from '../../lib/codeStore'

const inputCls =
  'h-9 w-full rounded-[8px] bg-input border border-border px-2.5 text-[13px] text-input-text outline-none focus:border-primary'

/** 신규 배송 수동 등록 — 교재신청 없이 전화·방문 접수 등으로 들어온 배송건을 단독 등록한다 */
export default function DeliveryCreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const codes = useCodes()
  const [f, setF] = useState({
    recipientName: '',
    phone: '',
    address: '',
    deliveryMemo: '',
    book1Name: '',
    book2Name: '',
    carrier: '',
    trackingNo: '',
    memo: '',
    // 배송지가 있어도 "나중에 보내달라"는 요청이면 추후배송으로 접수한다.
    // 배송지가 비면 서버가 무조건 추후배송으로 넣는다(목록확정 조건을 못 맞추므로).
    status: '접수',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v })

  const submit = async () => {
    if (!f.recipientName.trim()) return setErr('수령인을 입력하세요.')
    setSaving(true)
    setErr('')
    try {
      await createShipment(f)
      onCreated()
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-[560px] rounded-[14px] border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-[15px] font-extrabold text-text-strong">신규 배송 등록</h2>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          <p className="mb-3 text-[12px] text-[#94a3b8]">
            전화·방문 접수 등 교재신청서 없이 접수된 건을 배송관리에 직접 등록합니다. 수령인·연락처·주소가 모두
            채워지면 &apos;접수&apos;, 하나라도 비어 있으면 배송지 미확정으로 보고 &apos;추후배송&apos;으로 등록됩니다.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="수령인">
              <input value={f.recipientName} onChange={(e) => set('recipientName', e.target.value)} className={inputCls} />
            </Field>
            <Field label="연락처">
              <input value={f.phone} onChange={(e) => set('phone', phoneFmt(e.target.value))} className={inputCls} />
            </Field>
            <div className="col-span-2">
              <Field label="주소">
                <input value={f.address} onChange={(e) => set('address', e.target.value)} className={inputCls} />
              </Field>
            </div>
            <Field label="배송메모">
              <input value={f.deliveryMemo} onChange={(e) => set('deliveryMemo', e.target.value)} className={inputCls} />
            </Field>
            <div />
            <Field label="교재1">
              <input value={f.book1Name} onChange={(e) => set('book1Name', e.target.value)} className={inputCls} />
            </Field>
            <Field label="교재2">
              <input value={f.book2Name} onChange={(e) => set('book2Name', e.target.value)} className={inputCls} />
            </Field>
            <Field label="접수 상태">
              <select value={f.status} onChange={(e) => set('status', e.target.value)} className={inputCls}>
                <option value="접수">접수 (바로 배송 진행)</option>
                <option value="추후배송">추후배송 (배송 시점 미정)</option>
              </select>
            </Field>
            <Field label="택배사">
              {/* 자유 입력이면 표기가 조금만 달라도 배송조회 링크·자동추적 매핑이 깨진다 — 공통코드에서 고른다 */}
              <select value={f.carrier} onChange={(e) => set('carrier', e.target.value)} className={inputCls}>
                <option value="">선택 안 함</option>
                {codes.carriers.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="송장번호">
              <input value={f.trackingNo} onChange={(e) => set('trackingNo', e.target.value)} className={inputCls} />
            </Field>
            <div className="col-span-2">
              <Field label="비고">
                <input value={f.memo} onChange={(e) => set('memo', e.target.value)} className={inputCls} />
              </Field>
            </div>
          </div>
          {err && <div className="mt-3 text-[12.5px] text-danger">{err}</div>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button onClick={onClose} className="h-9 rounded-[8px] border border-border px-4 text-[13px] font-bold text-[#c2cde0] hover:bg-hover">
            취소
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="h-9 rounded-[8px] bg-primary px-4 text-[13px] font-bold text-white hover:brightness-110 disabled:opacity-60"
          >
            {saving ? '등록 중…' : '등록'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-[#94a3b8]">{label}</span>
      {children}
    </label>
  )
}
