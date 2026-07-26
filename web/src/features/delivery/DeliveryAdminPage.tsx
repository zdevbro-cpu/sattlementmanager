import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { Barcode, CheckCircle2, Clock, Download, Eye, Mail, PackageCheck, Plus, Printer, RefreshCw, Trash2, Truck } from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Badge from '../../components/ui/Badge'
import Pagination from '../../components/ui/Pagination'
import DateTextInput from '../../components/ui/DateTextInput'
import { dateText } from '../../lib/format'
import { downloadListAsExcel } from '../../lib/excelExport'
import {
  EMPTY_SHIPMENT_FILTER,
  SHIPMENT_STATUSES,
  type Shipment,
  type ShipmentFilter,
  type ShipmentSummary,
} from '../../types/delivery'
import { deleteShipment, listBookNames, listShipments, sendShipmentList, summarizeShipments } from './deliveryStore'
import DeliveryDetailDrawer from './DeliveryDetailDrawer'
import DeliveryCreateModal from './DeliveryCreateModal'
import TrackingBatchModal from './TrackingBatchModal'
import { printShipments } from './shipmentPrint'
import { shipmentStatusTone } from './statusTone'
import { sortByBook } from './sortByBook'

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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  // 교재 선택지는 필터 결과와 무관하게 전체 기준으로 받는다 —
  // 고른 교재로 목록이 좁혀진 뒤 선택지까지 같이 줄면 다른 교재로 못 바꾼다.
  const [bookNames, setBookNames] = useState<string[]>([])

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
    setSelected(new Set())
  }, [filter, perPage])

  const totalPages = Math.max(1, Math.ceil(rows.length / perPage))
  const safePage = Math.min(page, totalPages)
  const pagedRows = rows.slice((safePage - 1) * perPage, safePage * perPage)

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const pageAllChecked = pagedRows.length > 0 && pagedRows.every((r) => selected.has(r.id))
  const togglePageAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (pageAllChecked) pagedRows.forEach((r) => next.delete(r.id))
      else pagedRows.forEach((r) => next.add(r.id))
      return next
    })
  }

  /** 선택 건이 있으면 선택 건만, 없으면 현재 필터링된 전체 목록 대상 */
  // 엑셀·송장인쇄·일괄입력은 모두 교재별로 정렬해 내보낸다 — 창고 피킹 동선을 줄이기 위함
  /**
   * 배송건 삭제 — 잘못 등록한 건 정리용.
   * 발송 이후 상태는 서버가 거부하므로(이력이 남아야 한다) 여기서는 사유만 그대로 보여준다.
   */
  const removeRow = async (s: Shipment) => {
    if (!confirm(`${s.recipientName || s.id} 배송건을 삭제할까요? 되돌릴 수 없습니다.`)) return
    try {
      await deleteShipment(s.id)
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(s.id)
        return next
      })
      setRefresh((n) => n + 1)
    } catch (e) {
      alert((e as Error).message)
    }
  }

  useEffect(() => {
    let alive = true
    listBookNames()
      .then((list) => {
        if (alive) setBookNames(list)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [refresh])

  const targetRows = sortByBook(selected.size > 0 ? rows.filter((r) => selected.has(r.id)) : rows)

  /**
   * 배송목록 전송 — 선택한 건 중 '목록확정' 상태만 물류업체에 메일로 보낸다.
   * 메일 발송에 성공해야 서버가 '전송완료'로 옮긴다(보내지 않았는데 전송완료로 남으면 배송이 누락된다).
   */
  const onSendList = async () => {
    const ready = rows.filter((r) => selected.has(r.id) && r.status === '목록확정')
    if (ready.length === 0) {
      alert(
        selected.size === 0
          ? '전송할 배송건을 선택하세요.'
          : "선택한 건 중 '목록확정' 상태가 없습니다. 배송지를 확인하고 먼저 목록확정 처리하세요.",
      )
      return
    }
    const skipped = selected.size - ready.length
    const msg =
      `${ready.length}건을 물류업체에 전송할까요?` +
      (skipped > 0 ? ` (목록확정이 아닌 ${skipped}건은 제외됩니다)` : '')
    if (!confirm(msg)) return

    setSending(true)
    try {
      const r = await sendShipmentList(ready.map((x) => x.id))
      alert(`전송 완료 — ${r.sent}건 · 수신 ${r.to.join(', ')} · 배치 ${r.batchId}`)
      setSelected(new Set())
      setRefresh((n) => n + 1)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  const exportExcel = () => {
    const headers = ['배송번호', '접수일', '수령인', '연락처', '주소', '배송메모', '교재', '택배사', '송장번호', '상태']
    const data = targetRows.map((s) => [
      s.id,
      dateText(s.createdAt),
      s.recipientName,
      s.phone,
      s.address,
      s.deliveryMemo,
      [s.book1Name, s.book2Name].filter(Boolean).join(', '),
      s.carrier,
      s.trackingNo,
      s.status,
    ])
    downloadListAsExcel(`배송목록_${new Date().toISOString().slice(0, 10)}.xlsx`, headers, data)
  }

  const printSelected = () => {
    if (targetRows.length === 0) return
    printShipments(targetRows)
  }

  return (
    <AppLayout title="배송관리">
      <div className="mb-4">
        <h1 className="text-[22px] font-extrabold tracking-[-0.5px] text-text-strong">배송관리</h1>
        <p className="text-[13px] text-[#94a3b8] mt-1">
          교재구매 신청 접수 시 배송건이 자동 생성됩니다. 배송지가 확정되지 않은 건은 추후배송으로 분류됩니다.
        </p>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div className="text-[12.5px] text-[#94a3b8]">
          {selected.size > 0 ? `${selected.size}건 선택됨 (엑셀·송장인쇄는 선택 건 대상)` : '선택 없음 — 엑셀·송장인쇄는 현재 목록 전체 대상'}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onSendList}
            disabled={sending}
            title="선택한 '목록확정' 건을 물류업체에 메일로 전송합니다"
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-bold text-white hover:brightness-110 disabled:opacity-60"
          >
            <Mail size={14} /> {sending ? '전송 중…' : '배송목록 전송'}
          </button>
          <button
            onClick={() => {
              if (selected.size === 0) {
                alert('송장번호를 입력할 배송건을 선택하세요.')
                return
              }
              setBatchOpen(true)
            }}
            title="선택한 건에 송장번호를 연속 입력합니다 (바코드 리더기 지원)"
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border px-4 text-sm font-bold text-[#c2cde0] hover:bg-hover"
          >
            <Barcode size={14} /> 송장 일괄입력
          </button>
          <button
            onClick={printSelected}
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border px-4 text-sm font-bold text-[#c2cde0] hover:bg-hover"
          >
            <Printer size={14} /> 송장인쇄
          </button>
          <button
            onClick={exportExcel}
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border px-4 text-sm font-bold text-[#c2cde0] hover:bg-hover"
          >
            <Download size={14} /> 엑셀 다운로드
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-bold text-white hover:brightness-110"
          >
            <Plus size={14} /> 신규 배송 등록
          </button>
          <button
            onClick={() => setRefresh((n) => n + 1)}
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border px-4 text-sm font-bold text-[#c2cde0] hover:bg-hover"
          >
            <RefreshCw size={14} /> 새로고침
          </button>
        </div>
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
        <div className="grid grid-cols-[repeat(5,minmax(140px,1fr))] gap-2 items-end">
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
          <Field label="교재">
            <select
              value={filter.book}
              onChange={(e) => setFilter({ ...filter, book: e.target.value })}
              className={inputCls}
            >
              <option value="">전체</option>
              {bookNames.map((b) => (
                <option key={b} value={b}>
                  {b}
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
                <th className="px-3 py-2 font-semibold w-8">
                  <input type="checkbox" checked={pageAllChecked} onChange={togglePageAll} />
                </th>
                <th className="px-3 py-2 font-semibold">배송번호</th>
                <th className="px-3 py-2 font-semibold text-center">접수일</th>
                <th className="px-3 py-2 font-semibold">수령인</th>
                <th className="px-3 py-2 font-semibold">연락처</th>
                <th className="px-3 py-2 font-semibold">주소</th>
                <th className="px-3 py-2 font-semibold">교재</th>
                <th className="px-3 py-2 font-semibold">송장</th>
                <th className="px-3 py-2 font-semibold text-center">상태</th>
                <th className="px-3 py-2 font-semibold text-center">관리</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((s) => (
                <tr key={s.id} className="border-b border-border hover:bg-hover">
                  <td className="px-3 py-1.5">
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleOne(s.id)} />
                  </td>
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
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => setDetailId(s.id)}
                        title="상세"
                        className="h-8 w-8 rounded-lg border border-border inline-flex items-center justify-center text-[#94a3b8] hover:bg-hover"
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        onClick={() => removeRow(s)}
                        title="삭제"
                        className="h-8 w-8 rounded-lg border border-border inline-flex items-center justify-center text-[#94a3b8] hover:bg-hover hover:text-danger"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-[#64748b]">
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

      {batchOpen && (
        <TrackingBatchModal
          shipments={sortByBook(rows.filter((r) => selected.has(r.id)))}
          onClose={() => setBatchOpen(false)}
          onDone={() => {
            setSelected(new Set())
            setRefresh((n) => n + 1)
          }}
        />
      )}

      {createOpen && (
        <DeliveryCreateModal onClose={() => setCreateOpen(false)} onCreated={() => setRefresh((n) => n + 1)} />
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
