import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { CheckCircle2, Clock, Eye, PackageCheck, RefreshCw, Truck } from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Badge from '../../components/ui/Badge'
import Pagination from '../../components/ui/Pagination'
import DateTextInput from '../../components/ui/DateTextInput'
import { dateText } from '../../lib/format'
import {
  EMPTY_SHIPMENT_FILTER,
  SHIPMENT_STATUSES,
  type Shipment,
  type ShipmentFilter,
  type ShipmentSummary,
} from '../../types/delivery'
import { listShipments, summarizeShipments } from './deliveryStore'
import DeliveryDetailDrawer from './DeliveryDetailDrawer'
import { shipmentStatusTone } from './statusTone'

const inputCls =
  'h-[38px] w-full rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary'

/**
 * 배송관리 대장 — 교재구매 신청에서 자동 생성된 배송건을 관리한다.
 * 접수 ≠ 배송이므로, 배송지가 확정되지 않은 건은 '추후배송'으로 따로 보이며
 * 배송목록 전송 대상에서 제외된다.
 */
export default function DeliveryAdminPage() {
  const [filter, setFilter] = useState<ShipmentFilter>(EMPTY_SHIPMENT_FILTER)
  const [rows, setRows] = useState<Shipment[]>([])
  const [sum, setSum] = useState<ShipmentSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [perPage, setPerPage] = useState(20)
  const [page, setPage] = useState(1)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setLoadErr('')
    Promise.all([listShipments(filter), summarizeShipments()])
      .then(([list, s]) => {
        if (!alive) return
        setRows(list)
        setSum(s)
        setLoading(false)
      })
      .catch((e) => {
        if (!alive) return
        setLoadErr((e as Error).message || '배송 목록을 불러오지 못했습니다.')
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [filter, refresh])

  useEffect(() => {
    setPage(1)
  }, [filter, perPage])

  const totalPages = Math.max(1, Math.ceil(rows.length / perPage))
  const safePage = Math.min(page, totalPages)
  const pagedRows = rows.slice((safePage - 1) * perPage, safePage * perPage)

  return (
    <AppLayout title="배송관리">
      <div className="mb-4">
        <h1 className="text-[22px] font-extrabold tracking-[-0.5px] text-text-strong">배송관리</h1>
        <p className="text-[13px] text-[#94a3b8] mt-1">
          교재구매 신청 접수 시 배송건이 자동 생성됩니다. 배송지가 확정되지 않은 건은 추후배송으로 분류됩니다.
        </p>
      </div>

      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setRefresh((n) => n + 1)}
          className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border px-4 text-sm font-bold text-[#c2cde0] hover:bg-hover"
        >
          <RefreshCw size={14} /> 새로고침
        </button>
      </div>

      {loadErr && (
        <div className="rounded-[14px] border border-danger/40 bg-card p-4 mb-4 text-[13px] text-danger">
          불러오기 실패: {loadErr}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <SummaryCard label="전체 배송" value={sum?.total ?? 0} sub="누적 건수" tint="#e0edff" fg="#2563eb" icon={PackageCheck} />
        <SummaryCard label="추후배송" value={sum?.deferred ?? 0} sub="배송지 미확정" tint="#fff1e0" fg="#f59e0b" icon={Clock} />
        <SummaryCard label="전송대기" value={sum?.waitingSend ?? 0} sub="접수 + 목록확정" tint="#e2f7ec" fg="#16a34a" icon={Truck} />
        <SummaryCard label="배송중" value={sum?.shipping ?? 0} sub={`완료 ${sum?.done ?? 0}건`} tint="#f3e8ff" fg="#7c3aed" icon={CheckCircle2} />
      </div>

      <div className="rounded-[14px] border border-border bg-card p-4 mb-4">
        <div className="grid grid-cols-[repeat(4,minmax(150px,1fr))] gap-2 items-end">
          <Field label="접수 시작일">
            <DateTextInput value={filter.startDate} onChange={(v) => setFilter({ ...filter, startDate: v })} className={inputCls} />
          </Field>
          <Field label="접수 종료일">
            <DateTextInput value={filter.endDate} onChange={(v) => setFilter({ ...filter, endDate: v })} className={inputCls} />
          </Field>
          <Field label="상태">
            <select
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value })}
              className={inputCls}
            >
              <option value="전체">전체</option>
              {SHIPMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="검색">
            <input
              value={filter.keyword}
              onChange={(e) => setFilter({ ...filter, keyword: e.target.value })}
              placeholder="수령인·연락처·주소·배송번호"
              className={inputCls}
            />
          </Field>
        </div>
      </div>

      <div className="rounded-[14px] border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-[13px]">
            <thead>
              <tr className="text-left text-[12.5px] text-[#94a3b8] border-b border-border">
                <th className="px-3 py-2 font-semibold">배송번호</th>
                <th className="px-3 py-2 font-semibold text-center">접수일</th>
                <th className="px-3 py-2 font-semibold">수령인</th>
                <th className="px-3 py-2 font-semibold">연락처</th>
                <th className="px-3 py-2 font-semibold">주소</th>
                <th className="px-3 py-2 font-semibold">교재</th>
                <th className="px-3 py-2 font-semibold">송장</th>
                <th className="px-3 py-2 font-semibold text-center">상태</th>
                <th className="px-3 py-2 font-semibold text-center">상세</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((s) => (
                <tr key={s.id} className="border-b border-border hover:bg-hover">
                  <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#c2cde0]">{s.id}</td>
                  <td className="px-3 py-1.5 tabular text-center whitespace-nowrap">{dateText(s.createdAt)}</td>
                  <td className="px-3 py-1.5 font-semibold text-text-strong whitespace-nowrap">
                    {s.recipientName || '-'}
                  </td>
                  <td className="px-3 py-1.5 tabular whitespace-nowrap">{s.phone || '-'}</td>
                  <td className="px-3 py-1.5 max-w-[280px] truncate" title={s.address}>
                    {s.address || '-'}
                  </td>
                  <td className="px-3 py-1.5 max-w-[180px] truncate" title={`${s.book1Name} ${s.book2Name}`}>
                    {[s.book1Name, s.book2Name].filter(Boolean).join(', ') || '-'}
                  </td>
                  <td className="px-3 py-1.5 tabular whitespace-nowrap">
                    {s.trackingNo ? `${s.carrier ? s.carrier + ' ' : ''}${s.trackingNo}` : '-'}
                  </td>
                  <td className="px-3 py-1.5 text-center whitespace-nowrap">
                    <Badge tone={shipmentStatusTone(s.status)}>{s.status}</Badge>
                  </td>
                  <td className="px-3 py-1.5 text-center whitespace-nowrap">
                    <button
                      onClick={() => setDetailId(s.id)}
                      title="상세"
                      className="h-8 w-8 rounded-lg border border-border inline-flex items-center justify-center text-[#94a3b8] hover:bg-hover"
                    >
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-[#64748b]">
                    {loading ? '불러오는 중…' : '조건에 맞는 배송건이 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={safePage}
          totalPages={totalPages}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={setPerPage}
        />
      </div>

      {detailId && (
        <DeliveryDetailDrawer
          shipmentId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={() => setRefresh((n) => n + 1)}
        />
      )}
    </AppLayout>
  )
}

function SummaryCard({
  label,
  value,
  sub,
  tint,
  fg,
  icon: Icon,
}: {
  label: string
  value: number
  sub: string
  tint: string
  fg: string
  icon: ComponentType<{ size?: number }>
}) {
  return (
    <div className="rounded-[12px] border border-border bg-card p-4">
      <div className="flex items-center gap-3 mb-2">
        <div
          className="h-[38px] w-[38px] rounded-[11px] flex items-center justify-center shrink-0"
          style={{ background: tint, color: fg }}
        >
          <Icon size={18} />
        </div>
        <div className="text-[13px] font-semibold text-[#64748b]">{label}</div>
      </div>
      <div className="text-[21px] font-extrabold text-text-strong leading-tight tabular">{value}건</div>
      <div className="text-[12px] font-semibold text-[#94a3b8] mt-0.5 whitespace-nowrap">{sub}</div>
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
