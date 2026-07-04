import { useEffect, useMemo, useState } from 'react'
import { Calendar, DollarSign, Landmark, Trash2, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import Badge from '../../components/ui/Badge'
import { comma, dateText, won } from '../../lib/format'
import { EMPTY_FILTER } from '../../types/contract'
import { listContracts } from '../contract/contractStore'
import {
  EMPTY_PAYOUT_FILTER,
  PAYOUT_STATUSES,
  payoutStatusTone,
  type Payout,
  type PayoutCategory,
  type PayoutFilter,
  type PayoutStatus,
} from '../../types/payout'
import {
  deletePayout,
  listPayouts,
  summarizePayouts,
  updatePayoutStatus,
} from './payoutStore'
import PayoutRegisterModal from './PayoutRegisterModal'

const TODAY = '2026-07-04' // 지급기준일(시스템 기준일)
const WITHHOLDING = 0.033 // 원천징수 3.3%

/** YYYY-MM-DD → 일(day) 숫자 */
const dayOfMonth = (iso: string) => Number(iso.slice(8, 10)) || 0

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

function RevenuePayoutView() {
  const [startDate, setStartDate] = useState(TODAY)
  const [endDate, setEndDate] = useState(TODAY)
  const [keyword, setKeyword] = useState('')

  const payout = (allowance: number) =>
    Math.round(allowance * (1 - WITHHOLDING))

  const all = useMemo(
    () =>
      listContracts(EMPTY_FILTER)
        .map((c) => c.current)
        .filter(
          (s) => s.allowance > 0 && s.status !== '해지' && s.status !== '폐기',
        ),
    [],
  )

  const targets = useMemo(() => {
    // 급여일(수당지급일) 기준 — 검색기간의 '일(day)' 범위에 급여일이 포함되면 표시
    // (검색일 = 급여일이면 목록에 노출)
    const startDay = dayOfMonth(startDate)
    const endDay = dayOfMonth(endDate)
    const kw = keyword.trim()
    return all.filter((s) => {
      if (startDate && endDay) {
        const pd = s.allowancePayDay
        if (!(pd >= startDay && pd <= endDay)) return false
      }
      if (kw && !s.contractorName.includes(kw)) return false
      return true
    })
  }, [all, startDate, endDate, keyword])

  // 지급기준일 = 검색월 + 급여일
  const filterMonth = startDate.slice(0, 7)
  const baseDateOf = (payDay: number) =>
    filterMonth ? `${filterMonth}-${String(payDay).padStart(2, '0')}` : '-'

  const sumPayout = targets.reduce((a, s) => a + payout(s.allowance), 0)
  const heldCount = targets.filter(
    (s) => s.status.includes('대기') || s.status.includes('변경'),
  ).length

  const reset = () => {
    setStartDate(TODAY)
    setEndDate(TODAY)
    setKeyword('')
  }
  // contractmanager 출력 기능 준용 — 텍스트 파일(.txt) 다운로드
  const onExport = () => {
    if (targets.length === 0) {
      alert('출력할 데이터가 없습니다.')
      return
    }
    const amountOnly = (v: number) => `${v.toLocaleString('ko-KR')}원`
    // 계약자명  수익금  주민번호 / 은행명  계좌번호  예금주(계약자명)
    const body = targets.map(
      (s) =>
        `${s.contractorName}  ${amountOnly(payout(s.allowance))}  ${s.residentNo} / ${s.bankName}  ${s.accountNo}  ${s.contractorName}`,
    )
    const content = body.join('\r\n')
    const fileName = `수당지급목록_${endDate}_${startDate}.txt`
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
      <div className="mb-4">
        <h2 className="text-[18px] font-extrabold text-text-strong">수당 지급관리</h2>
        <p className="text-[13px] text-[#94a3b8] mt-1">
          지급 대상 및 지급 상태를 관리합니다.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <SummaryCard label="지급대상 건수" value={`${targets.length} 건`} sub="기간 필터 기준" tint="#e0edff" fg="#2563eb" icon={<Wallet size={18} />} />
        <SummaryCard label="지급예정 금액" value={won(sumPayout)} sub="기간 내 총 예상 지급" tint="#e2f7ec" fg="#16a34a" icon={<DollarSign size={18} />} />
        <SummaryCard label="지급보류 건수" value={`${heldCount} 건`} sub="대기/변경 건수" tint="#fff1e0" fg="#f59e0b" icon={<Landmark size={18} />} />
      </div>

      {/* 필터 · 출력 */}
      <div className="rounded-[14px] border border-border bg-card p-4 mb-4">
        <div className="grid grid-cols-[1fr_1fr_2fr_auto_auto] gap-3 items-end">
          <Field label="시작일">
            <DateInput value={startDate} onChange={setStartDate} />
          </Field>
          <Field label="종료일">
            <DateInput value={endDate} onChange={setEndDate} />
          </Field>
          <Field label="계약자명">
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="계약자명 검색" className={inputCls} />
          </Field>
          <button onClick={reset} className="h-[38px] rounded-[8px] border border-border px-5 text-sm font-semibold text-[#c2cde0] hover:bg-hover">초기화</button>
          <button onClick={onExport} className="h-[38px] rounded-[8px] bg-primary px-5 text-sm font-bold text-white hover:brightness-110">출력</button>
        </div>
      </div>

      <div className="rounded-[14px] border border-border bg-card overflow-hidden">
        <div className="px-4 py-3">
          <span className="text-[15px] font-extrabold text-text-strong">
            지급 대상 <span className="text-primary">{targets.length}</span>건
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-[13px]">
            <thead>
              <tr className="text-left text-[12.5px] text-[#94a3b8] border-y border-border">
                {[
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
                ].map(([h, a]) => (
                  <th key={h} className={`px-3 py-1.5 font-semibold whitespace-nowrap ${a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {targets.map((s, i) => (
                <tr key={`${s.historyId}-${i}`} className="border-b border-border hover:bg-hover">
                  <td className="px-3 py-1.5 tabular text-center whitespace-nowrap">{baseDateOf(s.allowancePayDay)}</td>
                  <td className="px-3 py-1.5 font-semibold text-text-strong whitespace-nowrap">{s.contractorName}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{s.recruiter}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{s.bankName}</td>
                  <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#94a3b8]">{maskAccount(s.accountNo)}</td>
                  <td className="px-3 py-1.5 tabular text-center whitespace-nowrap">{dateText(s.contractDate)}</td>
                  <td className="px-3 py-1.5 tabular text-center whitespace-nowrap">{dateText(s.contractEndDate)}</td>
                  <td className="px-3 py-1.5 tabular text-right whitespace-nowrap">{comma(s.deposit)} 원</td>
                  <td className="px-3 py-1.5 tabular text-right whitespace-nowrap">{comma(s.allowance)} 원</td>
                  <td className="px-3 py-1.5 tabular text-right font-bold text-text-strong whitespace-nowrap">{comma(payout(s.allowance))} 원</td>
                </tr>
              ))}
              {targets.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center text-[#64748b]">
                    금일 수당지급 대상자가 없습니다.
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

/* ── 급여관리 (지급 내역) ──────────────────────────────── */

function SalaryPayoutView() {
  const [draft, setDraft] = useState<PayoutFilter>(EMPTY_PAYOUT_FILTER)
  const [applied, setApplied] = useState<PayoutFilter>(EMPTY_PAYOUT_FILTER)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [refresh, setRefresh] = useState(0)

  const rows = useMemo(
    () => listPayouts('급여', applied),
    [applied, refresh],
  )
  const sum = useMemo(
    () => summarizePayouts(listPayouts('급여', EMPTY_PAYOUT_FILTER)),
    [refresh],
  )

  const changeStatus = (id: string, status: PayoutStatus) => {
    updatePayoutStatus(id, status)
    setRefresh((n) => n + 1)
  }
  const onDelete = (p: Payout) => {
    if (!confirm(`${p.payee} · ${won(p.amount)} 지급 건을 삭제할까요?`)) return
    deletePayout(p.id)
    setRefresh((n) => n + 1)
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-[18px] font-extrabold text-text-strong">급여 관리</h2>
          <p className="text-[13px] text-[#94a3b8] mt-1">
            직원급여·임용급여 등 급여 지급 내역을 관리합니다.
          </p>
        </div>
        <button
          onClick={() => setRegisterOpen(true)}
          className="h-10 rounded-[10px] bg-primary px-4 text-sm font-bold text-white hover:brightness-110"
        >
          ＋ 지급 등록
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-4">
        <SummaryCard label="전체 건수" value={`${sum.total}건`} tint="#e0edff" fg="#2563eb" />
        <SummaryCard label="총 지급액" value={won(sum.amount)} tint="#e0edff" fg="#2563eb" />
        <SummaryCard label="지급완료" value={won(sum.paid)} tint="#e2f7ec" fg="#16a34a" />
        <SummaryCard label="미지급" value={won(sum.unpaid)} tint="#fff1e0" fg="#f59e0b" />
      </div>

      <div className="rounded-[14px] border border-border bg-card p-4 mb-4">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3 items-end">
          <Field label="검색 (수령인·지급종류)">
            <input value={draft.keyword} onChange={(e) => setDraft({ ...draft, keyword: e.target.value })} placeholder="수령인, 지급종류 검색" className={inputCls} />
          </Field>
          <Field label="상태">
            <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as PayoutFilter['status'] })} className={inputCls}>
              <option value="전체">전체</option>
              {PAYOUT_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="지급일 시작">
            <input type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} className={inputCls} />
          </Field>
          <Field label="지급일 종료">
            <input type="date" value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} className={inputCls} />
          </Field>
          <div className="flex gap-2">
            <button onClick={() => setApplied(draft)} className="h-[38px] rounded-[8px] bg-indigo px-5 text-sm font-bold text-white hover:brightness-110">검색</button>
            <button onClick={() => { setDraft(EMPTY_PAYOUT_FILTER); setApplied(EMPTY_PAYOUT_FILTER) }} className="h-[38px] rounded-[8px] border border-border px-5 text-sm font-semibold text-[#c2cde0] hover:bg-hover">초기화</button>
          </div>
        </div>
      </div>

      <div className="rounded-[14px] border border-border bg-card overflow-hidden">
        <div className="px-4 py-3">
          <span className="text-[15px] font-extrabold text-text-strong">
            전체 <span className="text-primary">{rows.length}</span>건
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead>
              <tr className="text-left text-[12.5px] text-[#94a3b8] border-y border-border">
                {[
                  ['지급일', 'center'],
                  ['수령인', ''],
                  ['지급종류', ''],
                  ['은행/계좌', ''],
                  ['금액', 'right'],
                  ['상태', 'center'],
                  ['비고', ''],
                  ['관리', 'center'],
                ].map(([h, a]) => (
                  <th key={h} className={`px-3 py-1.5 font-semibold whitespace-nowrap ${a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <SalaryRow key={p.id} p={p} onStatus={(s) => changeStatus(p.id, s)} onDelete={() => onDelete(p)} />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-[#64748b]">
                    조건에 맞는 지급 내역이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {registerOpen && (
        <PayoutRegisterModal
          category="급여"
          onClose={() => setRegisterOpen(false)}
          onCreated={() => {
            setRegisterOpen(false)
            setRefresh((n) => n + 1)
          }}
        />
      )}
    </div>
  )
}

function SalaryRow({ p, onStatus, onDelete }: { p: Payout; onStatus: (s: PayoutStatus) => void; onDelete: () => void }) {
  return (
    <tr className="border-b border-border hover:bg-hover">
      <td className="px-3 py-1.5 tabular text-center whitespace-nowrap">{dateText(p.payDate)}</td>
      <td className="px-3 py-1.5 font-semibold text-text-strong whitespace-nowrap">{p.payee}</td>
      <td className="px-3 py-1.5 whitespace-nowrap">{p.type}</td>
      <td className="px-3 py-1.5 whitespace-nowrap text-[#94a3b8]">
        {p.bankName ? `${p.bankName} ${p.accountNo}` : '-'}
      </td>
      <td className="px-3 py-1.5 tabular text-right font-bold text-warning whitespace-nowrap">{comma(p.amount)}</td>
      <td className="px-3 py-1.5 text-center whitespace-nowrap">
        <div className="flex items-center justify-center gap-1.5">
          <Badge tone={payoutStatusTone(p.status)}>{p.status}</Badge>
          <select
            value={p.status}
            onChange={(e) => onStatus(e.target.value as PayoutStatus)}
            className="h-7 rounded-[7px] bg-input border border-border px-1.5 text-[12px] text-input-text outline-none focus:border-primary"
            title="상태 변경"
          >
            {PAYOUT_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap text-[#94a3b8]">{p.memo || '-'}</td>
      <td className="px-3 py-1.5 text-center whitespace-nowrap">
        <button
          onClick={onDelete}
          title="삭제"
          className="h-8 w-8 rounded-lg border border-border inline-flex items-center justify-center text-danger hover:bg-hover hover:brightness-125"
        >
          <Trash2 size={16} />
        </button>
      </td>
    </tr>
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
