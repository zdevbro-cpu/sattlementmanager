import Badge from '../../components/ui/Badge'
import { dateText, won } from '../../lib/format'
import { appointmentStatusTone } from '../../types/appointment'
import { getAppointment } from './appointmentStore'

export default function AppointmentDetailDrawer({
  appointmentId,
  onClose,
}: {
  appointmentId: string
  onClose: () => void
}) {
  const a = getAppointment(appointmentId)
  if (!a) return null

  const info: [string, string][] = [
    ['계약번호', a.contractNo],
    ['계약종류', a.typeName],
    ['추천인/추천점', a.ref],
    ['직급', a.position],
    ['소득구분', a.insuranceType],
    ['주민번호', a.residentNo],
    ['연락처', a.phone],
    ['급여(연봉)', won(a.salary)],
    ['활동비', won(a.activity)],
    ['계약일', dateText(a.contractDate)],
    ['급여일', dateText(a.payoutDate)],
    ['업무개시일', dateText(a.workStartDate)],
    ['신고개시일', dateText(a.reportStartDate)],
    ['계약종료일', dateText(a.endDate)],
    ['은행/기관', a.bankName],
    ['계좌번호', a.accountNo],
    ['예금주', a.accountOwner],
  ]

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div className="h-full w-full max-w-[600px] bg-card border-l border-border overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[17px] font-extrabold text-text-strong">{a.name}</h2>
            <Badge tone={appointmentStatusTone(a.status)}>{a.status}</Badge>
            <span className="text-[12px] text-[#64748b]">{a.contractNo}</span>
          </div>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-white">✕</button>
        </div>
        <div className="px-6 py-5">
          <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">임용계약 정보</h3>
          <div className="rounded-[10px] border border-border p-3 grid grid-cols-2 gap-x-6 gap-y-2">
            {info.map(([k, v]) => (
              <div key={k} className="flex justify-between text-[12.5px]">
                <span className="text-[#64748b]">{k}</span>
                <span className="text-[#e2e8f0] tabular">{v || '-'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
