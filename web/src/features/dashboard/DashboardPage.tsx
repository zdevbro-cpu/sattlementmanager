// 대시보드 — 계약/매출/조직관리 실데이터를 집계해 KPI·최근 계약·정산 파이프라인·추천인 순위를 보여준다.
import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Coins, FileText, Landmark, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Badge from '../../components/ui/Badge'
import { comma, dateText } from '../../lib/format'
import { listContracts } from '../contract/contractStore'
import { listAppointments } from '../appointment/appointmentStore'
import { listSales } from '../sales/salesStore'
import { usePositionSalaries } from '../appointment/positionSalaryStore'
import { useSettlementSettings } from '../system/settlementSettingsStore'
import { EMPTY_FILTER, statusColor, type Contract } from '../../types/contract'
import { EMPTY_APPOINTMENT_FILTER, type Appointment } from '../../types/appointment'
import { EMPTY_SALES_FILTER, type Sale } from '../../types/sales'

const WITHHOLDING = 0.033 // 원천징수 3.3% (지급관리와 동일 기준)

function monthPrefixOf(d: Date): string {
  return d.toISOString().slice(0, 7)
}

export default function DashboardPage() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const positionSalaries = usePositionSalaries()
  const { feeRate } = useSettlementSettings()

  useEffect(() => {
    let alive = true
    Promise.all([
      listContracts(EMPTY_FILTER),
      listAppointments(EMPTY_APPOINTMENT_FILTER),
      listSales(EMPTY_SALES_FILTER),
    ])
      .then(([c, a, s]) => {
        if (!alive) return
        setContracts(c)
        setAppointments(a)
        setSales(s)
        setLoading(false)
      })
      .catch((e) => {
        if (!alive) return
        setLoadErr((e as Error).message || '데이터를 불러오지 못했습니다.')
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const now = new Date()
  const monthPrefix = monthPrefixOf(now)
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthPrefix = monthPrefixOf(lastMonthDate)
  const weekAgo = new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10)
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysLeft = lastDayOfMonth - now.getDate()

  const activeContracts = contracts.filter(
    (c) => c.current.status !== '해지' && c.current.status !== '폐기',
  )
  const newThisWeek = activeContracts.filter(
    (c) => (c.current.contractDate ?? '') >= weekAgo,
  ).length

  const monthSales = sales
    .filter((s) => (s.date ?? '').startsWith(monthPrefix))
    .reduce((a, s) => a + s.payment.totalAmount, 0)
  const lastMonthSales = sales
    .filter((s) => (s.date ?? '').startsWith(lastMonthPrefix))
    .reduce((a, s) => a + s.payment.totalAmount, 0)
  const salesTrendPct =
    lastMonthSales > 0 ? Math.round(((monthSales - lastMonthSales) / lastMonthSales) * 1000) / 10 : null

  const allowancePayout = (allowance: number) =>
    Math.round(allowance * (1 - WITHHOLDING))
  const allowanceTargets = activeContracts.filter(
    (c) => c.current.allowance > 0 && c.current.allowancePayDay,
  )
  const monthAllowance = allowanceTargets.reduce((a, c) => a + allowancePayout(c.current.allowance), 0)

  const basicOf = (a: Appointment) =>
    positionSalaries.find((p) => p.position === a.position)?.basic || a.salary
  const salaryPayout = (a: Appointment) =>
    Math.round((Math.round(basicOf(a) / 12) + a.activity) * (1 - WITHHOLDING))
  const salaryTargets = appointments.filter((a) => a.status === '정상운영')
  const monthSalary = salaryTargets.reduce((a, ap) => a + salaryPayout(ap), 0)

  const feeAmount = Math.round((monthSales * feeRate) / 100)
  const settlementAmount = monthSales - feeAmount

  const pipeline = [
    { label: '매출 집계', value: monthSales, tint: '#16a34a' },
    { label: '수수료 차감', value: -feeAmount, tint: '#ef4444' },
    { label: '정산금액', value: settlementAmount, tint: '#2563eb' },
    { label: '수당 산출', value: -monthAllowance, tint: '#f59e0b' },
    { label: '급여 생성', value: -monthSalary, tint: '#7c3aed' },
  ]
  const pipelineMax = Math.max(monthSales, 1)

  const recentContracts = activeContracts.slice(0, 6)

  const recruiterRank = (() => {
    const map = new Map<string, number>()
    activeContracts.forEach((c) => {
      const name = c.current.recruiter.trim()
      if (!name) return
      map.set(name, (map.get(name) ?? 0) + 1)
    })
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  })()

  return (
    <AppLayout title="대시보드">
      <div className="mb-4">
        <h1 className="text-[22px] font-extrabold tracking-[-0.5px] text-text-strong">대시보드</h1>
        <p className="text-[13px] text-[#94a3b8] mt-1">계약부터 정산·지급까지 운영 현황을 한눈에 확인하세요.</p>
      </div>

      {loadErr && (
        <div className="rounded-[14px] border border-danger/40 bg-card p-4 mb-4 text-[13px] text-danger">
          불러오기 실패: {loadErr}
        </div>
      )}

      <div className="grid grid-cols-4 gap-4 mb-4">
        <KpiCard
          label="진행중 계약"
          value={`${activeContracts.length}건`}
          tint="#e0edff"
          fg="#2563eb"
          icon={FileText}
          trend={newThisWeek > 0 ? `${newThisWeek}건 (이번 주)` : '이번 주 신규 없음'}
          trendUp={newThisWeek > 0}
        />
        <KpiCard
          label="당월 매출"
          value={`${comma(monthSales)}원`}
          tint="#e2f7ec"
          fg="#16a34a"
          icon={Wallet}
          trend={
            salesTrendPct === null
              ? '전월 실적 없음'
              : `${Math.abs(salesTrendPct)}% vs 전월`
          }
          trendUp={salesTrendPct === null ? undefined : salesTrendPct >= 0}
        />
        <KpiCard
          label="당월 수당"
          value={`${comma(monthAllowance)}원`}
          tint="#fff1e0"
          fg="#f59e0b"
          icon={Coins}
          trend={`대상 ${allowanceTargets.length}건`}
        />
        <KpiCard
          label="당월 급여"
          value={`${comma(monthSalary)}원`}
          tint="#f3e8ff"
          fg="#7c3aed"
          icon={Landmark}
          trend={`정상운영 ${salaryTargets.length}건 기준`}
        />
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-4 mb-4">
        <div className="rounded-[14px] border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-[15px] font-extrabold text-text-strong">최근 계약 현황</span>
            <Link to="/contracts" className="flex items-center gap-1 text-[12.5px] font-bold text-primary hover:brightness-110">
              전체보기 <ArrowRight size={13} />
            </Link>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[12.5px] text-[#94a3b8] border-b border-border">
                <th className="px-4 py-2 font-semibold text-center">계약일</th>
                <th className="px-4 py-2 font-semibold">계약자</th>
                <th className="px-4 py-2 font-semibold">유형</th>
                <th className="px-4 py-2 font-semibold text-right">계약금액</th>
                <th className="px-4 py-2 font-semibold text-center">상태</th>
              </tr>
            </thead>
            <tbody>
              {recentContracts.map((c) => {
                const cur = c.current
                const tone = statusColor(cur.status)
                return (
                  <tr key={c.id} className="border-b border-border hover:bg-hover">
                    <td className="px-4 py-2 text-center tabular whitespace-nowrap">{dateText(cur.contractDate)}</td>
                    <td className="px-4 py-2 font-semibold text-text-strong whitespace-nowrap">{cur.contractorName}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{cur.contractType}</td>
                    <td className="px-4 py-2 text-right tabular whitespace-nowrap">{comma(cur.deposit)}원</td>
                    <td className="px-4 py-2 text-center whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: tone.fg }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.fg }} />
                        {cur.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {recentContracts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[#64748b]">
                    {loading ? '불러오는 중…' : '등록된 계약이 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-[14px] border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <span className="text-[15px] font-extrabold text-text-strong">이번 달 정산 파이프라인</span>
            <div className="text-[11.5px] text-[#94a3b8] mt-0.5">
              {now.getFullYear()}년 {now.getMonth() + 1}월 · 정산마감 D-{Math.max(daysLeft, 0)}
            </div>
          </div>
          <div className="p-4 space-y-3.5">
            {pipeline.map((p, i) => {
              const width = Math.min(100, Math.round((Math.abs(p.value) / pipelineMax) * 100))
              return (
                <div key={p.label}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="h-5 w-5 rounded-full bg-[#1d3a63] text-[#8fb0e0] flex items-center justify-center text-[10.5px] font-bold">
                        {i + 1}
                      </span>
                      <span className="text-[12.5px] font-semibold text-[#c2cde0]">{p.label}</span>
                    </div>
                    <span className="text-[13px] font-bold tabular text-text-strong">
                      {p.value < 0 ? '-' : ''}
                      {comma(Math.abs(p.value))}원
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-hover overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${width}%`, background: p.tint }} />
                  </div>
                </div>
              )
            })}
            {feeRate === 0 && (
              <p className="text-[11px] text-[#64748b] pt-1">
                수수료율이 0%로 설정되어 있습니다. 시스템관리 &gt; 정산 수수료율에서 변경하면 자동 반영됩니다.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-[14px] border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <span className="text-[15px] font-extrabold text-text-strong">추천인 순위</span>
        </div>
        <div className="grid grid-cols-4 divide-x divide-border">
          {Array.from({ length: 4 }).map((_, col) => (
            <div key={col} className="divide-y divide-border">
              {recruiterRank.slice(col * 2, col * 2 + 2).map(([name, count], i) => (
                <div key={name} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="h-6 w-6 rounded-full bg-[#1d3a63] text-[#8fb0e0] flex items-center justify-center text-[11px] font-bold">
                      {col * 2 + i + 1}
                    </span>
                    <span className="text-[13px] font-semibold text-text-strong">{name}</span>
                  </div>
                  <Badge tone="slate">{count}건</Badge>
                </div>
              ))}
            </div>
          ))}
        </div>
        {recruiterRank.length === 0 && (
          <div className="px-4 py-10 text-center text-[#64748b] text-[13px]">
            {loading ? '불러오는 중…' : '추천인 데이터가 없습니다.'}
          </div>
        )}
      </div>
    </AppLayout>
  )
}

function KpiCard({
  label,
  value,
  tint,
  fg,
  icon: Icon,
  trend,
  trendUp,
}: {
  label: string
  value: string
  tint: string
  fg: string
  icon: ComponentType<{ size?: number }>
  trend: string
  trendUp?: boolean
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
      <div className="text-[21px] font-extrabold text-text-strong leading-tight">{value}</div>
      <div
        className="flex items-center gap-1 text-[11.5px] font-semibold mt-1"
        style={{ color: trendUp === undefined ? '#64748b' : trendUp ? '#22c55e' : '#f87171' }}
      >
        {trendUp !== undefined && (trendUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />)}
        {trend}
      </div>
    </div>
  )
}
