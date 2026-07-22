import { useEffect, useState } from 'react'
import { Building2, CheckCircle2, Layers, Plus, RefreshCw, Timer, Trash2, Eye } from 'lucide-react'
import type { ComponentType } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import Badge, { storeStatusTone } from '../../components/ui/Badge'
import { EMPTY_STORE_FILTER, STORE_STATUSES, type Store, type StoreFilter } from '../../types/store'
import { deleteStore, listStores, summarizeStores } from './storeStore'
import StoreRegisterModal from './StoreRegisterModal'
import StoreDetailDrawer from './StoreDetailDrawer'

const inputCls =
  'h-[38px] w-full rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary'

/** 선점 만료 D-day (음수=이미 만료) — 없으면 null */
function dDay(dateStr: string): number | null {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (24 * 3600 * 1000))
}

export default function StoreListPage() {
  const [filter, setFilter] = useState<StoreFilter>(EMPTY_STORE_FILTER)
  const [rows, setRows] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    listStores(filter).then((list) => {
      if (alive) {
        setRows(list)
        setLoading(false)
      }
    })
    return () => {
      alive = false
    }
  }, [filter, refresh])

  const sum = summarizeStores(rows)

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
          <button
            onClick={() => setRegisterOpen(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-bold text-white hover:brightness-110"
          >
            <Plus size={15} /> 매장 등록
          </button>
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
            </select>
          </Field>
          <div className="col-span-2" />
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
            총 <span className="text-primary">{rows.length}</span>건
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
                <th colSpan={2} className="px-3 py-1 font-semibold whitespace-nowrap text-center border-r border-border">
                  선점 정보
                </th>
                <th className="px-3 py-1 font-semibold whitespace-nowrap"></th>
                <th className="px-3 py-1 font-semibold whitespace-nowrap"></th>
              </tr>
              <tr className="text-left text-[12.5px] text-[#94a3b8] border-b border-border">
                {['번호', '매장명', '상태', '주소', '전화번호', '담당자', '담당자연락처', '선점파트', '선점담당', '만료D-day', '관리'].map((h) => (
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
              {rows.map((s, i) => {
                const d = dDay(s.claimExpiresAt)
                return (
                  <tr key={s.id} className="border-b border-border hover:bg-hover">
                    <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#c2cde0]">{rows.length - i}</td>
                    <td className="px-3 py-1.5 font-semibold text-text-strong whitespace-nowrap">{s.storeName}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <Badge tone={storeStatusTone(s.status)}>{s.status}</Badge>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap max-w-[220px] truncate">{s.roadAddress || '-'}</td>
                    <td className="px-3 py-1.5 tabular whitespace-nowrap">{s.storePhone || '-'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{s.contactName || '-'}</td>
                    <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#94a3b8]">{s.contactMobile || '-'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{s.claimedPart || '-'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{s.claimedStaff || '-'}</td>
                    <td className="px-3 py-1.5 tabular whitespace-nowrap">
                      {d === null ? '-' : d <= 7 ? <span className="font-bold text-danger">D{d >= 0 ? `-${d}` : `+${-d}`}</span> : `D-${d}`}
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
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-10 text-center text-[#64748b]">
                    {loading ? '불러오는 중…' : '조건에 맞는 매장이 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
