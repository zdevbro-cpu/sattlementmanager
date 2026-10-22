import { useEffect, useRef, useState } from 'react'
import { Clock, Download, Eye, FileText, PlusCircle, Trash2, XCircle } from 'lucide-react'
import type { ComponentType } from 'react'
import { dateText, todayIso, usd, won } from '../../lib/format'
import { useCodes } from '../../lib/codeStore'
import StatusBadge from '../../components/ui/StatusBadge'
import Badge from '../../components/ui/Badge'
import DateTextInput from '../../components/ui/DateTextInput'
import Pagination from '../../components/ui/Pagination'
import { useBranches } from '../appointment/branchStore'
import { EMPTY_FILTER, type Contract, type ContractFilter } from '../../types/contract'
import { downloadListAsExcel } from '../../lib/excelExport'
import { addHistory, listContracts } from './contractStore'
import ContractDetailDrawer from './ContractDetailDrawer'
import { currencyOn, isUsContract, receiptTotals, usDocStatus } from './usLasOn'

const HEADERS = [
  '번호', '계약일자', '이름', '구분', '상태',
  '약정($)', '입금합계($)', '원화환산', '잔액($)', '완납일', '입금계좌', '수령통화', '서류',
  'BOA 은행', 'BOA 계좌번호', '영문 예금주', '유치자', '비고', '관리',
]
const MONEY_HEADERS = ['약정($)', '입금합계($)', '원화환산', '잔액($)']

// 등록구간·계약구간 종료일은 오늘 날짜를 기본값으로 사용 (시작은 비워둠 = 전체 이력 포함) — 라스온현황과 동일
const DEFAULT_FILTER: ContractFilter = {
  ...EMPTY_FILTER,
  regEndDate: todayIso(),
  contractEndDate: todayIso(),
}
// 상태 드롭다운 전용 sentinel — 실제 status 값이 아니라 "전체 + 폐기 포함"을 뜻하는 선택지 (라스온현황과 동일)
const INCLUDE_DISCARDED_VALUE = '__include_discarded__'

interface UsRow {
  no: number
  c: Contract
  isLeader: boolean
}

/**
 * 미국라스온(파트장,파트너) 계약 현황 — 국내 라스온현황과 같은 방식으로 파트장 아래 소속 파트너를 묶어 보여준다.
 * 국내와 미국라스온은 별개 조직이라 미국라스온 계약만 대상으로 한다.
 * 금액은 달러(약정·입금합계·잔액)와 원화환산(입금장부의 입금일 환율 합계)을 함께 보여준다.
 */
export default function UsLasOnStatusPage() {
  const codes = useCodes()
  const branches = useBranches()
  const [businessUnit, setBusinessUnit] = useState('전체')
  const [filter, setFilter] = useState<ContractFilter>(DEFAULT_FILTER)
  const [includeDiscarded, setIncludeDiscarded] = useState(false)
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [perPage, setPerPage] = useState(20)
  const [page, setPage] = useState(1)
  const contractEndDateRef = useRef<HTMLInputElement>(null)
  const regEndDateRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    listContracts(EMPTY_FILTER).then((list) => {
      if (alive) {
        setContracts(
          list.filter(
            (c) =>
              isUsContract(c.current) &&
              (c.current.contractType === 'LAS-On파트장' || c.current.contractType === 'LAS-On파트너'),
          ),
        )
        setLoading(false)
      }
    })
    return () => {
      alive = false
    }
  }, [refresh])

  useEffect(() => {
    setPage(1)
  }, [filter, businessUnit, includeDiscarded, perPage])

  const onDelete = async (c: Contract) => {
    if (c.current.status === '폐기') {
      alert('이미 폐기 처리된 계약입니다.')
      return
    }
    if (!confirm(`${c.current.contractorName} 계약을 폐기 처리할까요? (삭제 대신 상태가 "폐기"로 전환되며 이력은 보존됩니다)`))
      return
    await addHistory(c.id, {
      ...c.current,
      historyId: '',
      status: '폐기',
      eventDate: todayIso(),
      memo: '목록에서 폐기 처리',
      createdAt: todayIso(),
    })
    setRefresh((n) => n + 1)
  }

  // 관리자·유치자 자동완성 목록 — 현재 불러온 계약에 실제로 입력된 값 기준
  const managerOptions = Array.from(new Set(contracts.map((c) => c.current.manager).filter(Boolean))).sort()
  const recruiterOptions = Array.from(new Set(contracts.map((c) => c.current.recruiter).filter(Boolean))).sort()

  // 라스온현황과 동일한 필터 조건
  const filtered = contracts.filter((c) => {
    const s = c.current
    if (businessUnit !== '전체' && s.businessUnit !== businessUnit) return false
    if (filter.org !== '전체' && s.org !== filter.org) return false
    if (filter.branch !== '전체' && s.branch !== filter.branch) return false
    if (filter.manager && !s.manager.includes(filter.manager)) return false
    if (filter.recruiter && !s.recruiter.includes(filter.recruiter)) return false
    if (filter.keyword && !s.contractorName.includes(filter.keyword)) return false
    if (filter.contractDate && s.contractDate && s.contractDate < filter.contractDate) return false
    if (filter.contractEndDate && s.contractDate && s.contractDate > filter.contractEndDate) return false
    if (filter.regStartDate && s.createdAt && s.createdAt < filter.regStartDate) return false
    if (filter.regEndDate && s.createdAt && s.createdAt > filter.regEndDate) return false
    if (filter.status !== '전체') {
      if (s.status !== filter.status) return false
    } else if (!includeDiscarded && s.status === '폐기') {
      return false
    }
    return true
  })

  const leaders = filtered.filter((c) => c.current.contractType === 'LAS-On파트장')
  const partnersOf = (leaderId: string) =>
    filtered.filter((c) => c.current.contractType === 'LAS-On파트너' && c.current.parentContractId === leaderId)
  const unassignedPartners = filtered.filter(
    (c) =>
      c.current.contractType === 'LAS-On파트너' &&
      (!c.current.parentContractId || !leaders.some((l) => l.id === c.current.parentContractId)),
  )

  const rows: UsRow[] = []
  leaders.forEach((leader) => {
    rows.push({ no: 0, c: leader, isLeader: true })
    partnersOf(leader.id).forEach((p) => rows.push({ no: 0, c: p, isLeader: false }))
  })
  unassignedPartners.forEach((p) => rows.push({ no: 0, c: p, isLeader: false }))
  // 라스온현황과 동일하게 번호를 역순으로 표시
  rows.forEach((r, i) => {
    r.no = rows.length - i
  })

  // 요약 카드 — 라스온현황과 동일하게 검색필터와 무관한 전체 미국라스온 계약 기준
  const isEnded = (c: Contract) => c.current.status === '해지' || c.current.status === '폐기'
  const activeList = contracts.filter((c) => !isEnded(c) && !c.current.isDraft)
  const draftList = contracts.filter((c) => !isEnded(c) && c.current.isDraft)
  const monthPrefix = todayIso().slice(0, 7)
  const depositTotal = activeList.reduce((a, c) => a + (c.current.deposit || 0), 0)
  const krwTotal = activeList.reduce((a, c) => a + receiptTotals(c.receipts).krw, 0)
  const monthList = activeList.filter((c) => (c.current.contractDate ?? '').startsWith(monthPrefix))
  const monthTotal = monthList.reduce((a, c) => a + (c.current.deposit || 0), 0)
  const terminated = contracts.filter(isEnded).length

  const totalPages = Math.max(1, Math.ceil(rows.length / perPage))
  const safePage = Math.min(page, totalPages)
  const pagedRows = rows.slice((safePage - 1) * perPage, safePage * perPage)

  /** 행 표시값 — 표와 엑셀이 같은 값을 쓴다 */
  const view = (c: Contract) => {
    const s = c.current
    const t = receiptTotals(c.receipts)
    const docs = usDocStatus(c)
    return {
      paidUsd: t.usd,
      paidKrw: t.krw,
      balance: s.deposit - t.usd,
      currency: currencyOn(c.payoutCurrencyChanges, todayIso()) === 'USD' ? '달러' : '원화',
      docs: docs.complete ? '완비' : `누락: ${docs.missing.join(', ')}`,
      docsOk: docs.complete,
    }
  }

  const onExcelDownload = () => {
    if (rows.length === 0) {
      alert('출력할 데이터가 없습니다.')
      return
    }
    const headers = HEADERS.filter((h) => h !== '관리')
    const data = rows.map((r) => {
      const s = r.c.current
      const v = view(r.c)
      return [
        r.no,
        dateText(s.contractDate),
        s.contractorName,
        r.isLeader ? '파트장' : '파트너',
        s.isDraft ? '임시저장' : s.status,
        s.deposit,
        v.paidUsd,
        v.paidKrw,
        v.balance,
        dateText(s.fullyPaidDate),
        s.depositAccount || '-',
        v.currency,
        v.docs,
        s.boaBankName || '-',
        s.boaAccountNo || '-',
        s.boaAccountOwner || '-',
        s.recruiter || '-',
        s.memo || '-',
      ]
    })
    downloadListAsExcel(`미국라스온현황_${todayIso()}.xlsx`, headers, data, undefined, [5, 6, 7, 8])
  }

  return (
    <>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-[18px] font-extrabold text-text-strong">미국라스온 (파트장,파트너) 계약 현황</h2>
          <p className="text-[13px] text-[#94a3b8] mt-1">
            파트장과 소속 파트너 계약을 묶어서 보여줍니다. 국내 라스온과는 별개 조직으로 운영됩니다.
          </p>
        </div>
        <button
          onClick={onExcelDownload}
          className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border px-4 text-sm font-bold text-[#c2cde0] hover:bg-hover"
        >
          <Download size={15} /> 엑셀 다운로드
        </button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-5 gap-4 mb-4">
        <SummaryCard label="계약총액" value={usd(depositTotal)} sub={`원화환산 ${won(krwTotal)} · ${activeList.length}건`} tint="#e0edff" fg="#2563eb" icon={FileText} />
        <SummaryCard label="이번달 계약총액" value={usd(monthTotal)} sub={`${monthList.length}건`} tint="#fff1e0" fg="#f59e0b" icon={PlusCircle} />
        <SummaryCard label="진행중" value={activeList.length} tint="#e2f7ec" fg="#16a34a" icon={FileText} />
        <SummaryCard label="서류미비(임시저장)" value={draftList.length} tint="#f1f5f9" fg="#64748b" icon={Clock} />
        <SummaryCard label="해지·폐기" value={terminated} tint="#fee2e2" fg="#ef4444" icon={XCircle} />
      </div>

      {/* 필터 바 — 라스온현황과 동일 구성 */}
      <div className="rounded-[14px] border border-border bg-card p-4 mb-4 overflow-x-auto">
        <div className="grid grid-cols-[repeat(11,minmax(120px,1fr))_auto] gap-2 items-end min-w-[1750px]">
          <Field label="사업부">
            <select value={businessUnit} onChange={(e) => setBusinessUnit(e.target.value)} className={inputCls}>
              <option value="전체">전체</option>
              {codes.businessUnits.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </Field>
          <Field label="소속">
            <SelectFilter value={filter.org} options={codes.orgs} onChange={(v) => setFilter({ ...filter, org: v })} />
          </Field>
          <div className="col-span-2">
            <span className="mb-1 block text-[11.5px] font-semibold text-[#94a3b8]">등록구간</span>
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
          <Field label="계약자명">
            <input
              value={filter.keyword}
              onChange={(e) => setFilter({ ...filter, keyword: e.target.value })}
              placeholder="계약자명 검색"
              className={inputCls}
            />
          </Field>
          <div className="col-span-2">
            <span className="mb-1 block text-[11.5px] font-semibold text-[#94a3b8]">계약구간</span>
            <div className="flex items-center gap-1">
              <DateTextInput
                value={filter.contractDate}
                onChange={(v) => setFilter({ ...filter, contractDate: v })}
                onTabNext={() => contractEndDateRef.current?.focus()}
                className={inputCls}
              />
              <span className="shrink-0 text-[#64748b]">~</span>
              <DateTextInput
                ref={contractEndDateRef}
                value={filter.contractEndDate}
                onChange={(v) => setFilter({ ...filter, contractEndDate: v })}
                className={inputCls}
              />
            </div>
          </div>
          <Field label="지점명">
            <SelectFilter value={filter.branch} options={branches} onChange={(v) => setFilter({ ...filter, branch: v })} />
          </Field>
          <Field label="관리자">
            <input
              value={filter.manager}
              onChange={(e) => setFilter({ ...filter, manager: e.target.value })}
              placeholder="관리자 검색"
              list="us-lason-manager-filter-list"
              className={inputCls}
            />
            <datalist id="us-lason-manager-filter-list">
              {managerOptions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
          <Field label="유치자">
            <input
              value={filter.recruiter}
              onChange={(e) => setFilter({ ...filter, recruiter: e.target.value })}
              placeholder="유치자 검색"
              list="us-lason-recruiter-filter-list"
              className={inputCls}
            />
            <datalist id="us-lason-recruiter-filter-list">
              {recruiterOptions.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </Field>
          <Field label="상태">
            <select
              value={includeDiscarded && filter.status === '전체' ? INCLUDE_DISCARDED_VALUE : filter.status}
              onChange={(e) => {
                const v = e.target.value
                if (v === INCLUDE_DISCARDED_VALUE) {
                  setIncludeDiscarded(true)
                  setFilter({ ...filter, status: '전체' })
                } else {
                  setIncludeDiscarded(false)
                  setFilter({ ...filter, status: v })
                }
              }}
              className={inputCls}
            >
              <option value="전체">전체(폐기미포함)</option>
              {codes.statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value={INCLUDE_DISCARDED_VALUE}>전체(폐기포함)</option>
            </select>
          </Field>
          <button
            onClick={() => {
              setFilter(DEFAULT_FILTER)
              setIncludeDiscarded(false)
              setBusinessUnit('전체')
            }}
            className="h-[38px] rounded-[8px] border border-border px-5 text-sm font-semibold text-[#c2cde0] hover:bg-hover whitespace-nowrap"
          >
            초기화
          </button>
        </div>
      </div>

      <div className="rounded-[14px] border border-border bg-card overflow-hidden">
        <div className="px-4 py-3">
          <span className="text-[15px] font-extrabold text-text-strong">
            계약 현황 <span className="text-[#64748b] font-semibold">({rows.length})</span>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1700px] text-[13px]">
            <thead>
              <tr className="text-left text-[12.5px] text-[#94a3b8] border-y border-border">
                {HEADERS.map((h) => (
                  <th
                    key={h}
                    className={`px-3 py-1.5 font-semibold whitespace-nowrap ${
                      MONEY_HEADERS.includes(h) ? 'text-right' : h === '관리' ? 'text-center' : ''
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((r) => {
                const s = r.c.current
                const v = view(r.c)
                return (
                  <tr key={r.c.id} className={`border-b border-border hover:bg-hover ${r.isLeader ? 'bg-input/40' : ''}`}>
                    <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#c2cde0]">{r.no}</td>
                    <td className="px-3 py-1.5 tabular whitespace-nowrap">{dateText(s.contractDate)}</td>
                    <td className={`px-3 py-1.5 whitespace-nowrap ${r.isLeader ? 'font-extrabold text-text-strong' : 'font-semibold pl-6'}`}>
                      {!r.isLeader && '↳ '}
                      {s.contractorName}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <Badge tone={r.isLeader ? 'blue' : 'green'}>{r.isLeader ? '파트장' : '파트너'}</Badge>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {s.isDraft ? (
                        <span className="inline-flex items-center rounded-full border border-dashed border-[#94a3b8] px-2 py-0.5 text-[11.5px] font-semibold text-[#94a3b8]">
                          임시저장
                        </span>
                      ) : (
                        <StatusBadge status={s.status} />
                      )}
                    </td>
                    <td className="px-3 py-1.5 tabular text-right whitespace-nowrap">{usd(s.deposit)}</td>
                    <td className="px-3 py-1.5 tabular text-right font-bold text-warning whitespace-nowrap">{usd(v.paidUsd)}</td>
                    <td className="px-3 py-1.5 tabular text-right whitespace-nowrap">{won(v.paidKrw)}</td>
                    <td className="px-3 py-1.5 tabular text-right whitespace-nowrap">
                      {v.balance === 0 ? '-' : v.balance > 0 ? usd(v.balance) : `초과 ${usd(-v.balance)}`}
                    </td>
                    <td className="px-3 py-1.5 tabular whitespace-nowrap">{dateText(s.fullyPaidDate)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{s.depositAccount || '-'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{v.currency}</td>
                    <td className={`px-3 py-1.5 whitespace-nowrap font-semibold ${v.docsOk ? 'text-success' : 'text-warning'}`}>{v.docs}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{s.boaBankName || '-'}</td>
                    <td className="px-3 py-1.5 tabular whitespace-nowrap">{s.boaAccountNo || '-'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{s.boaAccountOwner || '-'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{s.recruiter}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-[#94a3b8]">{s.memo || '-'}</td>
                    <td className="px-3 py-1.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setDetailId(r.c.id)}
                          title="상세 보기"
                          className="h-8 w-8 rounded-lg border border-border inline-flex items-center justify-center text-[#94a3b8] hover:bg-hover hover:text-white"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => onDelete(r.c)}
                          title="폐기 처리"
                          className="h-8 w-8 rounded-lg border border-border inline-flex items-center justify-center text-danger hover:bg-hover hover:brightness-125"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={HEADERS.length} className="px-3 py-10 text-center text-[#64748b]">
                    {loading ? '불러오는 중…' : '조건에 맞는 미국라스온 계약이 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && (
          <Pagination page={safePage} totalPages={totalPages} perPage={perPage} onPageChange={setPage} onPerPageChange={setPerPage} />
        )}
      </div>

      {detailId && (
        <ContractDetailDrawer
          contractId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={() => setRefresh((n) => n + 1)}
        />
      )}
    </>
  )
}

const inputCls =
  'h-[38px] w-full rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary'

function SelectFilter({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      <option value="전체">전체</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
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

function SummaryCard({
  label,
  value,
  sub,
  tint,
  fg,
  icon: Icon,
}: {
  label: string
  value: number | string
  sub?: string
  tint: string
  fg: string
  icon: ComponentType<{ size?: number }>
}) {
  return (
    <div className="rounded-[12px] border border-border bg-card p-4 flex items-center gap-3">
      <div className="h-[38px] w-[38px] shrink-0 rounded-[11px] flex items-center justify-center" style={{ background: tint, color: fg }}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-[#64748b]">{label}</div>
        <div className="text-[18px] font-extrabold text-text-strong leading-tight tabular whitespace-nowrap">{value}</div>
        {sub && <div className="text-[12px] font-semibold text-[#94a3b8] mt-0.5 whitespace-nowrap">{sub}</div>}
      </div>
    </div>
  )
}
