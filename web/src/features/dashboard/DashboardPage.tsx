// 대시보드 — 계약/매출/조직관리 실데이터를 집계해 KPI·최근 계약·정산 파이프라인·추천인 순위를 보여준다.
import { useEffect, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  Building2,
  Coins,
  FileText,
  HandCoins,
  Landmark,
  Network,
  ShoppingCart,
  Truck,
  Users,
} from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import { comma, won } from '../../lib/format'
import { listContracts, summarize } from '../contract/contractStore'
import { listAppointments, summarizeAppointments, summarizeByPosition } from '../appointment/appointmentStore'
import { listSales, summarizeSales } from '../sales/salesStore'
import { listApplications, summarizeApplications } from '../textbook/textbookStore'
import { listStores, summarizeStores } from '../store/storeStore'
import { summarizeShipments } from '../delivery/deliveryStore'
import { buildLasOnBonusRows } from '../payment/lasOnBonusEngine'
import { usePositionSalaries } from '../appointment/positionSalaryStore'
import { useSettlementSettings } from '../system/settlementSettingsStore'
import { EMPTY_FILTER, type Contract } from '../../types/contract'
import { EMPTY_APPOINTMENT_FILTER, type Appointment } from '../../types/appointment'
import { EMPTY_SALES_FILTER, type Sale } from '../../types/sales'
import { EMPTY_TEXTBOOK_FILTER, type TextbookApplication } from '../../types/textbook'
import { EMPTY_STORE_FILTER, type Store } from '../../types/store'
import type { ShipmentSummary } from '../../types/delivery'

const WITHHOLDING = 0.033 // 원천징수 3.3% (지급관리와 동일 기준)

/** 모바일 기기 여부 — 모바일에선 각 모듈로 점프하는 링크를 숨기고 현황만 보여준다. */
function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent)
}

function monthPrefixOf(d: Date): string {
  return d.toISOString().slice(0, 7)
}

export default function DashboardPage() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [applications, setApplications] = useState<TextbookApplication[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [shipmentSummary, setShipmentSummary] = useState<ShipmentSummary | null>(null)
  const [, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const positionSalaries = usePositionSalaries()
  const { feeRate } = useSettlementSettings()

  useEffect(() => {
    let alive = true
    Promise.all([
      listContracts(EMPTY_FILTER),
      listAppointments(EMPTY_APPOINTMENT_FILTER),
      listSales(EMPTY_SALES_FILTER),
      listApplications(EMPTY_TEXTBOOK_FILTER),
      listStores(EMPTY_STORE_FILTER),
      summarizeShipments(),
    ])
      .then(([c, a, s, t, st, sh]) => {
        if (!alive) return
        setContracts(c)
        setAppointments(a)
        setSales(s)
        setApplications(t)
        setStores(st)
        setShipmentSummary(sh)
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
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysLeft = lastDayOfMonth - now.getDate()

  const activeContracts = contracts.filter(
    (c) => c.current.status !== '해지' && c.current.status !== '폐기',
  )

  const monthSales = sales
    .filter((s) => (s.date ?? '').startsWith(monthPrefix))
    .reduce((a, s) => a + s.payment.totalAmount, 0)

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

  // ── 모듈별 요약 집계 (각 화면 카드와 동일 기준) ──────────────────────────
  const mobile = isMobileDevice()
  const today10 = now.toISOString().slice(0, 10)

  const contractSummary = summarize(contracts)
  const lasOnContracts = contracts.filter(
    (c) => c.current.contractType === 'LAS-On파트장' || c.current.contractType === 'LAS-On파트너',
  )
  const lasOnSummary = summarize(lasOnContracts)
  const salesSummary = summarizeSales(sales)
  const appointmentSummary = summarizeAppointments(appointments)
  const positionSummary = summarizeByPosition(appointments)
  const positionEntries = positionSummary.filter((p) => p.count > 0).map((p) => `${p.position} ${p.count}`)
  const positionMid = Math.ceil(positionEntries.length / 2)
  const positionLine1 = positionEntries.slice(0, positionMid).join(' · ') || '해당 없음'
  const positionLine2 = positionEntries.slice(positionMid).join(' · ')
  const applicationSummary = summarizeApplications(applications)
  const storeSummary = summarizeStores(stores)

  // 라스온수당지급 — PaymentListPage와 동일: 연번 단위 합계행만 집계
  const bonusRows = buildLasOnBonusRows(contracts, today10)
  const bonusSummaryRows = bonusRows.filter(
    (r, i) => !bonusRows[i - 1] || r.no !== bonusRows[i - 1].no,
  )
  const bonusTotal = bonusSummaryRows.reduce((a, r) => a + r.netAmount, 0)
  const bonusDepositSum = bonusSummaryRows.reduce((a, r) => a + r.depositTotal, 0)
  const bonusTargetCount = new Set(bonusRows.map((r) => r.no)).size

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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-4">
        <ModuleBlock title="계약관리" to={mobile ? undefined : '/contracts'} tint="#e0edff" fg="#2563eb" icon={FileText}>
          <Stat label="계약총액" value={won(contractSummary.depositTotal)} sub={`진행중 ${contractSummary.active}건`} />
          <Stat label="이번달 계약" value={won(contractSummary.monthTotal)} sub={`이번주 ${won(contractSummary.weekTotal)}`} />
        </ModuleBlock>

        <ModuleBlock title="결재관리" to={mobile ? undefined : '/sales'} tint="#fff1e0" fg="#f59e0b" icon={ShoppingCart}>
          <Stat label="매출 합계" value={won(salesSummary.cardTotal + salesSummary.cashTotal)} sub={`총 ${salesSummary.total}건`} />
          <Stat label="당월 매출" value={won(monthSales)} sub={`미확인 ${salesSummary.unverified}건`} />
        </ModuleBlock>

        <ModuleBlock title="수익금관리" to={mobile ? undefined : '/payment'} tint="#e2f7ec" fg="#16a34a" icon={Coins}>
          <Stat label="정산금액" value={won(settlementAmount)} sub={`당월 매출 ${won(monthSales)}`} />
          <Stat label="수수료 차감" value={won(feeAmount)} sub={`수수료율 ${feeRate}%`} />
        </ModuleBlock>

        <ModuleBlock title="급여관리" to={mobile ? undefined : '/payment'} tint="#fff1e0" fg="#f59e0b" icon={Landmark}>
          <Stat label="당월 급여" value={won(monthSalary)} sub={`정상운영 ${salaryTargets.length}건`} />
          <Stat label="당월 수당" value={won(monthAllowance)} sub={`대상 ${allowanceTargets.length}건`} />
        </ModuleBlock>

        <ModuleBlock title="임용관리" to={mobile ? undefined : '/base'} tint="#e0edff" fg="#2563eb" icon={Users}>
          <Stat label="정상운영" value={`${appointmentSummary.active}명`} sub={`휴직 ${appointmentSummary.paused} · 해지 ${appointmentSummary.ended}`} />
          <Stat label="직급 구성" value={positionLine1} sub={positionLine2 || undefined} />
        </ModuleBlock>

        <ModuleBlock title="라스온현황" to={mobile ? undefined : '/contracts'} tint="#e2f7ec" fg="#16a34a" icon={Network}>
          <Stat label="계약총액" value={won(lasOnSummary.depositTotal)} sub={`진행중 ${lasOnSummary.active}건`} />
          <Stat label="이번달 계약" value={won(lasOnSummary.monthTotal)} sub={`이번주 ${won(lasOnSummary.weekTotal)}`} />
        </ModuleBlock>

        <ModuleBlock title="라스온수당지급" to={mobile ? undefined : '/payment'} tint="#f3e8ff" fg="#7c3aed" icon={HandCoins}>
          <Stat label="보증금 합계" value={won(bonusDepositSum)} sub="대상 계약 보증금" />
          <Stat label="지급예정금액" value={won(bonusTotal)} sub={`지급대상 ${bonusTargetCount}건`} />
        </ModuleBlock>

        <ModuleBlock title="교재신청관리" to={mobile ? undefined : '/textbook-apply'} tint="#f3e8ff" fg="#7c3aed" icon={BookOpen}>
          <Stat label="신청 건수" value={`${applicationSummary.total}건`} sub={`오늘 ${applicationSummary.todayCount}건`} />
          <Stat label="첨부 현황" value={`사진 ${applicationSummary.withPhoto} · PDF ${applicationSummary.withPdf}`} />
        </ModuleBlock>

        <ModuleBlock title="배송관리" to={mobile ? undefined : '/delivery'} tint="#e0edff" fg="#2563eb" icon={Truck}>
          <Stat label="전체 배송" value={`${shipmentSummary?.total ?? 0}건`} sub={`추후배송 ${shipmentSummary?.deferred ?? 0}건`} />
          <Stat label="배송중" value={`${shipmentSummary?.shipping ?? 0}건`} sub={`완료 ${shipmentSummary?.done ?? 0}건`} />
        </ModuleBlock>

        <ModuleBlock title="매장섭외관리" to={mobile ? undefined : '/stores'} tint="#e2f7ec" fg="#16a34a" icon={Building2}>
          <Stat label="전체 매장" value={`${storeSummary.total}건`} sub={`진행중 ${storeSummary.active}건`} />
          <Stat label="계약완료(오픈)" value={`${storeSummary.contracted}건`} sub={`선점만료임박 ${storeSummary.expiringSoon}건`} />
        </ModuleBlock>
      </div>

      <div className="rounded-[14px] border border-border bg-card overflow-hidden mb-4">
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
    </AppLayout>
  )
}

/** 모듈별 요약 블록 — 헤더(아이콘·제목·전체보기)와 지표(Stat) 묶음.
 *  to가 없으면(모바일) 전체보기 링크를 렌더링하지 않고 현황만 보여준다. */
function ModuleBlock({
  title,
  to,
  tint,
  fg,
  icon: Icon,
  children,
}: {
  title: string
  to?: string
  tint: string
  fg: string
  icon: ComponentType<{ size?: number }>
  children: ReactNode
}) {
  return (
    <div className="rounded-[12px] border border-border bg-card overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="h-[34px] w-[34px] rounded-[10px] flex items-center justify-center shrink-0"
            style={{ background: tint, color: fg }}
          >
            <Icon size={17} />
          </div>
          <span className="text-[14px] font-extrabold text-text-strong">{title}</span>
        </div>
        {to && (
          <Link to={to} className="flex items-center gap-1 text-[12px] font-bold text-primary hover:brightness-110">
            전체보기 <ArrowRight size={12} />
          </Link>
        )}
      </div>
      <div className="p-4 flex flex-col gap-3 flex-1">{children}</div>
    </div>
  )
}

/** 모듈 블록 내부 지표 한 줄 */
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[12px] font-semibold text-[#64748b]">{label}</div>
      <div className="text-[18px] font-extrabold text-text-strong leading-tight whitespace-nowrap">{value}</div>
      {sub && <div className="text-[12px] font-semibold text-[#94a3b8] mt-0.5 whitespace-nowrap">{sub}</div>}
    </div>
  )
}
