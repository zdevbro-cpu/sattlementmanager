import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Eye, Plus, Trash2 } from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import DateTextInput from '../../components/ui/DateTextInput'
import { comma, dateText, todayIso } from '../../lib/format'
import {
  EMPTY_APPOINTMENT_FILTER,
  type Appointment,
  type AppointmentFilter,
} from '../../types/appointment'
import {
  listAppointments,
  summarizeAppointments,
  updateAppointment,
} from './appointmentStore'
import AppointmentRegisterModal from './AppointmentRegisterModal'
import AppointmentDetailDrawer from './AppointmentDetailDrawer'
import { useCodes } from '../../lib/codeStore'
import { usePositionSalaries } from './positionSalaryStore'
import Badge, { branchTone, positionTone } from '../../components/ui/Badge'

const PAGE_SIZES = [20, 50, 100]
// 상태 드롭다운 전용 sentinel — 실제 status 값이 아니라 "전체 + 해지 포함"을 뜻하는 선택지
const INCLUDE_TERMINATED_VALUE = '__include_terminated__'

export default function AppointmentListPage() {
  const codes = useCodes()
  const positionSalaries = usePositionSalaries()
  // 계약관리·매출관리와 동일하게 입력 즉시 목록에 반영 (별도 검색 버튼 없음)
  const [filter, setFilter] = useState<AppointmentFilter>(EMPTY_APPOINTMENT_FILTER)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const endDateRef = useRef<HTMLInputElement>(null)

  const [rows, setRows] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [sum, setSum] = useState(() => summarizeAppointments([]))
  const [perPage, setPerPage] = useState(20)
  const [page, setPage] = useState(1)
  // 상태 필터가 '전체'일 때 해지 건은 기본적으로 숨긴다 — "전체(해지포함)" 선택 시 다시 포함
  const [statusFilter, setStatusFilter] = useState('전체')
  const [includeTerminated, setIncludeTerminated] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setLoadErr('')
    listAppointments(filter)
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
    setPage(1)
  }, [filter, statusFilter, includeTerminated, perPage])

  useEffect(() => {
    let alive = true
    listAppointments(EMPTY_APPOINTMENT_FILTER).then((list) => {
      if (alive) setSum(summarizeAppointments(list))
    })
    return () => {
      alive = false
    }
  }, [refresh])

  // 직급 선택지 — 직급표(시스템관리)에 실제 임용계약의 직급을 합쳐 빠짐없이 보여준다.
  const positionOptions = useMemo(() => {
    const set = new Set<string>()
    positionSalaries.forEach((p) => p.position && set.add(p.position))
    rows.forEach((a) => a.position && set.add(a.position))
    return [...set].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [positionSalaries, rows])

  const statusRows =
    statusFilter === '전체'
      ? includeTerminated
        ? rows
        : rows.filter((a) => a.status !== '해지')
      : rows.filter((a) => a.status === statusFilter)

  // 계약자명·지점명·직급은 각각 독립 필터로 적용한다.
  // (서버는 keyword 를 이름 OR 지점으로 매칭하므로 상위집합을 주고, 여기서 정확히 좁힌다)
  const visibleRows = useMemo(() => {
    const kw = filter.keyword.trim()
    const br = filter.branch.trim()
    return statusRows
      .filter((a) => !kw || a.name.includes(kw))
      .filter((a) => !br || (a.ref || '').includes(br))
      .filter((a) => filter.position === '전체' || a.position === filter.position)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusRows, filter])

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / perPage))
  const safePage = Math.min(page, totalPages)
  const pagedRows = visibleRows.slice((safePage - 1) * perPage, safePage * perPage)

  const onDelete = async (a: Appointment) => {
    if (!confirm(`${a.name} 임용계약을 삭제(해지 처리)할까요?`)) return
    await updateAppointment(a.id, { status: '해지' }, { memo: '목록에서 삭제 처리', editedAt: todayIso() })
    setRefresh((n) => n + 1)
  }

  return (
    <AppLayout title="조직관리 · 임용계약">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-[-0.5px] text-text-strong">
            조직관리 (임용계약)
          </h1>
          <p className="text-[13px] text-[#94a3b8] mt-1">
            임용계약을 등록·관리합니다. 직급별 급여·활동비가 자동 적용됩니다.
          </p>
        </div>
        <button
          onClick={() => setRegisterOpen(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-bold text-white hover:brightness-110"
        >
          <Plus size={15} /> 임용계약등록
        </button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <SummaryCard label="전체 임용계약" value={sum.total} tint="#e0edff" fg="#2563eb" />
        <SummaryCard label="정상" value={sum.active} tint="#e2f7ec" fg="#16a34a" />
        <SummaryCard label="휴직" value={sum.paused} tint="#fff1e0" fg="#f59e0b" />
        <SummaryCard label="해지" value={sum.ended} tint="#fee2e2" fg="#ef4444" />
      </div>

      {/* 필터 */}
      <div className="rounded-[14px] border border-border bg-card p-4 mb-4">
        <div className="grid grid-cols-[1.4fr_1.2fr_1fr_1fr_1fr_1fr_auto] gap-3 items-end">
          <Field label="계약자명">
            <input value={filter.keyword} onChange={(e) => setFilter({ ...filter, keyword: e.target.value })} placeholder="계약자명 검색" className={inputCls} />
          </Field>
          <Field label="지점명">
            <input value={filter.branch} onChange={(e) => setFilter({ ...filter, branch: e.target.value })} placeholder="지점명 검색" className={inputCls} />
          </Field>
          <Field label="직급">
            <select
              value={filter.position}
              onChange={(e) => setFilter({ ...filter, position: e.target.value })}
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
          <Field label="계약일 시작">
            <DateTextInput
              value={filter.startDate}
              onChange={(v) => setFilter({ ...filter, startDate: v })}
              onTabNext={() => endDateRef.current?.focus()}
              className={inputCls}
            />
          </Field>
          <Field label="계약일 종료">
            <DateTextInput
              ref={endDateRef}
              value={filter.endDate}
              onChange={(v) => setFilter({ ...filter, endDate: v })}
              className={inputCls}
            />
          </Field>
          <Field label="상태">
            <select
              value={includeTerminated && statusFilter === '전체' ? INCLUDE_TERMINATED_VALUE : statusFilter}
              onChange={(e) => {
                const v = e.target.value
                if (v === INCLUDE_TERMINATED_VALUE) {
                  setIncludeTerminated(true)
                  setStatusFilter('전체')
                } else {
                  setIncludeTerminated(false)
                  setStatusFilter(v)
                }
              }}
              className={inputCls}
            >
              <option value="전체">전체(해지미포함)</option>
              {codes.appointmentStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value={INCLUDE_TERMINATED_VALUE}>전체(해지포함)</option>
            </select>
          </Field>
          <button
            onClick={() => {
              setFilter(EMPTY_APPOINTMENT_FILTER)
              setStatusFilter('전체')
              setIncludeTerminated(false)
              setPage(1)
            }}
            className="h-[38px] rounded-[8px] border border-border px-5 text-sm font-semibold text-[#c2cde0] hover:bg-hover whitespace-nowrap"
          >
            초기화
          </button>
        </div>
      </div>

      {/* 테이블 */}
      <div className="rounded-[14px] border border-border bg-card overflow-hidden">
        <div className="px-4 py-3">
          <span className="text-[15px] font-extrabold text-text-strong">
            전체 <span className="text-primary">{visibleRows.length}</span>건
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-[13px]">
            <thead>
              <tr className="text-left text-[12.5px] text-[#94a3b8] border-y border-border">
                {[
                  ['번호', 'center'],
                  ['소속지점', ''],
                  ['이름', ''],
                  ['직급', 'center'],
                  ['주민번호', ''],
                  ['연락처', ''],
                  ['계약연봉', 'right'],
                  ['소득구분', 'center'],
                  ['은행/기관', ''],
                  ['계좌번호', ''],
                  ['예금주', ''],
                  ['계약일', 'center'],
                  ['계약종료일', 'center'],
                  ['관리', 'center'],
                ].map(([h, a]) => (
                  <th key={h} className={`px-3 py-1.5 font-semibold whitespace-nowrap ${a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((a, i) => (
                <Row
                  key={a.id}
                  a={a}
                  no={visibleRows.length - ((safePage - 1) * perPage + i)}
                  onDetail={() => setDetailId(a.id)}
                  onDelete={() => onDelete(a)}
                />
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-3 py-10 text-center text-[#64748b]">
                    {loading
                      ? '불러오는 중…'
                      : loadErr
                        ? `불러오기 실패: ${loadErr}`
                        : '조건에 맞는 임용계약이 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {visibleRows.length > 0 && (
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

      {registerOpen && (
        <AppointmentRegisterModal
          onClose={() => setRegisterOpen(false)}
          onCreated={() => {
            setRegisterOpen(false)
            setRefresh((n) => n + 1)
          }}
        />
      )}
      {detailId && (
        <AppointmentDetailDrawer
          appointmentId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={() => setRefresh((n) => n + 1)}
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

function SummaryCard({ label, value, tint, fg }: { label: string; value: number; tint: string; fg: string }) {
  return (
    <div className="rounded-[12px] border border-border bg-card p-4 flex items-center gap-3">
      <div className="h-[38px] w-[38px] rounded-[11px] flex items-center justify-center text-lg font-black" style={{ background: tint, color: fg }}>◱</div>
      <div>
        <div className="text-[13px] font-semibold text-[#64748b]">{label}</div>
        <div className="text-[25px] font-extrabold text-text-strong leading-tight">{value}</div>
      </div>
    </div>
  )
}

function Row({
  a,
  no,
  onDetail,
  onDelete,
}: {
  a: Appointment
  no: number
  onDetail: () => void
  onDelete: () => void
}) {
  return (
    <tr className="border-b border-border hover:bg-hover">
      <td className="px-3 py-1.5 text-center whitespace-nowrap tabular text-[#c2cde0]">{no}</td>
      <td className="px-3 py-1.5 whitespace-nowrap">
        {a.ref ? <Badge tone={branchTone(a.ref)}>{a.ref}</Badge> : '-'}
      </td>
      <td className="px-3 py-1.5 font-semibold text-text-strong whitespace-nowrap">{a.name}</td>
      <td className="px-3 py-1.5 text-center whitespace-nowrap">
        {a.position ? <Badge tone={positionTone(a.position)}>{a.position}</Badge> : '-'}
      </td>
      <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#94a3b8]">{a.residentNo}</td>
      <td className="px-3 py-1.5 tabular whitespace-nowrap">{a.phone}</td>
      <td className="px-3 py-1.5 tabular text-right whitespace-nowrap">{comma(a.salary)}</td>
      <td className="px-3 py-1.5 text-center whitespace-nowrap">{a.insuranceType}</td>
      <td className="px-3 py-1.5 whitespace-nowrap">{a.bankName}</td>
      <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#94a3b8]">{a.accountNo}</td>
      <td className="px-3 py-1.5 whitespace-nowrap">{a.accountOwner}</td>
      <td className="px-3 py-1.5 tabular text-center whitespace-nowrap">{dateText(a.contractDate)}</td>
      <td className="px-3 py-1.5 tabular text-center whitespace-nowrap">{dateText(a.endDate)}</td>
      <td className="px-3 py-1.5 text-center whitespace-nowrap">
        <div className="inline-flex gap-1">
          <button onClick={onDetail} title="상세" className="h-8 w-8 rounded-lg border border-border inline-flex items-center justify-center text-[#94a3b8] hover:bg-hover hover:text-white">
            <Eye size={16} />
          </button>
          <button onClick={onDelete} title="삭제 (해지 처리)" className="h-8 w-8 rounded-lg border border-border inline-flex items-center justify-center text-[#94a3b8] hover:bg-hover hover:text-danger">
            <Trash2 size={16} />
          </button>
        </div>
      </td>
    </tr>
  )
}
