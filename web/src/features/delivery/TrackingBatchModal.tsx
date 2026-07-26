import { useEffect, useRef, useState } from 'react'
import { Check, ChevronRight, X } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import { useCodes } from '../../lib/codeStore'
import type { Shipment } from '../../types/delivery'
import { setShipmentStatus, updateShipment } from './deliveryStore'
import { shipmentStatusTone } from './statusTone'

const inputCls =
  'h-11 w-full rounded-[8px] bg-input border border-border px-3 text-[15px] text-input-text outline-none focus:border-primary'

interface Result {
  id: string
  recipient: string
  trackingNo: string
  ok: boolean
  note: string
}

/**
 * 송장번호 일괄 입력 — 목록에서 선택한 배송건을 한 건씩 넘기며 연속 입력한다.
 *
 * USB 바코드 리더기는 키보드처럼 동작한다(값을 타이핑하고 Enter 를 보낸다).
 * 그래서 입력창에 자동 포커스를 두고 Enter 로 저장·다음 이동하면, 스캔만 반복해도 진행된다.
 * 기존 값이 있으면 전체 선택해 두어 스캔 값이 덮어쓰이게 한다(뒤에 덧붙지 않도록).
 *
 * 택배사는 한 묶음에서 보통 같으므로 상단에서 한 번만 고른다.
 * 저장 후 상태가 '전송완료'인 건은 '배송중'으로 함께 옮긴다 — 송장 발급이 곧 발송 시작이다.
 */
export default function TrackingBatchModal({
  shipments,
  onClose,
  onDone,
}: {
  shipments: Shipment[]
  onClose: () => void
  onDone: () => void
}) {
  const codes = useCodes()
  const [carrier, setCarrier] = useState(shipments[0]?.carrier || '')
  const [index, setIndex] = useState(0)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const current = shipments[index]
  const finished = index >= shipments.length

  // 다음 건으로 넘어갈 때마다 입력창에 포커스를 돌려준다 — 스캔만 반복하면 되도록
  useEffect(() => {
    if (!finished) {
      setValue(current?.trackingNo || '')
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [index, finished, current?.trackingNo])

  const record = (r: Result) => setResults((prev) => [...prev, r])

  const saveAndNext = async () => {
    if (finished || busy) return
    // 바코드 리더기가 붙이는 공백·개행을 제거한다
    const no = value.replace(/\s+/g, '')
    if (!no) {
      setErr('송장번호를 입력하세요. 건너뛰려면 [건너뛰기]를 누르세요.')
      return
    }
    if (!carrier) {
      setErr('택배사를 먼저 선택하세요.')
      return
    }
    setBusy(true)
    setErr('')
    try {
      await updateShipment(current.id, { carrier, trackingNo: no })
      let note = '송장 저장'
      // 송장 등록 = 발송 시작. 전이 규칙상 '전송완료' 에서만 '배송중' 으로 갈 수 있다.
      if (current.status === '전송완료') {
        try {
          await setShipmentStatus(current.id, '배송중', '송장 등록')
          note = '송장 저장 + 배송중'
        } catch (e) {
          note = `송장 저장 (상태 유지: ${(e as Error).message})`
        }
      }
      record({ id: current.id, recipient: current.recipientName, trackingNo: no, ok: true, note })
      setIndex((i) => i + 1)
    } catch (e) {
      record({ id: current.id, recipient: current.recipientName, trackingNo: no, ok: false, note: (e as Error).message })
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const skip = () => {
    if (finished) return
    record({ id: current.id, recipient: current.recipientName, trackingNo: '', ok: false, note: '건너뜀' })
    setIndex((i) => i + 1)
  }

  const close = () => {
    if (results.some((r) => r.ok)) onDone()
    onClose()
  }

  const okCount = results.filter((r) => r.ok).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-[620px] rounded-[14px] border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-extrabold text-text-strong">송장번호 일괄 입력</h2>
            <span className="text-[12.5px] text-[#94a3b8]">
              {Math.min(index + (finished ? 0 : 1), shipments.length)} / {shipments.length}
            </span>
          </div>
          <button onClick={close} className="text-[#94a3b8] hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <span className="mb-1 block text-[12px] font-semibold text-[#94a3b8]">택배사 (선택 건 전체 적용)</span>
            <select
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              className="h-10 w-full rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary"
            >
              <option value="">선택 안 함</option>
              {codes.carriers.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {!finished ? (
            <>
              <div className="rounded-[10px] border border-primary/50 bg-hover p-3">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold text-text-strong">{current.recipientName || '(수령인 미정)'}</span>
                  <Badge tone={shipmentStatusTone(current.status)}>{current.status}</Badge>
                  <span className="text-[12px] text-[#64748b]">#{current.id}</span>
                </div>
                <div className="mt-1 text-[12.5px] text-[#c2cde0]">{current.phone || '-'}</div>
                <div className="mt-0.5 text-[12.5px] text-[#94a3b8] break-all">{current.address || '-'}</div>
                <div className="mt-0.5 text-[12px] text-[#94a3b8]">
                  {[current.book1Name, current.book2Name].filter(Boolean).join(', ') || '교재 미지정'}
                </div>
              </div>

              <div>
                <span className="mb-1 block text-[12px] font-semibold text-[#94a3b8]">
                  송장번호 — 바코드를 스캔하거나 입력 후 Enter
                </span>
                <input
                  ref={inputRef}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      saveAndNext()
                    }
                  }}
                  onFocus={(e) => e.currentTarget.select()}
                  disabled={busy}
                  autoFocus
                  className={inputCls}
                  placeholder="스캔하면 자동 입력됩니다"
                />
              </div>

              {err && <div className="text-[12.5px] text-danger">{err}</div>}

              <div className="flex justify-between gap-2">
                <button
                  onClick={skip}
                  disabled={busy}
                  className="h-10 rounded-[8px] border border-border px-4 text-[13px] font-bold text-[#c2cde0] hover:bg-hover disabled:opacity-60"
                >
                  건너뛰기
                </button>
                <button
                  onClick={saveAndNext}
                  disabled={busy}
                  className="inline-flex h-10 items-center gap-1.5 rounded-[8px] bg-primary px-4 text-[13px] font-bold text-white hover:brightness-110 disabled:opacity-60"
                >
                  {busy ? '저장 중…' : (<>저장하고 다음 <ChevronRight size={15} /></>)}
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-[10px] border border-border p-4 text-center">
              <Check size={30} className="mx-auto mb-2 text-success" />
              <div className="text-[14px] font-bold text-text-strong">
                {shipments.length}건 중 {okCount}건 저장 완료
              </div>
            </div>
          )}

          {results.length > 0 && (
            <div className="max-h-[180px] overflow-y-auto rounded-[10px] border border-border divide-y divide-border">
              {results.map((r, i) => (
                <div key={`${r.id}-${i}`} className="flex items-center gap-2 px-3 py-1.5 text-[12.5px]">
                  <Badge tone={r.ok ? 'green' : 'slate'}>{r.ok ? '완료' : '건너뜀'}</Badge>
                  <span className="text-[#c2cde0]">{r.recipient || r.id}</span>
                  {r.trackingNo && <span className="tabular text-[#94a3b8]">{r.trackingNo}</span>}
                  <span className="ml-auto truncate text-[11.5px] text-[#64748b]">{r.note}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-border px-5 py-3">
          <button
            onClick={close}
            className="h-10 rounded-[8px] border border-border px-4 text-[13px] font-bold text-[#c2cde0] hover:bg-hover"
          >
            {finished ? '닫기' : '중단하고 닫기'}
          </button>
        </div>
      </div>
    </div>
  )
}
