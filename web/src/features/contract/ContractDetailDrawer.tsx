import { useMemo, useState } from 'react'
import StatusBadge from '../../components/ui/StatusBadge'
import { comma, dateText, won } from '../../lib/format'
import type { ContractSnapshot } from '../../types/contract'
import { getContract } from './contractStore'
import HistoryAddForm from './HistoryAddForm'

export default function ContractDetailDrawer({
  contractId,
  onClose,
  onChanged,
}: {
  contractId: string
  onClose: () => void
  onChanged?: () => void
}) {
  const [openHistory, setOpenHistory] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [tick, setTick] = useState(0)
  const contract = useMemo(() => getContract(contractId), [contractId, tick])

  if (!contract) return null
  const cur = contract.current

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div className="h-full w-full max-w-[720px] bg-card border-l border-border overflow-y-auto">
        {/* 헤더 */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[17px] font-extrabold text-text-strong">
              {cur.contractorName}
            </h2>
            <StatusBadge status={cur.status} />
            <span className="text-[12px] text-[#64748b]">#{contract.id}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAddOpen((v) => !v)}
              className="h-9 rounded-[8px] bg-indigo px-3 text-[13px] font-bold text-white hover:brightness-110"
            >
              {addOpen ? '변경 취소' : '＋ 상태 변경 / 이력 추가'}
            </button>
            <button onClick={onClose} className="text-[#94a3b8] hover:text-white">
              ✕
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* 상태 변경 / 이력 추가 */}
          {addOpen && (
            <section>
              <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">
                상태 변경 / 이력 추가
              </h3>
              <HistoryAddForm
                contractId={contract.id}
                base={cur}
                onCancel={() => setAddOpen(false)}
                onSaved={() => {
                  setAddOpen(false)
                  setTick((n) => n + 1)
                  onChanged?.()
                }}
              />
            </section>
          )}

          {/* 최근 계약내용 */}
          <section>
            <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">
              최근 계약내용
            </h3>
            <SnapshotCard s={cur} highlight />
          </section>

          {/* 결재정보 */}
          <section>
            <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">
              결재정보 · {cur.payment.method}{' '}
              <span className="text-[#64748b] font-semibold">
                (합계 {won(cur.payment.totalAmount)})
              </span>
            </h3>
            <PaymentView s={cur} />
          </section>

          {/* 첨부 문서 */}
          <section>
            <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">
              첨부 문서 (Google Drive)
            </h3>
            <DocsView docs={cur.documents} />
          </section>

          {/* 계약 히스토리 */}
          <section>
            <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">
              계약 히스토리{' '}
              <span className="text-[#64748b] font-semibold">
                ({contract.history.length})
              </span>
            </h3>
            <div className="space-y-2">
              {contract.history.map((h) => (
                <div
                  key={h.historyId}
                  className="rounded-[10px] border border-border overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setOpenHistory(
                        openHistory === h.historyId ? null : h.historyId,
                      )
                    }
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-hover"
                  >
                    <div className="flex items-center gap-2.5">
                      <StatusBadge status={h.status} />
                      <span className="text-[13px] tabular text-[#c2cde0]">
                        {dateText(h.eventDate)}
                      </span>
                      {h.memo && (
                        <span className="text-[12px] text-[#64748b]">
                          · {h.memo}
                        </span>
                      )}
                    </div>
                    <span className="text-[12px] text-[#64748b]">
                      {openHistory === h.historyId ? '▲' : '▼'}
                    </span>
                  </button>
                  {openHistory === h.historyId && (
                    <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border">
                      <SnapshotCard s={h} />
                      <div>
                        <div className="mb-1.5 text-[12px] font-bold text-[#94a3b8]">
                          결재정보 · {h.payment.method}
                        </div>
                        <PaymentView s={h} />
                      </div>
                      {h.documents.length > 0 && (
                        <div>
                          <div className="mb-1.5 text-[12px] font-bold text-[#94a3b8]">
                            문서
                          </div>
                          <DocsView docs={h.documents} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function SnapshotCard({
  s,
  highlight,
}: {
  s: ContractSnapshot
  highlight?: boolean
}) {
  const rows: [string, string][] = [
    ['소속', s.org],
    ['계약구분', s.contractType],
    ['계약일', dateText(s.contractDate)],
    ['보증금', comma(s.deposit)],
    ['수당', comma(s.allowance)],
    ['수당지급일', s.allowancePayDay ? `매월 ${s.allowancePayDay}일` : '-'],
    ['최초수당지급일', dateText(s.firstAllowancePayDate)],
    ['계약종료일', dateText(s.contractEndDate)],
    ['지점명', s.branch],
    ['관리자', s.manager],
    ['유치자', s.recruiter],
    ['은행명', s.bankName],
    ['계좌번호', s.accountNo],
    ['예금주', s.accountOwner],
    ['주민등록번호', s.residentNo],
    ['전화번호', s.phone],
  ]
  return (
    <div
      className={[
        'rounded-[10px] border p-3 grid grid-cols-2 gap-x-6 gap-y-2',
        highlight ? 'border-primary/40 bg-input/30' : 'border-border',
      ].join(' ')}
    >
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between text-[12.5px]">
          <span className="text-[#64748b]">{k}</span>
          <span className="text-[#e2e8f0] tabular">{v}</span>
        </div>
      ))}
    </div>
  )
}

function PaymentView({ s }: { s: ContractSnapshot }) {
  const p = s.payment
  if (p.cardInstallments.length === 0 && p.cashInstallments.length === 0)
    return <Empty>등록된 결재 정보가 없습니다.</Empty>
  return (
    <div className="space-y-1.5">
      {p.cardInstallments.map((c) => (
        <div
          key={`card-${c.seq}`}
          className="rounded-[8px] border border-border px-3 py-2 text-[12px]"
        >
          <div className="flex justify-between mb-1">
            <span className="font-bold text-warning">카드 {c.seq}회차</span>
            <span className="tabular font-bold text-text-strong">
              {won(c.amount)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[#94a3b8]">
            <span>카드사: {c.issuer || '-'}</span>
            <span>카드번호: {c.cardNumber || '-'}</span>
            <span>승인번호: {c.approvalNo || '-'}</span>
            <span>단말기: {c.terminalNo || '-'}</span>
            <span>일련번호: {c.serialNo || '-'}</span>
            <span>거래일: {dateText(c.transactionDate)}</span>
          </div>
        </div>
      ))}
      {p.cashInstallments.map((c) => (
        <div
          key={`cash-${c.seq}`}
          className="rounded-[8px] border border-border px-3 py-2 text-[12px]"
        >
          <div className="flex justify-between mb-1">
            <span className="font-bold text-success">현금 {c.seq}회차</span>
            <span className="tabular font-bold text-text-strong">
              {won(c.amount)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[#94a3b8]">
            <span>은행: {c.bank || '-'}</span>
            <span>입금자: {c.depositor || '-'}</span>
            <span>승인번호: {c.approvalNo || '-'}</span>
            <span>거래일: {dateText(c.transactionDate)}</span>
            <span>식별수단: {c.identifierType || '-'}</span>
            <span>가맹점: {c.merchantName || '-'}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function DocsView({ docs }: { docs: ContractSnapshot['documents'] }) {
  if (docs.length === 0) return <Empty>첨부된 문서가 없습니다.</Empty>
  return (
    <div className="space-y-1.5">
      {docs.map((d) => (
        <a
          key={d.id}
          href={d.driveViewUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between rounded-[8px] border border-border px-3 py-2 text-[12.5px] hover:bg-hover"
        >
          <span className="flex items-center gap-2">
            <span className="rounded-md bg-input px-1.5 py-0.5 text-[11px] text-[#94a3b8]">
              {d.kind}
            </span>
            <span className="text-[#c2cde0]">{d.fileName}</span>
          </span>
          <span className="text-primary font-bold">Drive 열기 →</span>
        </a>
      ))}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[8px] border border-dashed border-border px-3 py-4 text-center text-[12px] text-[#64748b]">
      {children}
    </div>
  )
}
