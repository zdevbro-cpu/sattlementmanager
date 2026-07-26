import { useState } from 'react'
import Badge from '../../components/ui/Badge'
import { dateText } from '../../lib/format'
import { useCodes } from '../../lib/codeStore'
import type { TextbookApplication } from '../../types/textbook'
import { cancelSubscription, pauseSubscription, startSubscription } from './textbookStore'

const inputCls =
  'h-9 w-full rounded-[8px] bg-input border border-border px-2.5 text-[13px] text-input-text outline-none focus:border-primary'

/**
 * 구독 정기발송 관리 — 구독·관리회원(K2~K7 / S2~S7)의 1년 정기발송.
 *
 * 신청 시 1년치를 한 번에 결제하므로 매출은 1건이고, 배송만 회차마다 생긴다.
 * 26회차를 미리 만들지 않고 예정일이 도래할 때 크론이 한 건씩 만들기 때문에,
 * 여기서는 "다음 예정일"과 "진행 회차"만 보여주면 현황이 파악된다.
 */
export default function SubscriptionSection({
  a,
  onChanged,
}: {
  a: TextbookApplication
  onChanged: () => void
}) {
  const codes = useCodes()
  const [product, setProduct] = useState(a.shipProduct || a.subscriptionType || a.managementType || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const active = !!a.shipProduct
  const canceled = !!a.shipCanceledAt
  const seq = a.shipSeq || 0
  const total = a.shipTotal || 0
  const done = active && !canceled && total > 0 && seq >= total

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setErr('')
    try {
      await fn()
      onChanged()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const stateBadge = () => {
    if (canceled) return <Badge tone="red">해지됨</Badge>
    if (done) return <Badge tone="green">완료</Badge>
    if (a.shipPaused) return <Badge tone="amber">일시정지</Badge>
    return <Badge tone="sky">진행중</Badge>
  }

  return (
    <section>
      <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">구독 정기발송</h3>
      <div className="rounded-[10px] border border-border p-3">
        {!active ? (
          <>
            <p className="mb-2.5 text-[12.5px] text-[#94a3b8]">
              구독·관리회원이면 상품을 지정하세요. 2주 간격으로 1년(26회) 발송되며, 회차는 예정일에
              자동 생성됩니다. (1년치 결제는 신청 시 이미 처리된 것으로 봅니다)
            </p>
            <div className="flex gap-2">
              <select value={product} onChange={(e) => setProduct(e.target.value)} className={inputCls}>
                <option value="">상품 선택</option>
                {codes.subscriptionProducts.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (!product) return setErr('상품을 선택하세요.')
                  run(() => startSubscription(a.id, { product }))
                }}
                disabled={busy}
                className="h-9 shrink-0 rounded-[8px] bg-primary px-4 text-[13px] font-bold text-white hover:brightness-110 disabled:opacity-60"
              >
                구독 시작
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-extrabold text-primary">{a.shipProduct}</span>
              {stateBadge()}
              <span className="text-[12.5px] text-[#c2cde0]">
                {seq} / {total || 26} 회차
              </span>
              <span className="text-[12.5px] text-[#94a3b8]">
                {canceled
                  ? `해지 ${dateText(a.shipCanceledAt || '')}`
                  : done
                    ? '모든 회차 발송 완료'
                    : a.shipPaused
                      ? '정지 중 — 재개하면 오늘 기준으로 다시 시작합니다'
                      : `다음 예정 ${dateText(a.shipNextDate || '') || '-'}`}
              </span>
            </div>

            {!canceled && !done && (
              <div className="flex gap-2">
                <button
                  onClick={() => run(() => pauseSubscription(a.id, !a.shipPaused))}
                  disabled={busy}
                  className="h-9 rounded-[8px] border border-border px-3 text-[12.5px] font-bold text-[#c2cde0] hover:bg-hover disabled:opacity-60"
                >
                  {a.shipPaused ? '재개' : '일시정지'}
                </button>
                <button
                  onClick={() => {
                    if (!confirm('구독을 해지할까요? 이후 회차는 생성되지 않습니다. (이미 나간 배송건은 유지됩니다)'))
                      return
                    run(() => cancelSubscription(a.id))
                  }}
                  disabled={busy}
                  className="h-9 rounded-[8px] border border-danger px-3 text-[12.5px] font-bold text-danger hover:bg-hover disabled:opacity-60"
                >
                  해지
                </button>
              </div>
            )}
          </>
        )}
        {err && <div className="mt-2 text-[12px] text-danger">{err}</div>}
      </div>
    </section>
  )
}
