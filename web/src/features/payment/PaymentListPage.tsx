import { useEffect, useMemo, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, DollarSign, Download, Eye, Landmark, Plus, Wallet, X } from 'lucide-react'
import type { ReactNode } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import { comma, dateText, won } from '../../lib/format'
import { EMPTY_FILTER, type Contract } from '../../types/contract'
import { listContracts } from '../contract/contractStore'
import { type ExtraPayee, type PayoutCategory } from '../../types/payout'
import { EMPTY_APPOINTMENT_FILTER, type Appointment } from '../../types/appointment'
import { listAppointments } from '../appointment/appointmentStore'
import { usePositionSalaries } from '../appointment/positionSalaryStore'
import { calcPayroll, payrollTextLines, type PayrollRow } from './payrollEngine'
import PayslipDrawer from './PayslipDrawer'
import { buildLasOnBonusRows } from './lasOnBonusEngine'
import { downloadLasOnBonusReport } from './lasOnBonusExcel'
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
        <TabButton active={category === 'LAS-On'} onClick={() => setCategory('LAS-On')}>
          라스온수당지급
        </TabButton>
      </div>

      {category === '수익금' ? (
        <RevenuePayoutView />
      ) : category === '급여' ? (
        <SalaryPayoutView />
      ) : (
        <LasOnBonusView />
      )}
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

  // 급여일(수당지급일) 기준 — 검색기간(시작일~종료일) 안에 실제로 급여일이 도래하는 계약만 표시.
  // 증액 등으로 이력이 여러 건인 계약은 "최신 스냅샷"이 아니라, 그 지급일 시점에
  // 수당지급기준일이 이미 도래한 이력 중 가장 최근 스냅샷의 보증금/수당을 지급 대상으로 삼는다.
  // 예) 신규 계약일+2개월 이후 ~ 증액일+2개월 이전에는 증액 전 보증금 기준 수당을,
  //     증액일+2개월 이후에는 증액된 보증금 기준 수당을 지급한다.
  const targets = useMemo(() => {
    const { startDate, endDate, keyword } = filter
    const kw = keyword.trim()
    const result: { s: (typeof contracts)[number]['current']; payBaseDate: string }[] = []
    for (const c of contracts) {
      const cur = c.current
      if (cur.status === '해지' || cur.status === '폐기' || cur.isDraft) continue
      if (!cur.allowancePayDay) continue // 급여일 미지정 계약은 제외
      const payBaseDate = findPayDate(startDate, endDate, cur.allowancePayDay)
      if (payBaseDate === null) continue
      // history는 최신순(id DESC) — 지급기준일이 이미 도래한(<=) 것 중 가장 최근 스냅샷을 찾는다.
      const effective = c.history.find(
        (h) => !h.firstAllowancePayDate || h.firstAllowancePayDate <= payBaseDate,
      )
      if (!effective) continue // 어떤 이력도 아직 기준일 도래 전 → 대상 아님
      if (!(effective.allowance > 0)) continue
      if (kw && !effective.contractorName.includes(kw)) continue
      result.push({ s: effective, payBaseDate })
    }
    return result
  }, [contracts, filter])

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
  // 수익금지급 텍스트(.txt) 다운로드
  // 포맷: 이름|지급내역|금액|주민번호|은행명|계좌번호|예금주
  //   - 목록의 지급대상(계약 파생) → 지급내역은 '수당' 고정
  //   - 추가지급 대상자          → 등록 시 입력한 지급명목 (예: 활동비)
  const onExport = () => {
    if (totalCount === 0) {
      alert('출력할 데이터가 없습니다.')
      return
    }
    const amountOnly = (v: number) => v.toLocaleString('ko-KR')
    const line = (
      name: string,
      item: string,
      amount: number,
      residentNo: string,
      bankName: string,
      accountNo: string,
      accountOwner: string,
    ) =>
      [name, item, amountOnly(amount), residentNo, bankName, accountNo, accountOwner].join('|')

    const body = [
      // 목록의 지급대상(계약 파생) — 지급내역은 '수당' 고정
      ...targets.map(({ s }) =>
        line(
          s.contractorName,
          '수당',
          payout(s.allowance),
          s.residentNo,
          s.bankName,
          s.accountNo,
          s.contractorName,
        ),
      ),
      // 추가지급 대상자 — 등록 시 입력한 지급명목 (예: 활동비)
      ...extras.map((e) =>
        line(
          e.name,
          e.memo || '-',
          e.amount,
          e.residentNo,
          e.bankName,
          e.accountNo,
          e.accountOwner,
        ),
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
          className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-bold text-white hover:brightness-110"
        >
          <Plus size={15} /> 추가지급 대상자
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
                  ['보증금액', 'right'],
                  ['수당', 'right'],
                  ['지급금액', 'right'],
                  ['은행명', ''],
                  ['계좌번호', ''],
                  ['예금주', ''],
                  ['계약일자', 'center'],
                  ['계약종료일', 'center'],
                  ['추천인', ''],
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
                  <td className="px-3 py-1.5 tabular text-right whitespace-nowrap">{comma(s.deposit)} 원</td>
                  <td className="px-3 py-1.5 tabular text-right whitespace-nowrap">{comma(s.allowance)} 원</td>
                  <td className="px-3 py-1.5 tabular text-right font-bold text-text-strong whitespace-nowrap">{comma(payout(s.allowance))} 원</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{s.bankName}</td>
                  <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#94a3b8]">{maskAccount(s.accountNo)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{s.accountOwner}</td>
                  <td className="px-3 py-1.5 tabular text-center whitespace-nowrap">{dateText(s.contractDate)}</td>
                  <td className="px-3 py-1.5 tabular text-center whitespace-nowrap">{dateText(s.contractEndDate)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{s.recruiter}</td>
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
                  <td className="px-3 py-1.5 tabular text-right whitespace-nowrap text-[#64748b]">-</td>
                  <td className="px-3 py-1.5 tabular text-right whitespace-nowrap text-[#64748b]">-</td>
                  <td className="px-3 py-1.5 tabular text-right font-bold text-text-strong whitespace-nowrap">{comma(e.amount)} 원</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{e.bankName}</td>
                  <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#94a3b8]">{maskAccount(e.accountNo)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{e.accountOwner}</td>
                  <td className="px-3 py-1.5 tabular text-center whitespace-nowrap text-[#64748b]">-</td>
                  <td className="px-3 py-1.5 tabular text-center whitespace-nowrap text-[#64748b]">-</td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-[#94a3b8]">{e.memo || '-'}</td>
                  <td className="px-3 py-1.5 text-center whitespace-nowrap">
                    <button
                      onClick={() => removeExtra(e.id)}
                      title="삭제"
                      className="h-7 w-7 rounded-md border border-border inline-flex items-center justify-center text-danger hover:bg-hover"
                    >
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {totalCount === 0 && (
                <tr>
                  <td colSpan={13} className="px-3 py-10 text-center text-[#64748b]">
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
          <button onClick={onClose} className="text-[#94a3b8] hover:text-white"><X size={18} /></button>
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

/** 급여일은 일괄 매월 10일 */
const SALARY_PAY_DAY = 10

/** 'YYYY-MM' → 그 달의 급여기준일 'YYYY-MM-10' */
function payBaseDateOf(month: string): string {
  return `${month}-${String(SALARY_PAY_DAY).padStart(2, '0')}`
}

/** 다음 달 'YYYY-MM' — 급여관리 화면 기본값 (지급 예정 급여를 미리 본다) */
function nextMonth(): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface SalaryFilter {
  month: string // 급여월 (YYYY-MM)
  position: string // 직급 ('전체' 포함)
  keyword: string
}
const EMPTY_SALARY_FILTER: SalaryFilter = {
  month: nextMonth(),
  position: '전체',
  keyword: '',
}
const PAGE_SIZES = [20, 50, 100]

function SalaryPayoutView() {
  const [filter, setFilter] = useState<SalaryFilter>(EMPTY_SALARY_FILTER)
  const [perPage, setPerPage] = useState(20)
  const [page, setPage] = useState(1)
  const [detailId, setDetailId] = useState<string | null>(null)
  const positionSalaries = usePositionSalaries()

  const [all, setAll] = useState<Appointment[]>([])
  useEffect(() => {
    listAppointments(EMPTY_APPOINTMENT_FILTER).then(setAll)
  }, [])

  // 선택한 급여월의 급여기준일 (매월 10일)
  const payBaseDate = payBaseDateOf(filter.month)

  // 직급 선택지 — 직급표(시스템관리) 기준에, 실제 임용계약에만 있는 직급도 합쳐 빠짐없이 보여준다.
  const positionOptions = useMemo(() => {
    const set = new Set<string>()
    positionSalaries.forEach((p) => p.position && set.add(p.position))
    all.forEach((a) => a.position && set.add(a.position))
    return [...set].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [positionSalaries, all])

  // 해당 급여월에 급여를 지급할 인력.
  // payoutDate 는 "최초 급여 개시일"이므로, 급여기준일이 그 날짜 이후면 매월 지급 대상이다.
  // (payoutDate 가 공란인 인력은 개시일 제한이 없는 것으로 보고 지급 대상에 포함한다)
  const isDue = (a: Appointment) => !a.payoutDate || a.payoutDate <= payBaseDate

  const targets = useMemo(() => {
    const kw = filter.keyword.trim()
    return all
      .filter((a) => a.status === '정상운영')
      .filter(isDue)
      .filter((a) => filter.position === '전체' || a.position === filter.position)
      .filter((a) => !kw || a.name.includes(kw))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, filter, payBaseDate])

  const heldCount = useMemo(
    () => all.filter((a) => a.status === '일시정지' && isDue(a)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, payBaseDate],
  )

  // 급여 계산은 payrollEngine 한 곳에서만 수행한다 (목록·명세서·텍스트가 같은 값을 쓰도록).
  // 60세 판정 기준일은 선택한 급여월의 급여기준일 — 오늘 날짜로 판정하면 과거 급여를 다시 조회할 때 값이 달라진다.
  const rows: PayrollRow[] = useMemo(
    () => targets.map((a) => calcPayroll(a, positionSalaries, payBaseDate)),
    [targets, positionSalaries, payBaseDate],
  )

  const sumPayout = rows.reduce((sum, r) => sum + r.totalNet, 0)

  const totalPages = Math.max(1, Math.ceil(rows.length / perPage))
  const safePage = Math.min(page, totalPages)
  const pagedRows = rows.slice((safePage - 1) * perPage, safePage * perPage)
  const detailRow = detailId ? rows.find((r) => r.id === detailId) : undefined
  // 급여명세서의 지급일도 목록과 같은 급여기준일을 쓴다
  const detailBaseDate = payBaseDate

  const setFilterField = (patch: Partial<SalaryFilter>) => {
    setFilter({ ...filter, ...patch })
    setPage(1)
  }
  const reset = () => {
    setFilter(EMPTY_SALARY_FILTER)
    setPage(1)
  }
  // 급여보고 텍스트(.txt) — 이름|금액|주민번호|은행|계좌번호|예금주
  // 근로소득 실지급액과 사업소득 실지급액을 각각 1줄로 출력한다 (한 사람 최대 2줄).
  const onExport = () => {
    if (rows.length === 0) {
      alert('출력할 데이터가 없습니다.')
      return
    }
    const content = payrollTextLines(rows).join('\r\n')
    const fileName = `급여지급목록_${payBaseDate}.txt`
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
        <SummaryCard label="지급대상 건수" value={`${rows.length} 건`} sub={`${filter.month} 급여`} tint="#e0edff" fg="#2563eb" icon={<Wallet size={18} />} />
        <SummaryCard label="지급예정 금액" value={won(sumPayout)} sub={`지급총액 합계 (${dateText(payBaseDate)} 지급)`} tint="#e2f7ec" fg="#16a34a" icon={<DollarSign size={18} />} />
        <SummaryCard label="지급보류 건수" value={`${heldCount} 건`} sub="일시정지 건수" tint="#fff1e0" fg="#f59e0b" icon={<Landmark size={18} />} />
      </div>

      {/* 필터 · 출력 */}
      <div className="rounded-[14px] border border-border bg-card p-4 mb-4">
        <div className="grid grid-cols-[1fr_1fr_1fr_2fr_auto_auto] gap-3 items-end">
          <Field label="급여월">
            <input
              type="month"
              value={filter.month}
              onChange={(e) => setFilterField({ month: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="급여기준일">
            <input value={dateText(payBaseDate)} readOnly className={`${inputCls} text-[#94a3b8]`} />
          </Field>
          <Field label="직급">
            <select
              value={filter.position}
              onChange={(e) => setFilterField({ position: e.target.value })}
              className={inputCls}
            >
              <option value="전체">전체</option>
              {positionOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
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
            전체 <span className="text-primary">{rows.length}</span>건
          </span>
          <span className="text-[13px] font-semibold text-[#94a3b8]">
            지급 총액: {comma(sumPayout)} 원
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1700px] text-[13px]">
            <thead>
              <tr className="text-left text-[12.5px] text-[#94a3b8] border-y border-border">
                {/* 근로소득 계열 = 파랑, 사업소득 계열 = 초록, 실지급액 = 주황 */}
                {[
                  ['번호', 'center', ''],
                  ['소속', '', ''],
                  ['이름', '', ''],
                  ['주민번호', '', ''],
                  ['직급', 'center', ''],
                  ['근로소득(원)', 'right', 'text-primary'],
                  ['소득공제(원)', 'right', 'text-primary'],
                  ['실지급액(원)', 'right', 'text-warning'],
                  ['사업소득(원)', 'right', 'text-success'],
                  ['소득세(원)', 'right', 'text-success'],
                  ['실지급액(원)', 'right', 'text-warning'],
                  ['지급총액(원)', 'right', ''],
                  ['은행명', '', ''],
                  ['계좌번호', '', ''],
                  ['예금주', '', ''],
                  ['관리', 'center', ''],
                ].map(([h, a, c], i) => (
                  <th key={`${h}-${i}`} className={`px-3 py-1.5 font-semibold whitespace-nowrap ${a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : ''} ${c}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((r, i) => (
                <tr key={r.id} className="border-b border-border hover:bg-hover">
                  <td className="px-3 py-1.5 tabular text-center whitespace-nowrap text-[#c2cde0]">{rows.length - ((safePage - 1) * perPage + i)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{r.org || '-'}</td>
                  <td className="px-3 py-1.5 font-semibold text-text-strong whitespace-nowrap">{r.name}</td>
                  <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#94a3b8]">{r.residentNo || '-'}</td>
                  <td className="px-3 py-1.5 text-center whitespace-nowrap">{r.position || '-'}</td>
                  {/* 근로소득 계열 = 파랑 */}
                  <td className="px-3 py-1.5 tabular text-right whitespace-nowrap text-primary">{comma(r.laborIncome)}</td>
                  <td className="px-3 py-1.5 tabular text-right whitespace-nowrap text-primary">{comma(r.insuranceDeduction)}</td>
                  <td className="px-3 py-1.5 tabular text-right font-semibold whitespace-nowrap text-warning">{comma(r.laborNet)}</td>
                  {/* 사업소득 계열 = 초록 */}
                  <td className="px-3 py-1.5 tabular text-right whitespace-nowrap text-success">{comma(r.businessIncome)}</td>
                  <td className="px-3 py-1.5 tabular text-right whitespace-nowrap text-success">{comma(r.incomeTax)}</td>
                  <td className="px-3 py-1.5 tabular text-right font-semibold whitespace-nowrap text-warning">{comma(r.businessNet)}</td>
                  <td className="px-3 py-1.5 tabular text-right font-bold text-text-strong whitespace-nowrap">{comma(r.totalNet)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{r.bankName || '-'}</td>
                  <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#94a3b8]">{maskAccount(r.accountNo)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{r.accountOwner || '-'}</td>
                  <td className="px-3 py-1.5 text-center whitespace-nowrap">
                    <button
                      onClick={() => setDetailId(r.id)}
                      title="상세"
                      className="h-8 w-8 rounded-lg border border-border inline-flex items-center justify-center text-[#94a3b8] hover:bg-hover hover:text-white"
                    >
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {pagedRows.length === 0 && (
                <tr>
                  <td colSpan={16} className="px-3 py-10 text-center text-[#64748b]">
                    조건에 맞는 급여지급 대상자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <div className="flex gap-1">
              <button onClick={() => setPage(Math.max(1, safePage - 1))} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-[#94a3b8] hover:bg-hover"><ChevronLeft size={16} /></button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`h-8 min-w-8 px-2 rounded-md border text-[13px] font-semibold ${n === safePage ? 'border-primary text-primary' : 'border-border text-[#94a3b8] hover:bg-hover'}`}
                >
                  {n}
                </button>
              ))}
              <button onClick={() => setPage(Math.min(totalPages, safePage + 1))} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-[#94a3b8] hover:bg-hover"><ChevronRight size={16} /></button>
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

      {detailRow && (
        <PayslipDrawer
          row={detailRow}
          baseDate={detailBaseDate}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  )
}

/* ── LAS-On 수당지급 (유치보너스 — 유치자가 LAS-On파트장/파트너인 신규 계약 파생) ──── */

function LasOnBonusView() {
  const [contracts, setContracts] = useState<Contract[]>([])
  // 계약자·유치자·파트장/파트너·계약자명은 모두 별개 인물일 수 있어 각각 독립 필터로 둔다.
  const [filter, setFilter] = useState({
    regStart: '', // 등록구간 시작 (계약 등록일 createdAt)
    regEnd: '', // 등록구간 종료
    contractStart: '', // 계약구간 시작 (입금일 = 계약일)
    contractEnd: '', // 계약구간 종료
    partner: '', // 파트장/파트너 (파트장 검색 시 산하 파트너까지 묶임)
    keyword: '', // 계약자명·유치자
  })
  const setF = (patch: Partial<typeof filter>) => setFilter((f) => ({ ...f, ...patch }))
  const reset = () =>
    setFilter({ regStart: '', regEnd: '', contractStart: '', contractEnd: '', partner: '', keyword: '' })

  useEffect(() => {
    listContracts(EMPTY_FILTER).then(setContracts)
  }, [])

  const rows = useMemo(() => buildLasOnBonusRows(contracts, TODAY), [contracts])

  const visibleRows = useMemo(() => {
    const kw = filter.keyword.trim()
    const pt = filter.partner.trim()
    return rows.filter((r) => {
      // 등록구간 (createdAt)
      if (filter.regStart && (!r.createdAt || r.createdAt < filter.regStart)) return false
      if (filter.regEnd && (!r.createdAt || r.createdAt > filter.regEnd)) return false
      // 계약구간 (입금일 = 계약일)
      if (filter.contractStart && (!r.depositDate || r.depositDate < filter.contractStart)) return false
      if (filter.contractEnd && (!r.depositDate || r.depositDate > filter.contractEnd)) return false
      // 파트장/파트너 — 파트장명(leaderName)으로 검색하면 산하 파트너 행까지 함께 잡힌다.
      if (pt && !(r.leaderName.includes(pt) || r.recipientName.includes(pt) || r.recruiter.includes(pt)))
        return false
      // 계약자명·유치자
      if (kw && !(r.contractorName.includes(kw) || r.recruiter.includes(kw))) return false
      return true
    })
  }, [rows, filter])
  const bonusTotal = visibleRows
    .filter((r, i) => !visibleRows[i - 1] || r.no !== visibleRows[i - 1].no)
    .reduce((a, r) => a + r.netAmount, 0)
  const targetCount = new Set(visibleRows.map((r) => r.no)).size

  const [excelBusy, setExcelBusy] = useState(false)
  const onExcelDownload = async () => {
    if (visibleRows.length === 0) {
      alert('출력할 데이터가 없습니다.')
      return
    }
    setExcelBusy(true)
    try {
      await downloadLasOnBonusReport(visibleRows, TODAY)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setExcelBusy(false)
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-[18px] font-extrabold text-text-strong">라스온수당지급</h2>
          <p className="text-[13px] text-[#94a3b8] mt-1">
            유치자가 LAS-On파트장/파트너인 신규 계약의 유치보너스(15%)를 관리합니다.
          </p>
        </div>
        <button
          onClick={onExcelDownload}
          disabled={excelBusy}
          className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-success px-4 text-sm font-bold text-white hover:brightness-110 disabled:opacity-60"
        >
          {excelBusy ? '다운로드 중…' : (<><Download size={15} /> 엑셀 다운로드</>)}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <SummaryCard label="지급대상 건수" value={`${targetCount} 건`} sub="계약 기준" tint="#e0edff" fg="#2563eb" icon={<Wallet size={18} />} />
        <SummaryCard label="지급예정 금액" value={won(bonusTotal)} sub="실지급액 합계" tint="#e2f7ec" fg="#16a34a" icon={<DollarSign size={18} />} />
      </div>

      <div className="rounded-[14px] border border-border bg-card p-4 mb-4">
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1.2fr_1.4fr_auto] gap-3 items-end">
          <Field label="등록구간 시작">
            <DateInput value={filter.regStart} onChange={(v) => setF({ regStart: v })} />
          </Field>
          <Field label="등록구간 종료">
            <DateInput value={filter.regEnd} onChange={(v) => setF({ regEnd: v })} />
          </Field>
          <Field label="계약구간 시작">
            <DateInput value={filter.contractStart} onChange={(v) => setF({ contractStart: v })} />
          </Field>
          <Field label="계약구간 종료">
            <DateInput value={filter.contractEnd} onChange={(v) => setF({ contractEnd: v })} />
          </Field>
          <Field label="파트장·파트너">
            <input value={filter.partner} onChange={(e) => setF({ partner: e.target.value })} placeholder="파트장 검색 시 산하 파트너 포함" className={inputCls} />
          </Field>
          <Field label="계약자명·유치자">
            <input value={filter.keyword} onChange={(e) => setF({ keyword: e.target.value })} placeholder="계약자명 또는 유치자" className={inputCls} />
          </Field>
          <button onClick={reset} className="h-[38px] rounded-[8px] border border-border px-4 text-sm font-semibold text-[#c2cde0] hover:bg-hover whitespace-nowrap">초기화</button>
        </div>
      </div>

      <div className="rounded-[14px] border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1700px] text-[13px]">
            <thead>
              <tr className="text-left text-[12.5px] text-[#94a3b8] border-y border-border">
                {[
                  ['연번', 'center'], ['입금일', 'center'], ['신규 계약자', ''], ['유치자', ''],
                  ['보증금 합계', 'right'], ['현금', 'right'], ['카드금액', 'right'], ['카드사', ''], ['승인번호', ''],
                  ['수당기준금액', 'right'],
                  ['수령인', ''], ['보너스율(%)', 'center'], ['보너스금액', 'right'], ['세금(3.3%)', 'right'], ['실지급액', 'right'],
                  ['은행', ''], ['계좌번호', ''], ['예금주', ''], ['주민번호', ''], ['비고', ''],
                ].map(([h, a]) => (
                  <th key={h} className={`px-3 py-1.5 font-semibold whitespace-nowrap ${a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r, i) => (
                <tr key={i} className={`border-b border-border hover:bg-hover ${r.bold ? 'font-bold text-[#f59e0b]' : ''}`}>
                  <td className="px-3 py-1.5 text-center whitespace-nowrap tabular">{r.no}</td>
                  <td className="px-3 py-1.5 text-center whitespace-nowrap tabular">{dateText(r.depositDate)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{r.contractorName}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{r.recruiter}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap tabular">{comma(r.depositTotal)}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap tabular">{r.cashAmount ? comma(r.cashAmount) : ''}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap tabular">{r.cardAmount ? comma(r.cardAmount) : ''}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{r.cardIssuer}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{r.approvalNo}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap tabular">{comma(r.baseAmount)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{r.recipientName}</td>
                  <td className="px-3 py-1.5 text-center whitespace-nowrap tabular">{r.bonusRate}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap tabular">{comma(r.bonusAmount)}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap tabular">{comma(r.tax)}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap tabular font-bold text-primary">{comma(r.netAmount)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{r.bankName}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap tabular">{r.accountNo}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{r.accountOwner}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap tabular">{r.residentNo}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{r.memo}</td>
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={20} className="px-3 py-10 text-center text-[#64748b]">
                    조건에 맞는 유치보너스 대상이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
        {icon ?? <Wallet size={18} />}
      </div>
      <div>
        <div className="text-[13px] font-semibold text-[#64748b]">{label}</div>
        <div className="text-[18px] font-extrabold text-text-strong leading-tight tabular">{value}</div>
        {sub && <div className="text-[11px] text-[#64748b] mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}
