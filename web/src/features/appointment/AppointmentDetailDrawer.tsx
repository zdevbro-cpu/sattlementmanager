import { useEffect, useState } from 'react'
import Badge from '../../components/ui/Badge'
import { dateText, todayIso, won } from '../../lib/format'
import { appointmentStatusTone, type Appointment } from '../../types/appointment'
import { getAppointment } from './appointmentStore'
import AppointmentEditForm from './AppointmentEditForm'
import DocUploadList from './DocUploadList'

export default function AppointmentDetailDrawer({
  appointmentId,
  onClose,
  onChanged,
}: {
  appointmentId: string
  onClose: () => void
  onChanged?: () => void
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [tick, setTick] = useState(0)
  const [a, setA] = useState<Appointment | null>(null)

  useEffect(() => {
    let alive = true
    getAppointment(appointmentId).then((res) => {
      if (alive) setA(res)
    })
    return () => {
      alive = false
    }
  }, [appointmentId, tick])

  if (!a) return null

  const info: [string, string][] = [
    ['계약번호', a.contractNo],
    ['계약종류', a.typeName],
    ['지점명', a.ref],
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditOpen((v) => !v)}
              className="h-9 rounded-[8px] bg-indigo px-3 text-[13px] font-bold text-white hover:brightness-110"
            >
              {editOpen ? '수정 취소' : '✎ 수정'}
            </button>
            <button onClick={onClose} className="text-[#94a3b8] hover:text-white">✕</button>
          </div>
        </div>
        <div className="px-6 py-5 space-y-6">
          {/* 수정 폼 */}
          {editOpen && (
            <section>
              <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">임용계약 수정</h3>
              <AppointmentEditForm
                base={a}
                onCancel={() => setEditOpen(false)}
                onSaved={() => {
                  setEditOpen(false)
                  setTick((n) => n + 1)
                  onChanged?.()
                }}
              />
            </section>
          )}

          {/* 임용계약 정보 */}
          <section>
            <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">임용계약 정보</h3>
            <div className="rounded-[10px] border border-border p-3 grid grid-cols-2 gap-x-6 gap-y-2">
              {info.map(([k, v]) => (
                <div key={k} className="flex justify-between text-[12.5px]">
                  <span className="text-[#64748b]">{k}</span>
                  <span className="text-[#e2e8f0] tabular">{v || '-'}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 제출서류 */}
          <section>
            <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">
              제출서류{' '}
              <span className="text-[#64748b] font-semibold">
                ({a.documents?.length ?? 0})
              </span>
            </h3>
            <DocUploadList
              refId={a.contractNo}
              value={a.documents ?? []}
              onChange={() => {
                // 업로드 자체는 uploadAppointmentDoc()가 즉시 DB에 기록하므로, 여기서는 재조회만 한다.
                setTick((n) => n + 1)
                onChanged?.()
              }}
              uploadedAt={todayIso()}
            />
          </section>

          {/* 변경 이력 */}
          <section>
            <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">
              변경 이력{' '}
              <span className="text-[#64748b] font-semibold">
                ({a.history?.length ?? 0})
              </span>
            </h3>
            {a.history && a.history.length > 0 ? (
              <div className="space-y-2">
                {a.history.map((h) => (
                  <div key={h.historyId} className="rounded-[10px] border border-border p-3">
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <span className="text-[13px] tabular font-bold text-[#c2cde0]">
                        {dateText(h.editedAt)}
                      </span>
                      {h.memo && (
                        <span className="text-[12px] text-[#64748b]">· {h.memo}</span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {h.changes.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 text-[12px]">
                          <span className="text-[#94a3b8] min-w-[72px]">{c.label}</span>
                          <span className="text-[#64748b] line-through tabular">{c.before || '-'}</span>
                          <span className="text-[#64748b]">→</span>
                          <span className="text-[#e2e8f0] font-semibold tabular">{c.after || '-'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[8px] border border-dashed border-border px-3 py-4 text-center text-[12px] text-[#64748b]">
                변경 이력이 없습니다.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
