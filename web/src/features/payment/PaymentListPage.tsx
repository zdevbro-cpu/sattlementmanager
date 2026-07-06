import { useEffect, useMemo, useState } from 'react'
import { Calendar, DollarSign, Landmark, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import { comma, dateText, won } from '../../lib/format'
import { EMPTY_FILTER, type Contract } from '../../types/contract'
import { listContracts } from '../contract/contractStore'
import { type ExtraPayee, type PayoutCategory } from '../../types/payout'
import { EMPTY_APPOINTMENT_FILTER, type Appointment } from '../../types/appointment'
import { listAppointments } from '../appointment/appointmentStore'
import { usePositionSalaries } from '../appointment/positionSalaryStore'
import {
  createExtraPayoutApi,
  deleteExtraPayoutApi,
  fetchExtraPayouts,
} from '../../lib/api'

/** 오늘 날짜(YYYY-MM-DD) — 화면 오픈 시 필터 기본값으로 사용 */
function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const TODAY = todayIso()
const WITHHOLDING = 0.033 // 원천징수 3.3%

/**
 * [startISO, endISO] 범위 안에서 매월 payDay(급여일)에 해당하는 실제 날짜를 찾는다.
 * 여러 달에 걸친 범위도 달력 기준으로 정확히 검사한다 (일(day) 숫자만 비교하지 않음).
 * 매칭되는 날짜가 있으면 그 ISO 날짜를, 없으면 null을 반환한다.
 */
function findPayDate(startISO: string, endISO: string, payDay: number): string | null {
  if (!startISO || !endISO || !payDay) return null
  const start = new Date(`${startISO}T00:00:00`)
  const end = new Date(`${endISO}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  const cur = new Date(start.getFullYear(), start.getMonth(), 1)
  while (cur <= end) {
    const daysInMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate()
    const candidate = new Date(cur.getFullYear(), cur.getMonth(), Math.min(payDay, daysInMonth))
    if (candidate >= start && candidate <= end) {
      const y = candidate.getFullYear()
      const m = String(candidate.getMonth() + 1).padStart(2, '0')
      const d = String(candidate.getDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
    cur.setMonth(cur.getMonth() + 1)
  }
  return null
}

const inputCls =
  'h-[38px] w-full rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary'

export default function PaymentListPage() {
  const [category, setCategory] = useState<PayoutCategory>('수익금')

  return (
    <AppLayout title="지급관리">
      <div className="mb-4">
        <h1 className="text-[22px] font-extrabold tracking-[-0.5px] text-text-strong">
          지급관리
        </h1>
      </div>

      <div className="flex gap-1 mb-5 border-b border-border">
        <TabButton active={category === '수익금'} onClick={() => setCategory('수익금')}>
          수익금지급
        </TabButton>
        <TabButton active={category === '급여'} onClick={() => setCategory('급여')}>
          급여관리
        </TabButton>
      </div>

      {category === '수익금' ? <RevenuePayoutView /> : <SalaryPayoutView />}
    </AppLayout>
  )
}

/* ── 수익금지급 (금일 수당지급 대상자 — 계약 파생) ──────────── */

interface RevenueFilter {
  startDate: string
  endDate: string
  keyword: string
}
const EMPTY_REVENUE_FILTER: RevenueFilter = {
  startDate: TODAY,
  endDate: TODAY,
  keyword: '',
}

function RevenuePayoutView() {
  const [filter, setFilter] = useState<RevenueFilter>(EMPTY_REVENUE_FILTER)
  const [extras, setExtras] = useState<ExtraPayee[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [contracts, setContracts] = useState<Contract[]>([])

  useEffect(() => {
    listContracts(EMPTY_FILTER).then(setContracts)
    fetchExtraPayouts().then(setExtras)
  }, [])

  const payout = (allowance: number) =>
    Math.round(allowance * (1 - WITHHOLDING))

  const all = useMemo(
    () =>
      contracts
        .map((c) => c.current)
        .filter(
          (s) => s.allowance > 0 && s.status !== '해지' && s.status !== '폐기',
        ),
    [contracts],
  )

  // 급여일(수당지급일) 기준 — 검색기간(시작일~종료일) 안에 실제로 급여일이 도래하는 계약만 표시
  const targets = useMemo(() => {
    const { startDate, endDate, keyword } = filter
    const kw = keyword.trim()
    return all
      .filter((s) => !!s.allowancePayDay) // 급여일 미지정 계약은 제외
      .map((s) => ({ s, payBaseDate: findPayDate(startDate, endDate, s.allowancePayDay) }))
      .filter(({ payBaseDate }) => payBaseDate !== null)
      .filter(({ s }) => !kw || s.contractorName.includes(kw))
  }, [all, filter])

  const extraTotal = extras.reduce((a, e) => a + e.amount, 0)
  const sumPayout = targets.reduce((a, { s }) => a + payout(s.allowance), 0) + extraTotal
  const heldCount = targets.filter(
    ({ s }) => s.status.includes('대기') || s.status.includes('변경'),
  ).length
  const totalCount = targets.length + extras.length

  const reset = () => setFilter(EMPTY_REVENUE_FILTER)
  const removeExtra = (id: string) => {
    setExtras(extras.filter((e) => e.id !== id))
    deleteExtraPayoutApi(id).catch(() => {})
  }
  const addExtra = async (p: Omit<ExtraPayee, 'id'>) => {
    const created = await createExtraPayoutApi(p)
    setExtras((prev) => [created, ...prev])
  }
  // contractmanager 출력 기능 준용 — 텍스트 파일(.txt) 다운로드
  const onExport = () => {
    if (totalCount === 0) {
      alert('출력할 데이터가 없습니다.')
      return
    }
    const amountOnly = (v: number) => `${v.toLocaleString('ko-KR')}원`
    // 이름  내역  금액  주민번호 / 은행명  계좌번호  예금주
    const body = [
      ...targets.map(
        ({ s }) =>
          `${s.contractorName}  수당  ${amountOnly(payout(s.allowance))}  ${s.residentNo} / ${s.bankName}  ${s.accountNo}  ${s.contractorName}`,
      ),
      ...extras.map(
        (e) =>
          `${e.name}  ${e.memo || '-'}  ${amountOnly(e.amount)}  ${e.residentNo} / ${e.bankName}  ${e.accountNo}  ${e.accountOwner}`,
      ),
    ]
    const content = body.join('\r\n')
    const fileName = `수익금지급목록_${filter.endDate}_${filter.startDate}.txt`
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-[18px] font-extrabold text-text-strong">수익금 지급관리</h2>
          <p className="text-[13px] text-[#94a3b8] mt-1">
            지급 대상 및 지급 상태를 관리합니다.
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="h-10 rounded-[10px] bg-primary px-4 text-sm font-bold text-white hover:brightness-110"
        >
          ＋ 추가지급 대상자
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <SummaryCard label="지급대상 건수" value={`${totalCount} 건`} sub="기간 필터 기준" tint="#e0edff" fg="#2563eb" icon={<Wallet size={18} />} />
        <SummaryCard label="지급예정 금액" value={won(sumPayout)} sub="기간 내 총 예상 지급" tint="#e2f7ec" fg="#16a34a" icon={<DollarSign size={18} />} />
        <SummaryCard label="지급보류 건수" value={`${heldCount} 건`} sub="대기/변경 건수" tint="#fff1e0" fg="#f59e0b" icon={<Landmark size={18} />} />
      </div>

      {/* 필터 · 출력 */}
      <div className="rounded-[14px] border border-border bg-card p-4 mb-4">
        <div className="grid grid-cols-[1fr_1fr_2fr_auto_auto] gap-3 items-end">
          <Field label="시작일">
            <DateInput value={filter.startDate} onChange={(v) => setFilter({ ...filter, startDate: v })} />
          </Field>
          <Field label="종료일">
            <DateInput value={filter.endDate} onChange={(v) => setFilter({ ...filter, endDate: v })} />
          </Field>
          <Field label="계약자명">
            <input value={filter.keyword} onChange={(e) => setFilter({ ...filter, keyword: e.target.value })} placeholder="계약자명 검색" className={inputCls} />
          </Field>
          <button onClick={reset} className="h-[38px] rounded-[8px] border border-border px-5 text-sm font-semibold text-[#c2cde0] hover:bg-hover">초기화</button>
          <button onClick={onExport} className="h-[38px] rounded-[8px] bg-primary px-5 text-sm font-bold text-white hover:brightness-110">출력</button>
        </div>
      </div>

      <div className="rounded-[14px] border border-border bg-card overflow-hidden">
        <div className="px-4 py-3">
          <span className="text-[15px] font-extrabold text-text-strong">
            지급 대상 <span className="text-primary">{totalCount}</span>건
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-[13px]">
            <thead>
              <tr className="text-left text-[12.5px] text-[#94a3b8] border-y border-border">
                {[
                  ['구분', 'center'],
                  ['지급기준일', 'center'],
                  ['계약자명', ''],
                  ['추천인', ''],
                  ['은행명', ''],
                  ['계좌번호', ''],
                  ['계약일자', 'center'],
                  ['계약종료일', 'center'],
                  ['보증금액', 'right'],
                  ['수당', 'right'],
                  ['지급금액', 'right'],
                  ['관리', 'center'],
                ].map(([h, a]) => (
                  <th key={h} className={`px-3 py-1.5 font-semibold whitespace-nowrap ${a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {targets.map(({ s, payBaseDate }, i) => (
                <tr key={`${s.historyId}-${i}`} className="border-b border-border hover:bg-hover">
                  <td className="px-3 py-1.5 text-center whitespace-nowrap text-[#94a3b8]">정기</td>
                  <td className="px-3 py-1.5 tabular text-center whitespace-nowrap">{dateText(payBaseDate)}</td>
                  <td className="px-3 py-1.5 font-semibold text-text-strong whitespace-nowrap">{s.contractorName}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{s.recruiter}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{s.bankName}</td>
                  <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#94a3b8]">{maskAccount(s.accountNo)}</td>
                  <td className="px-3 py-1.5 tabular text-center whitespace-nowrap">{dateText(s.contractDate)}</td>
                  <td className="px-3 py-1.5 tabular text-center whitespace-nowrap">{dateText(s.contractEndDate)}</td>
                  <td className="px-3 py-1.5 tabular text-right whitespace-nowrap">{comma(s.deposit)} 원</td>
                  <td className="px-3 py-1.5 tabular text-right whitespace-nowrap">{comma(s.allowance)} 원</td>
                  <td className="px-3 py-1.5 tabular text-right font-bold text-text-strong whitespace-nowrap">{comma(payout(s.allowance))} 원</td>
                  <td className="px-3 py-1.5 text-center whitespace-nowrap">-</td>
                </tr>
              ))}
              {extras.map((e) => (
                <tr key={e.id} className="border-b border-border hover:bg-hover">
                  <td className="px-3 py-1.5 text-center whitespace-nowrap">
                    <span className="inline-flex items-center rounded-md bg-[#f0eafd] px-1.5 py-0.5 text-[10.5px] font-bold text-[#8b5cf6]">추가</span>
                  </td>
                  <td className="px-3 py-1.5 tabular text-center whitespace-nowrap text-[#64748b]">-</td>
                  <td className="px-3 py-1.5 font-semibold text-text-strong whitespace-nowrap">{e.name}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-[#94a3b8]">{e.memo || '-'}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{e.bankName}</td>
                  <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#94a3b8]">{maskAccount(e.accountNo)}</td>
                  <td className="px-3 py-1.5 tabular text-center whitespace-nowrap text-[#64748b]">-</td>
                  <td className="px-3 py-1.5 tabular text-center whitespace-nowrap text-[#64748b]">-</td>
                  <td className="px-3 py-1.5 tabular text-right whitespace-nowrap text-[#64748b]">-</td>
                  <td className="px-3 py-1.5 tabular text-right whitespace-nowrap text-[#64748b]">-</td>
                  <td className="px-3 py-1.5 tabular text-right font-bold text-text-strong whitespace-nowrap">{comma(e.amount)} 원</td>
                  <td className="px-3 py-1.5 text-center whitespace-nowrap">
                    <button
                      onClick={() => removeExtra(e.id)}
                      title="삭제"
                      className="h-7 w-7 rounded-md border border-border inline-flex items-center justify-center text-danger hover:bg-hover"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {totalCount === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-10 text-center text-[#64748b]">
                    조건에 맞는 수익금지급 대상자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {addOpen && (
        <AddExtraPayeeModal
          onClose={() => setAddOpen(false)}
          onAdd={async (p) => {
            await addExtra(p)
            setAddOpen(false)
          }}
        />
      )}
    </div>
  )
}

/** 추가지급 대상자 등록 모달 — 조직관리(임용계약) / 계약자 중에서 선택해 금액을 수동 입력한다 */
function AddExtraPayeeModal({
  onClose,
  onAdd,
}: {
  onClose: () => void
  onAdd: (p: Omit<ExtraPayee, 'id'>) => void | Promise<void>
}) {
  const [keyword, setKeyword] = useState('')
  const [selectedKey, setSelectedKey] = useState('')
  const [memo, setMemo] = useState('')
  const [amount, setAmount] = useState(0)
  const [candidates, setCandidates] = useState<
    {
      key: string
      source: '조직관리' | '계약자'
      name: string
      residentNo: string
      bankName: string
      accountNo: string
      accountOwner: string
    }[]
  >([])

  useEffect(() => {
    Promise.all([
      listContracts(EMPTY_FILTER),
      listAppointments(EMPTY_APPOINTMENT_FILTER),
    ]).then(([contracts, appointments]) => {
      const contractCandidates = contracts
        .map((c) => c.current)
        .filter((s) => s.status !== '해지' && s.status !== '폐기')
        .map((s) => ({
          key: `c-${s.historyId}`,
          source: '계약자' as const,
          name: s.contractorName,
          residentNo: s.residentNo,
          bankName: s.bankName,
          accountNo: s.accountNo,
          accountOwner: s.accountOwner || s.contractorName,
        }))
      const appointmentCandidates = appointments
        .filter((a: Appointment) => a.status === '정상운영')
        .map((a: Appointment) => ({
          key: `a-${a.id}`,
          source: '조직관리' as const,
          name: a.name,
          residentNo: a.residentNo,
          bankName: a.bankName,
          accountNo: a.accountNo,
          accountOwner: a.accountOwner || a.name,
        }))
      // 계약자/임용자 구분 없이 하나의 목록으로 통합해 검색
      setCandidates([...contractCandidates, ...appointmentCandidates])
    })
  }, [])

  const kw = keyword.trim()
  const list = kw ? candidates.filter((c) => c.name.includes(kw)) : candidates
  const selected = list.find((c) => c.key === selectedKey)

  const add = () => {
    if (!selected || !amount) return
    onAdd({
      source: selected.source,
      name: selected.name,
      memo: memo.trim(),
      amount,
      residentNo: selected.residentNo,
      bankName: selected.bankName,
      accountNo: selected.accountNo,
      accountOwner: selected.accountOwner,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className="w-full max-w-[520px] rounded-[14px] border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-[16px] font-extrabold text-text-strong">추가지급 대상자 등록</h3>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-white">✕</button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="이름 검색"
            className="h-9 w-full rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary"
          />

          <div className="max-h-40 overflow-y-auto rounded-[8px] border border-border">
            {list.map((c) => (
              <button
                key={c.key}
                onClick={() => setSelectedKey(c.key)}
                className={`flex w-full items-center justify-between text-left px-3 py-2 text-[13px] border-b border-border last:border-b-0 ${selectedKey === c.key ? 'bg-hover text-white' : 'text-[#c2cde0] hover:bg-hover'}`}
              >
                <span>{c.name}</span>
                <span className="text-[10.5px] font-semibold text-[#64748b]">{c.source}</span>
              </button>
            ))}
            {list.length === 0 && (
              <div className="px-3 py-4 text-center text-[12px] text-[#64748b]">검색 결과가 없습니다.</div>
            )}
          </div>

          {selected && (
            <div className="rounded-[8px] border border-border p-3 text-[12.5px] text-[#c2cde0] space-y-1">
              <div>주민번호: {selected.residentNo || '-'}</div>
              <div>은행명: {selected.bankName || '-'}</div>
              <div>계좌번호: {selected.accountNo || '-'}</div>
              <div>예금주: {selected.accountOwner || '-'}</div>
            </div>
          )}

          {selected && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-semibold text-[#94a3b8]">지급내역</span>
                <input
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="예: 특별수당"
                  className="h-9 w-full rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-semibold text-[#94a3b8]">지급금액(원)</span>
                <input
                  inputMode="numeric"
                  value={amount ? amount.toLocaleString('ko-KR') : ''}
                  onChange={(e) => setAmount(Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
                  className="h-9 w-full rounded-[8px] bg-input border border-border px-3 text-right text-[13px] text-input-text outline-none focus:border-primary tabular"
                  placeholder="0"
                />
              </label>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="h-9 rounded-[8px] border border-border px-4 text-sm font-semibold text-[#c2cde0] hover:bg-hover">취소</button>
          <button
            onClick={add}
            disabled={!selected || !amount}
            className="h-9 rounded-[8px] bg-primary px-4 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
          >
            추가
          </button>
        </div>
      </div>
    </div>
  )
}

/** 계좌번호 마스킹 — 끝 4자리만 노출 */
function maskAccount(no: string): string {
  const digits = no.replace(/\D/g, '')
  const total = digits.length
  let idx = 0
  return no.replace(/\d/g, (d) => {
    idx += 1
    return idx > total - 4 ? d : '*'
  })
}

/* ── 급여관리 (임용계약 파생 — contractmanager 급여지급 화면 준용) ──── */

interface SalaryFilter {
  startDate: string
  endDate: string
  keyword: string
}
const EMPTY_SALARY_FILTER: SalaryFilter = {
  startDate: TODAY,
  endDate: TODAY,
  keyword: '',
}
const PAGE_SIZES = [20, 50, 100]

function SalaryPayoutView() {
  const [filter, setFilter] = useState<SalaryFilter>(EMPTY_SALARY_FILTER)
  const [perPage, setPerPage] = useState(20)
  const [page, setPage] = useState(1)
  const [activityOverrides, setActivityOverrides] = useState<Record<string, number>>({})
  const positionSalaries = usePositionSalaries()

  // 직급별 기본급여(연봉) 테이블(시스템관리)에서 조회 → 1/12로 월급 산출
  // 테이블에 해당 직급이 없으면 계약서상 연봉(a.salary)으로 대체
  const basicOf = (a: Appointment) =>
    positionSalaries.find((p) => p.position === a.position)?.basic || a.salary
  const monthlySalary = (a: Appointment) => Math.round(basicOf(a) / 12)
  const activityOf = (a: Appointment) => activityOverrides[a.id] ?? a.activity
  const payout = (a: Appointment) =>
    Math.round((monthlySalary(a) + activityOf(a)) * (1 - WITHHOLDING))

  const [all, setAll] = useState<Appointment[]>([])
  useEffect(() => {
    listAppointments(EMPTY_APPOINTMENT_FILTER).then(setAll)
  }, [])

  // 급여일(payoutDate) 기준 — 검색기간(시작일~종료일) 안에 급여일이 있는 정상운영 임용계약만 표시
  const targets = useMemo(() => {
    const { startDate, endDate, keyword } = filter
    const kw = keyword.trim()
    return all
      .filter((a) => a.status === '정상운영')
      .filter(
        (a) =>
          (!startDate || a.payoutDate >= startDate) &&
          (!endDate || a.payoutDate <= endDate),
      )
      .filter((a) => !kw || a.name.includes(kw))
      .sort(
        (a, b) =>
          b.payoutDate.localeCompare(a.payoutDate) ||
          a.name.localeCompare(b.name, 'ko'),
      )
  }, [all, filter])

  const heldCount = useMemo(() => {
    const { startDate, endDate } = filter
    return all.filter(
      (a) =>
        a.status === '일시정지' &&
        (!startDate || a.payoutDate >= startDate) &&
        (!endDate || a.payoutDate <= endDate),
    ).length
  }, [all, filter])

  const sumPayout = targets.reduce((sum, a) => sum + payout(a), 0)

  const totalPages = Math.max(1, Math.ceil(targets.length / perPage))
  const safePage = Math.min(page, totalPages)
  const pagedRows = targets.slice((safePage - 1) * perPage, safePage * perPage)

  const setFilterField = (patch: Partial<SalaryFilter>) => {
    setFilter({ ...filter, ...patch })
    setPage(1)
  }
  const reset = () => {
    setFilter(EMPTY_SALARY_FILTER)
    setPage(1)
  }
  // 지급관리(수익금지급)와 동일한 방식 — 텍스트 파일(.txt) 다운로드
  const onExport = () => {
    if (targets.length === 0) {
      alert('출력할 데이터가 없습니다.')
      return
    }
    const amountOnly = (v: number) => `${v.toLocaleString('ko-KR')}원`
    // 이름  내역  금액  주민번호 / 은행명  계좌번호  예금주 — 수익금지급 출력과 동일 포맷
    const body = targets.map(
      (a) =>
        `${a.name}  급여  ${amountOnly(payout(a))}  ${a.residentNo} / ${a.bankName}  ${a.accountNo}  ${a.name}`,
    )
    const content = body.join('\r\n')
    const fileName = `급여지급목록_${filter.endDate}_${filter.startDate}.txt`
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a2 = document.createElement('a')
    a2.href = url
    a2.download = fileName
    document.body.appendChild(a2)
    a2.click()
    document.body.removeChild(a2)
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-[18px] font-extrabold text-text-strong">급여지급관리</h2>
        <p className="text-[13px] text-[#94a3b8] mt-1">
          임직원 급여 정산 및 지급 현황을 관리합니다.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <SummaryCard label="지급대상 건수" value={`${targets.length} 건`} sub="기간 필터 기준" tint="#e0edff" fg="#2563eb" icon={<Wallet size={18} />} />
        <SummaryCard label="지급예정 금액" value={won(sumPayout)} sub="기간 내 총 예상 지급" tint="#e2f7ec" fg="#16a34a" icon={<DollarSign size={18} />} />
        <SummaryCard label="지급보류 건수" value={`${heldCount} 건`} sub="일시정지 건수" tint="#fff1e0" fg="#f59e0b" icon={<Landmark size={18} />} />
      </div>

      {/* 필터 · 출력 */}
      <div className="rounded-[14px] border border-border bg-card p-4 mb-4">
        <div className="grid grid-cols-[1fr_1fr_2fr_auto_auto] gap-3 items-end">
          <Field label="시작일">
            <DateInput value={filter.startDate} onChange={(v) => setFilterField({ startDate: v })} />
          </Field>
          <Field label="종료일">
            <DateInput value={filter.endDate} onChange={(v) => setFilterField({ endDate: v })} />
          </Field>
          <Field label="계약자명">
            <input value={filter.keyword} onChange={(e) => setFilterField({ keyword: e.target.value })} placeholder="계약자명 검색" className={inputCls} />
          </Field>
          <button onClick={reset} className="h-[38px] rounded-[8px] border border-border px-5 text-sm font-semibold text-[#c2cde0] hover:bg-hover">초기화</button>
          <button onClick={onExport} className="h-[38px] rounded-[8px] bg-primary px-5 text-sm font-bold text-white hover:brightness-110">출력</button>
        </div>
      </div>

      <div className="rounded-[14px] border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[15px] font-extrabold text-text-strong">
            전체 <span className="text-primary">{targets.length}</span>건
          </span>
          <span className="text-[13px] font-semibold text-[#94a3b8]">
            지급 총액: {comma(sumPayout)} 원
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-[13px]">
            <thead>
              <tr className="text-left text-[12.5px] text-[#94a3b8] border-y border-border">
                {[
                  ['급여일', 'center'],
                  ['계약자명', ''],
                  ['은행명', ''],
                  ['계좌번호', ''],
                  ['계약일자', 'center'],
                  ['계약종료일', 'center'],
                  ['급여(원)', 'right'],
                  ['활동비(원)', 'right'],
                  ['지급액(원)', 'right'],
                ].map(([h, a]) => (
                  <th key={h} className={`px-3 py-1.5 font-semibold whitespace-nowrap ${a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((a) => (
                <tr key={a.id} className="border-b border-border hover:bg-hover">
                  <td className="px-3 py-1.5 tabular text-center whitespace-nowrap">{dateText(a.payoutDate)}</td>
                  <td className="px-3 py-1.5 font-semibold text-text-strong whitespace-nowrap">{a.name}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{a.bankName}</td>
                  <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#94a3b8]">{maskAccount(a.accountNo)}</td>
                  <td className="px-3 py-1.5 tabular text-center whitespace-nowrap">{dateText(a.contractDate)}</td>
                  <td className="px-3 py-1.5 tabular text-center whitespace-nowrap">{dateText(a.endDate)}</td>
                  <td className="px-3 py-1.5 tabular text-right whitespace-nowrap">{comma(monthlySalary(a))}</td>
                  <td className="px-3 py-1.5 tabular text-right whitespace-nowrap">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={activityOf(a).toLocaleString('ko-KR')}
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(/[^\d]/g, '')) || 0
                        setActivityOverrides({ ...activityOverrides, [a.id]: n })
                      }}
                      className="h-8 w-28 rounded-[7px] bg-input border border-border px-2 text-right text-[13px] text-input-text outline-none focus:border-primary tabular"
                    />
                  </td>
                  <td className="px-3 py-1.5 tabular text-right font-bold text-text-strong whitespace-nowrap">{comma(payout(a))}</td>
                </tr>
              ))}
              {pagedRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-[#64748b]">
                    조건에 맞는 급여지급 대상자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {targets.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <div className="flex gap-1">
              <button onClick={() => setPage(Math.max(1, safePage - 1))} className="h-8 w-8 rounded-md border border-border text-[#94a3b8] hover:bg-hover">‹</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`h-8 min-w-8 px-2 rounded-md border text-[13px] font-semibold ${n === safePage ? 'border-primary text-primary' : 'border-border text-[#94a3b8] hover:bg-hover'}`}
                >
                  {n}
                </button>
              ))}
              <button onClick={() => setPage(Math.min(totalPages, safePage + 1))} className="h-8 w-8 rounded-md border border-border text-[#94a3b8] hover:bg-hover">›</button>
            </div>
            <div className="flex gap-1">
              {PAGE_SIZES.map((n) => (
                <button
                  key={n}
                  onClick={() => { setPerPage(n); setPage(1) }}
                  className={`h-8 px-3 rounded-md border text-[13px] font-semibold ${n === perPage ? 'border-primary text-primary' : 'border-border text-[#94a3b8] hover:bg-hover'}`}
                >
                  {n}개
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── 공통 UI ──────────────────────────────────────────── */

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={[
        'px-4 py-2 text-[14px] font-bold border-b-2 -mb-px transition-colors',
        active
          ? 'border-primary text-text-strong'
          : 'border-transparent text-[#94a3b8] hover:text-[#e2e8f0]',
      ].join(' ')}
    >
      {children}
    </button>
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

/** 날짜 입력 — 캘린더 선택 + 8자리(YYYYMMDD) 수동입력 지원 */
function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])

  const isValidMD = (m: string, d: string) => {
    const mm = Number(m)
    const dd = Number(d)
    return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31
  }
  const handleText = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8)
    // 8자리: yyyymmdd
    if (digits.length === 8 && isValidMD(digits.slice(4, 6), digits.slice(6, 8))) {
      const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
      setText(iso)
      onChange(iso)
      return
    }
    // 6자리: yymmdd → 앞에 '20' 자동
    if (digits.length === 6 && isValidMD(digits.slice(2, 4), digits.slice(4, 6))) {
      const iso = `20${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`
      setText(iso)
      onChange(iso)
      return
    }
    setText(digits)
  }
  const onBlur = () => {
    // 미완성 입력이면 마지막 유효값으로 복원
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) setText(value)
  }

  return (
    <div className="relative">
      <input
        value={text}
        onChange={(e) => handleText(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={onBlur}
        inputMode="numeric"
        maxLength={10}
        placeholder="YYMMDD / YYYYMMDD"
        className={`${inputCls} pr-9`}
      />
      {/* 캘린더 아이콘 위에 투명 date input을 겹쳐 클릭 시 네이티브 달력 오픈 (Tab 순서에서는 제외) */}
      <input
        type="date"
        tabIndex={-1}
        value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        title="달력에서 선택"
        className="absolute right-0 top-0 h-full w-9 cursor-pointer opacity-0"
      />
      <Calendar size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
    </div>
  )
}

function SummaryCard({ label, value, tint, fg, sub, icon }: { label: string; value: string; tint: string; fg: string; sub?: string; icon?: ReactNode }) {
  return (
    <div className="rounded-[12px] border border-border bg-card p-4 flex items-center gap-3">
      <div className="h-[38px] w-[38px] rounded-[11px] flex items-center justify-center text-lg font-black" style={{ background: tint, color: fg }}>
        {icon ?? '₩'}
      </div>
      <div>
        <div className="text-[13px] font-semibold text-[#64748b]">{label}</div>
        <div className="text-[18px] font-extrabold text-text-strong leading-tight tabular">{value}</div>
        {sub && <div className="text-[11px] text-[#64748b] mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}
