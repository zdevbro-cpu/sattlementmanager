import { useEffect, useState } from 'react'
import { dateText, won } from '../../lib/format'
import { salesMethodLabel, type Sale } from '../../types/sales'
import { getSale } from './salesStore'
import Badge, { methodTone } from '../../components/ui/Badge'

export default function SalesDetailDrawer({
  saleId,
  onClose,
}: {
  saleId: string
  onClose: () => void
}) {
  const [s, setS] = useState<Sale | undefined>(undefined)

  useEffect(() => {
    let alive = true
    getSale(saleId).then((res) => {
      if (alive) setS(res)
    })
    return () => {
      alive = false
    }
  }, [saleId])

  if (!s) return null
  const p = s.payment

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div className="h-full w-full max-w-[640px] bg-card border-l border-border overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[17px] font-extrabold text-text-strong">{s.buyer}</h2>
            <Badge tone={methodTone(p.method)}>{salesMethodLabel(p.method)}</Badge>
            <span className="text-[12px] text-[#64748b]">#{s.id}</span>
          </div>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-white">✕</button>
        </div>

        <div className="px-6 py-5 space-y-6">
          <section>
            <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">매출 정보</h3>
            <div className="rounded-[10px] border border-border p-3 grid grid-cols-2 gap-x-6 gap-y-2">
              {(
                [
                  ['매출일', dateText(s.date)],
                  ['매출구분', s.category],
                  ['사업부', s.businessUnit],
                  ['구매자', s.buyer],
                  ['담당', s.manager],
                  ['금액', won(p.totalAmount)],
                  ['검증', s.verified ? '검증완료' : '미검증'],
                  ['비고', s.memo || '-'],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between text-[12.5px]">
                  <span className="text-[#64748b]">{k}</span>
                  <span className="text-[#e2e8f0] tabular">{v}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 카드 결재정보 */}
          {p.cardInstallments.length > 0 && (
            <section>
              <h3 className="mb-2.5 text-[13px] font-extrabold text-warning">
                카드 결재{p.cardInstallments.length > 1 ? ` · ${p.cardInstallments.length}회 분할` : ''}
              </h3>
              <div className="space-y-1.5">
                {p.cardInstallments.map((c) => (
                  <div key={c.seq} className="rounded-[8px] border border-border px-3 py-2 text-[12px]">
                    <div className="flex justify-between mb-1">
                      <span className="font-bold text-warning">카드 {c.seq}회차</span>
                      <span className="tabular font-bold text-text-strong">{won(c.amount)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[#94a3b8]">
                      <span>카드사: {c.issuer || '-'}</span>
                      <span>카드번호: {c.cardNumber || '-'}</span>
                      <span>승인번호: {c.approvalNo || '-'}</span>
                      <span>단말기: {c.terminalNo || '-'}</span>
                      <span>거래일: {dateText(c.transactionDate)}</span>
                    </div>
                    {c.driveViewUrl && (
                      <a
                        href={c.driveViewUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-bold text-primary hover:brightness-110"
                      >
                        📎 등록된 전표 원본 보기 →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 현금 입금정보 */}
          {p.cashInstallments.length > 0 && (
            <section>
              <h3 className="mb-2.5 text-[13px] font-extrabold text-success">
                현금 입금{p.cashInstallments.length > 1 ? ` · ${p.cashInstallments.length}회 분할` : ''}
              </h3>
              <div className="space-y-1.5">
                {p.cashInstallments.map((c) => (
                  <div key={c.seq} className="rounded-[8px] border border-border px-3 py-2 text-[12px]">
                    <div className="flex justify-between mb-1">
                      <span className="font-bold text-success">현금 {c.seq}회차</span>
                      <span className="tabular font-bold text-text-strong">{won(c.amount)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[#94a3b8]">
                      <span>입금자: {c.depositor || '-'}</span>
                      <span>은행: {c.bank || '-'}</span>
                      <span>승인번호: {c.approvalNo || '-'}</span>
                      <span>거래일: {dateText(c.transactionDate)}</span>
                      <span>가맹점: {c.merchantName || '-'}</span>
                    </div>
                    {c.driveViewUrl && (
                      <a
                        href={c.driveViewUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-bold text-primary hover:brightness-110"
                      >
                        📎 등록된 입금증 원본 보기 →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
