import { useEffect, useState } from 'react'
import { Building2, CheckCircle2, Layers, Plus, RefreshCw, Timer, Trash2, Eye } from 'lucide-react'
import type { ComponentType } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import Badge, { branchTone, dDayTone, storeStatusTone } from '../../components/ui/Badge'
import Pagination from '../../components/ui/Pagination'
import { EMPTY_STORE_FILTER, RELEASED_FILTER_VALUE, STORE_STATUSES, type Store, type StoreFilter } from '../../types/store'
import { deleteStore, listStores, summarizeStores } from './storeStore'
import StoreRegisterModal from './StoreRegisterModal'
import StoreDetailDrawer from './StoreDetailDrawer'
import { EMPTY_FILTER } from '../../types/contract'
import { listContracts } from '../contract/contractStore'
import { listStaff } from './staffStore'
import { useAuth } from '../auth/AuthContext'

const inputCls =
  'h-[38px] w-full rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary'

/** 오늘 날짜(KST, YYYY-MM-DD) — 서버의 상태변경일 계산과 동일한 기준(KST 달력일)을 쓴다 */
function todayIsoKst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

/**
 * 선점 만료일까지 남은 일수 (음수=이미 지남) — 없으면 null.
 * 시각(시/분)은 무시하고 순수 날짜 차이로만 계산해야 등록 당일에 정확히 D-7이 된다 —
 * 타임스탬프째로 빼면 시간대·시각에 따라 D-6/D-8처럼 어긋난다.
 */
function dDay(dateStr: string): number | null {
  if (!dateStr) return null
  const [y1, m1, d1] = todayIsoKst().split('-').map(Number)
  const [y2, m2, d2] = dateStr.split('-').map(Number)
  const today = Date.UTC(y1, m1 - 1, d1)
  const target = Date.UTC(y2, m2 - 1, d2)
  return Math.round((target - today) / (24 * 3600 * 1000))
}

export default function StoreListPage() {
  const [filter, setFilter] = useState<StoreFilter>(EMPTY_STORE_FILTER)
  const [rows, setRows] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [perPage, setPerPage] = useState(20)
  const [page, setPage] = useState(1)
  const [partLeaders, setPartLeaders] = useState<string[]>([])
  const { user } = useAuth()
  // 파트너 계정(staff_accounts)으로 로그인한 경우만 매장 등록 권한 여부를 확인한다 — 못 찾으면(=관리자 계정) 제한 없이 허용
  const [canRegister, setCanRegister] = useState(true)
  // 선점담당 연락처·사업부 표시용 — 이름으로 파트너 계정 정보를 찾는다
  const [staffInfoByName, setStaffInfoByName] = useState<Record<string, { phone: string; businessUnit: string }>>({})

  useEffect(() => {
    let alive = true
    listStaff().then((list) => {
      if (!alive) return
      if (user?.email) {
        const me = list.find((s) => s.email === user.email)
        setCanRegister(!me || me.canRegisterStore)
      }
      const map: Record<string, { phone: string; businessUnit: string }> = {}
      list.forEach((s) => {
        if (s.name) map[s.name] = { phone: s.phone, businessUnit: s.businessUnit }
      })
      setStaffInfoByName(map)
    })
    return () => {
      alive = false
    }
  }, [user?.email])

  useEffect(() => {
    let alive = true
    listContracts(EMPTY_FILTER).then((list) => {
      if (alive) {
        setPartLeaders(
          list
            .filter((c) => c.current.contractType === 'LAS-On파트장' && c.current.status !== '폐기')
            .map((c) => c.current.contractorName),
        )
      }
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    // 선점해지는 실제 STORE_STATUSES 값이 아니라 클라이언트에서 걸러내는 특수 조건이라, 서버에는 상태 필터 없이 요청한다
    const serverFilter = filter.status === RELEASED_FILTER_VALUE ? { ...filter, status: '전체' } : filter
    listStores(serverFilter).then((list) => {
      if (alive) {
        setRows(list)
        setLoading(false)
      }
    })
    return () => {
      alive = false
    }
  }, [filter, refresh])

  useEffect(() => {
    setPage(1)
  }, [filter, perPage])

  // 선점파트/선점담당자/선점해지는 서버가 모르는 조건이라 클라이언트에서 추가로 걸러낸다
  const visibleRows = rows.filter((s) => {
    if (filter.status === RELEASED_FILTER_VALUE && (s.claimedPart || s.claimedStaff)) return false
    if (filter.claimedPart && s.claimedPart !== filter.claimedPart) return false
    if (filter.claimedStaff && !s.claimedStaff.includes(filter.claimedStaff)) return false
    return true
  })

  const sum = summarizeStores(visibleRows)
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / perPage))
  const safePage = Math.min(page, totalPages)
  const pagedRows = visibleRows.slice((safePage - 1) * perPage, safePage * perPage)

  const onDelete = async (s: Store) => {
    if (!confirm(`${s.storeName} 매장을 삭제할까요? (섭외이력·사진도 함께 삭제되며 되돌릴 수 없습니다)`)) return
    await deleteStore(s.id)
    setRefresh((n) => n + 1)
  }

  return (
    <AppLayout title="매장섭외관리">
      <div className="mb-4">
        <h1 className="text-[22px] font-extrabold tracking-[-0.5px] text-text-strong">
          매장섭외관리
        </h1>
      </div>

      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="text-[13px] text-[#94a3b8]">
            라스온 매장 섭외 현황을 파트 간 중복 없이 단일 관리합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setRefresh((n) => n + 1)}
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border px-4 text-sm font-bold text-[#c2cde0] hover:bg-hover"
          >
            <RefreshCw size={14} /> 새로고침
          </button>
          {canRegister && (
            <button
              onClick={() => setRegisterOpen(true)}
              className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-bold text-white hover:brightness-110"
            >
              <Plus size={15} /> 매장 등록
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-4">
        <SummaryCard label="전체 매장" value={sum.total} tint="#e0edff" fg="#2563eb" icon={Building2} />
        <SummaryCard label="진행중" value={sum.active} tint="#fff1e0" fg="#f59e0b" icon={Layers} />
        <SummaryCard label="오픈" value={sum.contracted} tint="#e2f7ec" fg="#16a34a" icon={CheckCircle2} />
        <SummaryCard label="선점만료 임박(7일)" value={sum.expiringSoon} tint="#fee2e2" fg="#ef4444" icon={Timer} />
      </div>

      <div className="rounded-[14px] border border-border bg-card p-4 mb-4">
        <div className="grid grid-cols-[repeat(4,minmax(160px,1fr))_auto] gap-2 items-end">
          <Field label="검색">
            <input
              value={filter.keyword}
              onChange={(e) => setFilter({ ...filter, keyword: e.target.value })}
              placeholder="매장명/담당자명 검색"
              className={inputCls}
            />
          </Field>
          <Field label="상태">
            <select
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value })}
              className={inputCls}
            >
              <option value="전체">전체</option>
              {STORE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value={RELEASED_FILTER_VALUE}>{RELEASED_FILTER_VALUE}</option>
            </select>
          </Field>
          <Field label="선점 파트">
            <select
              value={filter.claimedPart}
              onChange={(e) => setFilter({ ...filter, claimedPart: e.target.value })}
              className={inputCls}
            >
              <option value="">전체</option>
              {partLeaders.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="선점 담당자">
            <input
              value={filter.claimedStaff}
              onChange={(e) => setFilter({ ...filter, claimedStaff: e.target.value })}
              placeholder="선점 담당자명 검색"
              className={inputCls}
            />
          </Field>
          <button
            onClick={() => setFilter(EMPTY_STORE_FILTER)}
            className="h-[38px] rounded-[8px] border border-border px-4 text-sm font-semibold text-[#c2cde0] hover:bg-hover whitespace-nowrap"
          >
            초기화
          </button>
        </div>
      </div>

      <div className="rounded-[14px] border border-border bg-card overflow-hidden">
        <div className="px-4 py-3">
          <span className="text-[15px] font-extrabold text-text-strong">
            총 <span className="text-primary">{visibleRows.length}</span>건
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-[13px]">
            <thead>
              <tr className="text-left text-[11.5px] text-[#64748b] border-t border-border">
                <th className="px-3 py-1 font-semibold whitespace-nowrap"></th>
                <th colSpan={6} className="px-3 py-1 font-semibold whitespace-nowrap text-center border-x border-border">
                  매장
                </th>
                <th colSpan={4} className="px-3 py-1 font-semibold whitespace-nowrap text-center border-r border-border">
                  선점 정보
                </th>
                <th className="px-3 py-1 font-semibold whitespace-nowrap"></th>
                <th className="px-3 py-1 font-semibold whitespace-nowrap"></th>
              </tr>
              <tr className="text-left text-[12.5px] text-[#94a3b8] border-b border-border">
                {['번호', '매장명', '상태', '주소', '전화번호', '담당자', '담당자연락처', '사업부', '선점파트', '선점담당', '선점담당연락처', '만료D-day', '관리'].map((h) => (
                  <th
                    key={h}
                    className={`px-3 py-1.5 font-semibold whitespace-nowrap ${h === '관리' ? 'text-center' : ''}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((s, i) => {
                const d = dDay(s.claimExpiresAt)
                return (
                  <tr key={s.id} className="border-b border-border hover:bg-hover">
                    <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#c2cde0]">{visibleRows.length - ((safePage - 1) * perPage + i)}</td>
                    <td className="px-3 py-1.5 font-semibold text-text-strong whitespace-nowrap">{s.storeName}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {!s.claimedPart && !s.claimedStaff ? (
                        <Badge tone="red">선점해지</Badge>
                      ) : (
                        <Badge tone={storeStatusTone(s.status)}>{s.status}</Badge>
                      )}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap max-w-[220px] truncate">{s.roadAddress || '-'}</td>
                    <td className="px-3 py-1.5 tabular whitespace-nowrap">{s.storePhone || '-'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{s.contactName || '-'}</td>
                    <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#94a3b8]">{s.contactMobile || '-'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {s.claimedStaff ? (
                        <Badge tone={branchTone(staffInfoByName[s.claimedStaff]?.businessUnit || 'LASON(본사)')}>
                          {staffInfoByName[s.claimedStaff]?.businessUnit || 'LASON(본사)'}
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{s.claimedPart || '-'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{s.claimedStaff || '-'}</td>
                    <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#94a3b8]">
                      {(s.claimedStaff && staffInfoByName[s.claimedStaff]?.phone) || '-'}
                    </td>
                    <td className="px-3 py-1.5 tabular whitespace-nowrap">
                      {d === null ? '-' : <Badge tone={dDayTone(d)}>{d >= 0 ? `D-${d}` : `만료 D+${-d}`}</Badge>}
                    </td>
                    <td className="px-3 py-1.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setDetailId(s.id)}
                          title="상세 보기"
                          className="h-8 w-8 rounded-lg border border-border inline-flex items-center justify-center text-[#94a3b8] hover:bg-hover hover:text-white"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => onDelete(s)}
                          title="삭제"
                          className="h-8 w-8 rounded-lg border border-border inline-flex items-center justify-center text-danger hover:bg-hover hover:brightness-125"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-3 py-10 text-center text-[#64748b]">
                    {loading ? '불러오는 중…' : '조건에 맞는 매장이 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {visibleRows.length > 0 && (
          <Pagination page={safePage} totalPages={totalPages} perPage={perPage} onPageChange={setPage} onPerPageChange={setPerPage} />
        )}
      </div>

      {registerOpen && (
        <StoreRegisterModal
          onClose={() => setRegisterOpen(false)}
          onCreated={() => {
            setRegisterOpen(false)
            setRefresh((n) => n + 1)
          }}
        />
      )}
      {detailId && (
        <StoreDetailDrawer
          storeId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={() => setRefresh((n) => n + 1)}
        />
      )}
    </AppLayout>
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
  tint,
  fg,
  icon: Icon,
}: {
  label: string
  value: number
  tint: string
  fg: string
  icon: ComponentType<{ size?: number }>
}) {
  return (
    <div className="rounded-[12px] border border-border bg-card p-4 flex items-center gap-3">
      <div className="h-[38px] w-[38px] rounded-[11px] flex items-center justify-center" style={{ background: tint, color: fg }}>
        <Icon size={18} />
      </div>
      <div>
        <div className="text-[13px] font-semibold text-[#64748b]">{label}</div>
        <div className="text-[18px] font-extrabold text-text-strong leading-tight tabular">{value}</div>
      </div>
    </div>
  )
}
