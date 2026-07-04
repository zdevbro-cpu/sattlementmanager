import { useMemo, useState } from 'react'
import { Eye } from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Badge from '../../components/ui/Badge'
import { comma, dateText } from '../../lib/format'
import {
  EMPTY_APPOINTMENT_FILTER,
  appointmentStatusTone,
  type Appointment,
  type AppointmentFilter,
} from '../../types/appointment'
import {
  listAppointments,
  summarizeAppointments,
} from './appointmentStore'
import AppointmentRegisterModal from './AppointmentRegisterModal'
import AppointmentDetailDrawer from './AppointmentDetailDrawer'

export default function AppointmentListPage() {
  const [draft, setDraft] = useState<AppointmentFilter>(EMPTY_APPOINTMENT_FILTER)
  const [applied, setApplied] = useState<AppointmentFilter>(
    EMPTY_APPOINTMENT_FILTER,
  )
  const [registerOpen, setRegisterOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)

  const rows = useMemo(() => listAppointments(applied), [applied, refresh])
  const sum = useMemo(
    () => summarizeAppointments(listAppointments(EMPTY_APPOINTMENT_FILTER)),
    [refresh],
  )

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
          className="h-10 rounded-[10px] bg-primary px-4 text-sm font-bold text-white hover:brightness-110"
        >
          ＋ 신규 계약 등록
        </button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <SummaryCard label="전체 임용계약" value={sum.total} tint="#e0edff" fg="#2563eb" />
        <SummaryCard label="정상운영" value={sum.active} tint="#e2f7ec" fg="#16a34a" />
        <SummaryCard label="일시정지" value={sum.paused} tint="#fff1e0" fg="#f59e0b" />
        <SummaryCard label="해지·만료" value={sum.ended} tint="#fee2e2" fg="#ef4444" />
      </div>

      {/* 필터 */}
      <div className="rounded-[14px] border border-border bg-card p-4 mb-4">
        <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-3 items-end">
          <Field label="검색 (계약자명·추천인)">
            <input value={draft.keyword} onChange={(e) => setDraft({ ...draft, keyword: e.target.value })} placeholder="계약자명, 추천인 검색" className={inputCls} />
          </Field>
          <Field label="계약일 시작">
            <input type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} className={inputCls} />
          </Field>
          <Field label="계약일 종료">
            <input type="date" value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} className={inputCls} />
          </Field>
          <div className="flex gap-2">
            <button onClick={() => setApplied(draft)} className="h-[38px] rounded-[8px] bg-indigo px-5 text-sm font-bold text-white hover:brightness-110">검색</button>
            <button onClick={() => { setDraft(EMPTY_APPOINTMENT_FILTER); setApplied(EMPTY_APPOINTMENT_FILTER) }} className="h-[38px] rounded-[8px] border border-border px-5 text-sm font-semibold text-[#c2cde0] hover:bg-hover">초기화</button>
          </div>
        </div>
      </div>

      {/* 테이블 */}
      <div className="rounded-[14px] border border-border bg-card overflow-hidden">
        <div className="px-4 py-3">
          <span className="text-[15px] font-extrabold text-text-strong">
            전체 <span className="text-primary">{rows.length}</span>건
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-[13px]">
            <thead>
              <tr className="text-left text-[12.5px] text-[#94a3b8] border-y border-border">
                {[
                  ['계약자명', ''],
                  ['계약종류', ''],
                  ['추천인', ''],
                  ['계약일자', 'center'],
                  ['급여일', 'center'],
                  ['계약종료일', 'center'],
                  ['급여', 'right'],
                  ['활동비', 'right'],
                  ['계약상태', 'center'],
                  ['상세', 'center'],
                ].map(([h, a]) => (
                  <th key={h} className={`px-3 py-1.5 font-semibold whitespace-nowrap ${a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <Row key={a.id} a={a} onDetail={() => setDetailId(a.id)} />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center text-[#64748b]">
                    조건에 맞는 임용계약이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
        <AppointmentDetailDrawer appointmentId={detailId} onClose={() => setDetailId(null)} />
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

function Row({ a, onDetail }: { a: Appointment; onDetail: () => void }) {
  return (
    <tr className="border-b border-border hover:bg-hover">
      <td className="px-3 py-1.5 font-semibold text-text-strong whitespace-nowrap">{a.name}</td>
      <td className="px-3 py-1.5 whitespace-nowrap">{a.typeName}</td>
      <td className="px-3 py-1.5 whitespace-nowrap">{a.ref}</td>
      <td className="px-3 py-1.5 tabular text-center whitespace-nowrap">{dateText(a.contractDate)}</td>
      <td className="px-3 py-1.5 tabular text-center whitespace-nowrap">{dateText(a.payoutDate)}</td>
      <td className="px-3 py-1.5 tabular text-center whitespace-nowrap">{dateText(a.endDate)}</td>
      <td className="px-3 py-1.5 tabular text-right whitespace-nowrap">{comma(a.salary)}</td>
      <td className="px-3 py-1.5 tabular text-right whitespace-nowrap">{comma(a.activity)}</td>
      <td className="px-3 py-1.5 text-center whitespace-nowrap">
        <Badge tone={appointmentStatusTone(a.status)}>{a.status}</Badge>
      </td>
      <td className="px-3 py-1.5 text-center whitespace-nowrap">
        <button onClick={onDetail} title="상세" className="h-8 w-8 rounded-lg border border-border inline-flex items-center justify-center text-[#94a3b8] hover:bg-hover hover:text-white">
          <Eye size={16} />
        </button>
      </td>
    </tr>
  )
}
