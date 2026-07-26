import { useEffect, useState } from 'react'
import { Pencil, X } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import { phoneFmt } from '../../lib/format'
import {
  SHIPMENT_TRANSITIONS,
  type Shipment,
  type ShipmentStatus,
} from '../../types/delivery'
import { getShipment, setShipmentStatus, updateShipment } from './deliveryStore'
import { shipmentStatusTone } from './statusTone'

const inputCls =
  'h-9 w-full rounded-[8px] bg-input border border-border px-2.5 text-[13px] text-input-text outline-none focus:border-primary'

/** 사유(메모)를 반드시 받아야 하는 전이 — 배송완료를 되돌리는 예외 복구 경로 */
function needsMemo(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return from === '배송완료' && to === '배송중'
}

export default function DeliveryDetailDrawer({
  shipmentId,
  onClose,
  onChanged,
}: {
  shipmentId: string
  onClose: () => void
  onChanged?: () => void
}) {
  const [s, setS] = useState<Shipment | null>(null)
  const [tick, setTick] = useState(0)
  const [editOpen, setEditOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    getShipment(shipmentId)
      .then((v) => {
        if (alive) setS(v)
      })
      .catch((e) => {
        if (alive) setErr((e as Error).message)
      })
    return () => {
      alive = false
    }
  }, [shipmentId, tick])

  if (!s) return null

  const refresh = () => {
    setTick((n) => n + 1)
    onChanged?.()
  }

  const nextStatuses = SHIPMENT_TRANSITIONS[s.status] ?? []

  const changeStatus = async (to: ShipmentStatus) => {
    let memo = ''
    if (needsMemo(s.status, to)) {
      const input = prompt(`'${s.status}' → '${to}' 변경 사유를 입력하세요. (필수)`)
      if (input === null) return
      if (!input.trim()) {
        setErr('사유를 입력해야 합니다.')
        return
      }
      memo = input.trim()
    }
    setBusy(true)
    setErr('')
    try {
      await setShipmentStatus(s.id, to, memo)
      refresh()
    } catch (e) {
      // 전이 불가·배송지 미확정 등 서버 판정 사유를 그대로 보여준다
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div className="h-full w-full max-w-[720px] bg-card border-l border-border overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[17px] font-extrabold text-text-strong">
              {s.recipientName || '(수령인 미정)'}
            </h2>
            <Badge tone={shipmentStatusTone(s.status)}>{s.status}</Badge>
            <span className="text-[12px] text-[#64748b]">#{s.id}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditOpen((v) => !v)}
              className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-warning px-3 text-[13px] font-bold text-warning hover:bg-hover"
            >
              {editOpen ? '수정 취소' : (<><Pencil size={13} /> 정보 수정</>)}
            </button>
            <button onClick={onClose} className="text-[#94a3b8] hover:text-white">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          {err && (
            <div className="rounded-[10px] border border-danger/40 bg-card p-3 text-[12.5px] text-danger">
              {err}
            </div>
          )}

          <section>
            <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">상태 변경</h3>
            <div className="rounded-[10px] border border-border p-3">
              {nextStatuses.length === 0 ? (
                <p className="text-[12.5px] text-[#64748b]">
                  종료된 배송건입니다. 더 이상 상태를 변경할 수 없습니다.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {nextStatuses.map((to) => (
                    <button
                      key={to}
                      onClick={() => changeStatus(to)}
                      disabled={busy}
                      className="h-9 rounded-[8px] border border-border px-3 text-[12.5px] font-bold text-[#c2cde0] hover:bg-hover disabled:opacity-60"
                    >
                      {to}
                    </button>
                  ))}
                </div>
              )}
              {s.status === '추후배송' && (
                <p className="mt-2 text-[11.5px] text-[#94a3b8]">
                  배송지가 확정되지 않은 건입니다. 배송목록 전송 대상에서 제외되며, 주소·수령인·연락처를
                  채운 뒤 목록확정할 수 있습니다.
                </p>
              )}
            </div>
          </section>

          {editOpen && <EditForm s={s} onCancel={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); refresh() }} />}

          <section>
            <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">배송 정보</h3>
            <div className="rounded-[10px] border border-border p-3 grid grid-cols-2 gap-x-6 gap-y-2">
              <Row label="수령인" value={s.recipientName || '-'} />
              <Row label="연락처" value={s.phone || '-'} />
              <Row label="주소" value={s.address || '-'} />
              <Row label="배송메모" value={s.deliveryMemo || '-'} />
              <Row label="교재1" value={s.book1Name || '-'} />
              <Row label="교재2" value={s.book2Name || '-'} />
              <Row label="택배사" value={s.carrier || '-'} />
              <Row label="송장번호" value={s.trackingNo || '-'} />
              <Row label="연결 신청" value={s.textbookApplicationId || '-'} />
              <Row label="전송배치" value={s.batchId || '-'} />
              <Row label="비고" value={s.memo || '-'} />
            </div>
          </section>

          <section>
            <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">진행 시각</h3>
            <div className="rounded-[10px] border border-border p-3 grid grid-cols-2 gap-x-6 gap-y-2">
              <Row label="접수" value={s.createdAt || '-'} />
              <Row label="물류 전송" value={s.sentToLogisticsAt || '-'} />
              <Row label="발송(송장등록)" value={s.shippedAt || '-'} />
              <Row label="배송완료" value={s.deliveredAt || '-'} />
              <Row label="완료확인" value={s.confirmedAt || '-'} />
            </div>
          </section>

          <section>
            <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">
              상태 이력 <span className="text-[#64748b] font-semibold">({s.log?.length ?? 0})</span>
            </h3>
            <div className="rounded-[10px] border border-border divide-y divide-border">
              {(s.log ?? []).map((l) => (
                <div key={l.id} className="px-3 py-2 text-[12.5px]">
                  <div className="flex items-center gap-2">
                    <span className="text-[#94a3b8]">{l.createdAt}</span>
                    <Badge tone="slate">{l.fromStatus || '신규'}</Badge>
                    <span className="text-[#64748b]">→</span>
                    <Badge tone={shipmentStatusTone(l.toStatus)}>{l.toStatus}</Badge>
                    <span className="text-[#64748b]">{l.actor}</span>
                  </div>
                  {l.memo && <div className="mt-1 text-[#94a3b8]">{l.memo}</div>}
                </div>
              ))}
              {(s.log?.length ?? 0) === 0 && (
                <div className="px-3 py-6 text-center text-[#64748b] text-[12.5px]">이력이 없습니다.</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function EditForm({
  s,
  onCancel,
  onSaved,
}: {
  s: Shipment
  onCancel: () => void
  onSaved: () => void
}) {
  const [f, setF] = useState({
    recipientName: s.recipientName,
    phone: s.phone,
    address: s.address,
    deliveryMemo: s.deliveryMemo,
    book1Name: s.book1Name,
    book2Name: s.book2Name,
    carrier: s.carrier,
    trackingNo: s.trackingNo,
    memo: s.memo,
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v })

  const submit = async () => {
    setSaving(true)
    setErr('')
    try {
      await updateShipment(s.id, f)
      onSaved()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-[10px] border border-warning/50 p-3">
      <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">정보 수정</h3>
      <div className="grid grid-cols-2 gap-3">
        <Field label="수령인">
          <input value={f.recipientName} onChange={(e) => set('recipientName', e.target.value)} className={inputCls} />
        </Field>
        <Field label="연락처">
          <input value={f.phone} onChange={(e) => set('phone', phoneFmt(e.target.value))} className={inputCls} />
        </Field>
        <Field label="주소">
          <input value={f.address} onChange={(e) => set('address', e.target.value)} className={inputCls} />
        </Field>
        <Field label="배송메모">
          <input value={f.deliveryMemo} onChange={(e) => set('deliveryMemo', e.target.value)} className={inputCls} />
        </Field>
        <Field label="교재1">
          <input value={f.book1Name} onChange={(e) => set('book1Name', e.target.value)} className={inputCls} />
        </Field>
        <Field label="교재2">
          <input value={f.book2Name} onChange={(e) => set('book2Name', e.target.value)} className={inputCls} />
        </Field>
        <Field label="택배사">
          <input value={f.carrier} onChange={(e) => set('carrier', e.target.value)} className={inputCls} placeholder="예: CJ대한통운" />
        </Field>
        <Field label="송장번호">
          <input value={f.trackingNo} onChange={(e) => set('trackingNo', e.target.value)} className={inputCls} />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="비고">
          <input value={f.memo} onChange={(e) => set('memo', e.target.value)} className={inputCls} />
        </Field>
      </div>
      {err && <div className="mt-2 text-[12.5px] text-danger">{err}</div>}
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onCancel} className="h-9 rounded-[8px] border border-border px-4 text-[13px] font-bold text-[#c2cde0] hover:bg-hover">
          취소
        </button>
        <button
          onClick={submit}
          disabled={saving}
          className="h-9 rounded-[8px] bg-primary px-4 text-[13px] font-bold text-white hover:brightness-110 disabled:opacity-60"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-[12.5px]">
      <span className="w-[92px] shrink-0 text-[#64748b]">{label}</span>
      <span className="text-[#c2cde0] break-all">{value}</span>
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
