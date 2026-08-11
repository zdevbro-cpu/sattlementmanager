import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Banknote, ChevronDown, ChevronUp, ChevronsUpDown, CreditCard, Download, Eye, Layers, Plus, RefreshCw, Trash2, Wallet } from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Badge, { categoryTone } from '../../components/ui/Badge'
import DateTextInput from '../../components/ui/DateTextInput'
import Pagination from '../../components/ui/Pagination'
import { comma, dateText, won } from '../../lib/format'
import { BUSINESS_UNITS } from '../../data/mockSales'
import {
  EMPTY_SALES_FILTER,
  type Sale,
  type SalesFilter,
} from '../../types/sales'
import { deleteSale, listSales, summarizeSales } from './salesStore'
import { useSalesCategories } from './salesCategoryStore'
import SalesRegisterModal from './SalesRegisterModal'
import SalesDetailDrawer from './SalesDetailDrawer'
import { downloadSalesListReport } from './dailyReportExcel'
import ContractRegisterModal from '../contract/ContractRegisterModal'


/** 오늘 날짜(YYYY-MM-DD) — 목록 화면 오픈 시 필터 기본값으로 사용 */
function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const TODAY = todayIso()
const DEFAULT_SALES_FILTER: SalesFilter = {
  ...EMPTY_SALES_FILTER,
  // 계약구간 시작은 오픈(미지정) — 종료만 오늘로 기본 제한
  endDate: TODAY,
  regEndDate: TODAY,
}

type SortKey = 'createdAt' | 'date'

export default function SalesListPage() {
  const categories = useSalesCategories()
  const [filter, setFilter] = useState<SalesFilter>(DEFAULT_SALES_FILTER)
  const [editingSale, setEditingSale] = useState<Sale | 'new' | null>(null)
  const [convertSale, setConvertSale] = useState<Sale | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const endDateRef = useRef<HTMLInputElement>(null)
  const regEndDateRef = useRef<HTMLInputElement>(null)

  const [rows, setRows] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  // 요약 카드는 검색조건이 반영된 현재 목록(rows) 기준으로 집계한다.
  const sum = summarizeSales(rows)
  // 비교용 전체값 — 조건이 바뀔 때마다 다시 받으면 목록 조회가 두 배가 되므로 최초 1회만 받는다
  const [totalSum, setTotalSum] = useState(() => summarizeSales([]))
  const isFiltered = JSON.stringify(filter) !== JSON.stringify(DEFAULT_SALES_FILTER)
  const [sortKey, setSortKey] = useState<SortKey>('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [perPage, setPerPage] = useState(20)
  const [page, setPage] = useState(1)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    setLoadErr('')
    listSales(filter)
      .then((list) => {
        if (alive) {
          setRows(list)
          setLoading(false)
        }
      })
      .catch((e) => {
        if (alive) {
          setLoadErr((e as Error).message || '목록을 불러오지 못했습니다.')
          setLoading(false)
        }
      })
    return () => {
      alive = false
    }
  }, [filter, refresh])

  useEffect(() => {
    let alive = true
    listSales(EMPTY_SALES_FILTER)
      .then((list) => {
        if (alive) setTotalSum(summarizeSales(list))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [refresh])

  useEffect(() => {
    setPage(1)
  }, [filter, sortKey, sortDir, perPage])

  const sortedRows = [...rows].sort((a, b) => {
    const av = sortKey === 'createdAt' ? a.createdAt : a.date
    const bv = sortKey === 'createdAt' ? b.createdAt : b.date
    const cmp = (av || '').localeCompare(bv || '')
    return sortDir === 'asc' ? cmp : -cmp
  })
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / perPage))
  const safePage = Math.min(page, totalPages)
  const pagedRows = sortedRows.slice((safePage - 1) * perPage, safePage * perPage)

  const [excelBusy, setExcelBusy] = useState(false)
  const onExcelDownload = async () => {
    const label =
      filter.startDate && filter.endDate
        ? filter.startDate === filter.endDate
          ? filter.startDate
          : `${filter.startDate}~${filter.endDate}`
        : '전체'
    setExcelBusy(true)
    try {
      await downloadSalesListReport(sortedRows, label)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setExcelBusy(false)
    }
  }

  const onDelete = async (s: Sale) => {
    if (s.source === 'contract') {
      alert('계약 보증금 연동 항목입니다. 계약관리에서 관리하세요.')
      return
    }
    if (!confirm('이 매출을 삭제할까요?')) return
    await deleteSale(s.id)
    setRefresh((n) => n + 1)
  }

  return (
    <AppLayout title="매출관리">
      {/* 헤더 */}
      <div className="mb-4">
        <h1 className="text-[22px] font-extrabold tracking-[-0.5px] text-text-strong">
          매출관리
        </h1>
      </div>

      {/* 교재구매관리는 사이드바 독립 메뉴(/textbook)로 분리했다 */}
      <>
          {/* 섹션 소제목 + 액션 버튼 */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-[18px] font-extrabold text-text-strong">결재관리</h2>
              <p className="text-[13px] text-[#94a3b8] mt-1">매출 결재 내역을 관리합니다.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setRefresh((n) => n + 1)}
                className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border px-4 text-sm font-bold text-[#c2cde0] hover:bg-hover"
              >
                <RefreshCw size={14} /> 새로고침
              </button>
              <button
                onClick={onExcelDownload}
                disabled={excelBusy}
                className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border px-4 text-sm font-bold text-[#c2cde0] hover:bg-hover disabled:opacity-60"
              >
                {excelBusy ? '다운로드 중…' : (<><Download size={15} /> 엑셀 다운로드</>)}
              </button>
              <button
                onClick={() => setEditingSale('new')}
                className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-bold text-white hover:brightness-110"
              >
                <Plus size={15} /> 매출 등록
              </button>
            </div>
          </div>

          {/* 요약 카드 */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <SummaryCard label="검색결과" value={`${won(sum.cardTotal + sum.cashTotal)} / ${sum.total}건`} sub="매출총액 / 건수" total={isFiltered ? `${won(totalSum.cardTotal + totalSum.cashTotal)} / ${totalSum.total}건` : undefined} tint="#e0edff" fg="#2563eb" icon={<Layers size={18} />} />
            <SummaryCard label="카드매출" value={won(sum.cardTotal)} sub="카드 매출 합계" total={isFiltered ? won(totalSum.cardTotal) : undefined} tint="#e0edff" fg="#2563eb" icon={<CreditCard size={18} />} />
            <SummaryCard label="현금매출" value={won(sum.cashTotal)} sub="현금 매출 합계" total={isFiltered ? won(totalSum.cashTotal) : undefined} tint="#e2f7ec" fg="#16a34a" icon={<Banknote size={18} />} />
            <SummaryCard label="분할 / 미검증" value={`${sum.splitCount} / ${sum.unverified}`} sub="분할결제 / 미검증 건수" total={isFiltered ? `${totalSum.splitCount} / ${totalSum.unverified}` : undefined} tint="#fff1e0" fg="#f59e0b" icon={<AlertTriangle size={18} />} />
          </div>

          {/* 필터 바 — 계약시작 ~ 입력자 성명 + 초기화 모두 1줄 */}
          <div className="rounded-[14px] border border-border bg-card p-4 mb-4 overflow-x-auto">
            <div className="grid grid-cols-[repeat(9,minmax(120px,1fr))_auto] gap-2 items-end min-w-[1400px]">
              <div className="col-span-2">
                <span className="mb-1 block text-[11.5px] font-semibold text-[#94a3b8]">
                  등록구간
                </span>
                <div className="flex items-center gap-1">
                  <DateTextInput
                    value={filter.regStartDate}
                    onChange={(v) => setFilter({ ...filter, regStartDate: v })}
                    onTabNext={() => regEndDateRef.current?.focus()}
                    className={inputCls}
                  />
                  <span className="shrink-0 text-[#64748b]">~</span>
                  <DateTextInput
                    ref={regEndDateRef}
                    value={filter.regEndDate}
                    onChange={(v) => setFilter({ ...filter, regEndDate: v })}
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="col-span-2">
                <span className="mb-1 block text-[11.5px] font-semibold text-[#94a3b8]">
                  계약구간
                </span>
                <div className="flex items-center gap-1">
                  <DateTextInput
                    value={filter.startDate}
                    onChange={(v) => setFilter({ ...filter, startDate: v })}
                    onTabNext={() => endDateRef.current?.focus()}
                    className={inputCls}
                  />
                  <span className="shrink-0 text-[#64748b]">~</span>
                  <DateTextInput
                    ref={endDateRef}
                    value={filter.endDate}
                    onChange={(v) => setFilter({ ...filter, endDate: v })}
                    className={inputCls}
                  />
                </div>
              </div>
              <Field label="종류">
                <select value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value })} className={inputCls}>
                  <option value="전체">전체</option>
                  {categories.map((c) => (
                    <option key={c.name}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="사업부">
                <input value={filter.businessUnit} onChange={(e) => setFilter({ ...filter, businessUnit: e.target.value })} placeholder="포함" className={inputCls} list="bu-list" />
                <datalist id="bu-list">
                  {BUSINESS_UNITS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </Field>
              <Field label="계약자">
                <input value={filter.buyer} onChange={(e) => setFilter({ ...filter, buyer: e.target.value })} placeholder="포함" className={inputCls} />
              </Field>
              <Field label="소속">
                <input value={filter.inputterOrg} onChange={(e) => setFilter({ ...filter, inputterOrg: e.target.value })} placeholder="포함" className={inputCls} />
              </Field>
              <Field label="담당자">
                <input value={filter.inputterName} onChange={(e) => setFilter({ ...filter, inputterName: e.target.value })} placeholder="포함" className={inputCls} />
              </Field>
              <div className="flex items-end gap-2">
                <button
                  onClick={() => setFilter(DEFAULT_SALES_FILTER)}
                  className="h-[38px] rounded-[8px] border border-border px-4 text-sm font-semibold text-[#c2cde0] hover:bg-hover whitespace-nowrap"
                >
                  초기화
                </button>
              </div>
            </div>
          </div>

          {/* 테이블 */}
          <div className="rounded-[14px] border border-border bg-card overflow-hidden">
            <div className="px-4 py-3">
              <span className="text-[15px] font-extrabold text-text-strong">
                총 <span className="text-primary">{rows.length}</span>건
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] text-[13px]">
                <thead>
                  <tr className="text-left text-[12.5px] text-[#94a3b8] border-y border-border">
                    {['번호', '소속', '등록일', '계약일', 'CAT ID', '사업부', '계약자', '내용', '금액', '카드사/입금은행', '카드번호', '승인번호/입금자', '담당자', '관리'].map(
                      (h) => {
                        const sortKeyFor: SortKey | null =
                          h === '등록일' ? 'createdAt' : h === '계약일' ? 'date' : null
                        return (
                          <th
                            key={h}
                            className={`px-3 py-1.5 font-semibold whitespace-nowrap ${
                              h === '금액' ? 'text-right' : h === '관리' ? 'text-center' : ''
                            }`}
                          >
                            {sortKeyFor ? (
                              <button
                                onClick={() => toggleSort(sortKeyFor)}
                                className="inline-flex items-center gap-0.5 hover:text-[#e2e8f0]"
                              >
                                {h}
                                {sortKey === sortKeyFor ? (
                                  sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                                ) : (
                                  <ChevronsUpDown size={12} className="opacity-50" />
                                )}
                              </button>
                            ) : (
                              h
                            )}
                          </th>
                        )
                      },
                    )}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((s, i) => (
                    <Row
                      key={s.id}
                      s={s}
                      no={sortedRows.length - ((safePage - 1) * perPage + i)}
                      onDetail={() => setDetailId(s.id)}
                      onDelete={() => onDelete(s)}
                    />
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={14} className="px-3 py-10 text-center text-[#64748b]">
                        {loading
                          ? '불러오는 중…'
                          : loadErr
                            ? `불러오기 실패: ${loadErr}`
                            : '조건에 맞는 매출이 없습니다.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {sortedRows.length > 0 && (
              <Pagination page={safePage} totalPages={totalPages} perPage={perPage} onPageChange={setPage} onPerPageChange={setPerPage} />
            )}
          </div>
      </>

      {editingSale && (
        <SalesRegisterModal
          sale={editingSale === 'new' ? undefined : editingSale}
          onClose={() => setEditingSale(null)}
          onCreated={() => {
            setEditingSale(null)
            setRefresh((n) => n + 1)
          }}
          onConvertToContract={(s) => {
            setEditingSale(null)
            setConvertSale(s)
          }}
        />
      )}
      {convertSale && (
        <ContractRegisterModal
          initialSale={convertSale}
          onClose={() => setConvertSale(null)}
          onCreated={() => {
            setConvertSale(null)
            setRefresh((n) => n + 1)
          }}
        />
      )}
      {detailId && (
        <SalesDetailDrawer
          saleId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(s) => {
            setDetailId(null)
            setEditingSale(s)
          }}
        />
      )}
    </AppLayout>
  )
}

const inputCls =
  'h-[38px] w-full rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary'


function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-semibold text-[#94a3b8]">{label}</span>
      {children}
    </label>
  )
}

function SummaryCard({
  label,
  value,
  tint,
  fg,
  sub,
  total,
  icon,
}: {
  label: string
  value: string
  tint: string
  fg: string
  sub?: string
  /** 검색조건이 걸렸을 때 비교용으로 보여주는 전체값 */
  total?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="rounded-[12px] border border-border bg-card p-4 flex items-center gap-3">
      <div className="h-[38px] w-[38px] rounded-[11px] flex items-center justify-center text-lg font-black" style={{ background: tint, color: fg }}>
        {icon ?? <Wallet size={18} />}
      </div>
      <div>
        <div className="text-[13px] font-semibold text-[#64748b]">{label}</div>
        <div className="text-[18px] font-extrabold text-text-strong leading-tight tabular">{value}</div>
        {sub && <div className="text-[11px] text-[#64748b] mt-0.5">{sub}</div>}
        {total && <div className="text-[11px] text-[#4b5a70] mt-0.5">전체 {total}</div>}
      </div>
    </div>
  )
}

function Row({
  s,
  no,
  onDetail,
  onDelete,
}: {
  s: Sale
  no: number
  onDetail: () => void
  onDelete: () => void
}) {
  const card = s.payment.cardInstallments[0]
  const cash = s.payment.cashInstallments[0]
  const splitN = Math.max(
    s.payment.cardInstallments.length,
    s.payment.cashInstallments.length,
  )
  const hasSplit = splitN > 1
  const catId = card?.terminalNo || '-'
  const issuer = card?.issuer || (cash ? (cash.bank || '현금') : '-') // 카드사 / 입금은행
  const cardNo = card?.cardNumber || cash?.identifierNo || '-'
  const approval = card?.approvalNo || cash?.depositor || '-' // 승인번호 / 입금자

  return (
    <tr className="border-b border-border hover:bg-hover">
      <td className="px-3 py-1.5 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <span className="tabular text-[#c2cde0]">{no}</span>
          {hasSplit && (
            <span
              className="inline-flex items-center gap-0.5 rounded-md bg-[#fff1e0] px-1.5 py-0.5 text-[10.5px] font-bold text-[#b45309]"
              title={`${splitN}회 분할결제`}
            >
              <Layers size={10} />{splitN}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap">{s.org}</td>
      <td className="px-3 py-1.5 tabular whitespace-nowrap">{dateText(s.createdAt)}</td>
      <td className="px-3 py-1.5 tabular whitespace-nowrap">{dateText(s.date)}</td>
      <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#94a3b8]">{catId}</td>
      <td className="px-3 py-1.5 whitespace-nowrap">{s.businessUnit}</td>
      <td className="px-3 py-1.5 font-semibold text-text-strong whitespace-nowrap">
        <span className="flex items-center gap-1.5">
          {s.buyer}
          {s.source === 'contract' && (
            <Badge tone="slate" className="!text-[10px] !px-1.5">
              계약
            </Badge>
          )}
        </span>
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap">
        <Badge tone={categoryTone(s.category)}>{s.category}</Badge>
      </td>
      <td className="px-3 py-1.5 tabular text-right font-bold text-warning whitespace-nowrap">
        {comma(s.payment.totalAmount)}
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap">{issuer}</td>
      <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#94a3b8]">{cardNo}</td>
      <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#94a3b8]">{approval}</td>
      <td className="px-3 py-1.5 whitespace-nowrap">{s.manager}</td>
      <td className="px-3 py-1.5 whitespace-nowrap text-center">
        <div className="flex items-center justify-center gap-1.5">
          <button
            onClick={onDetail}
            title="상세"
            className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-[#94a3b8] hover:bg-hover hover:text-white transition-colors"
          >
            <Eye size={16} />
          </button>
          <button
            onClick={onDelete}
            title="삭제"
            className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-danger hover:bg-hover hover:brightness-125 transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </td>
    </tr>
  )
}
