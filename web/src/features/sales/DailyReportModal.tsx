import { useEffect, useState } from 'react'
import { comma, won } from '../../lib/format'
import { EMPTY_SALES_FILTER, type Sale } from '../../types/sales'
import { listSales } from './salesStore'
import { parseEmails, useReportEmails } from './reportStore'
import { dailyReportAttachment, downloadDailyReport } from './dailyReportExcel'
import { sendDailyReport } from '../../lib/api'
import DateTextInput from '../../components/ui/DateTextInput'
import { Download, X } from 'lucide-react'

/**
 * 일일보고 미리보기 — 선택일의 매출내용을 메일 양식으로 렌더링.
 * (실제 매일 22:00 자동 발송은 백엔드 스케줄러 + 메일러 연동 필요)
 */
export default function DailyReportModal({
  onClose,
  defaultDate,
}: {
  onClose: () => void
  defaultDate: string
}) {
  const emails = useReportEmails()
  const [date, setDate] = useState(defaultDate)
  const [busy, setBusy] = useState<'' | 'excel' | 'send'>('')

  const onDownload = async () => {
    setBusy('excel')
    try {
      const n = await downloadDailyReport(date)
      if (n === 0) alert('해당 일자 매출이 없어 빈 양식이 저장됩니다.')
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  const onSend = async () => {
    const recipientsList = parseEmails(emails)
    if (recipientsList.length === 0) return alert('수신 이메일을 먼저 저장하세요.')
    setBusy('send')
    try {
      const att = await dailyReportAttachment(date)
      const r = await sendDailyReport({
        date,
        emails: recipientsList,
        filename: att.filename,
        xlsxBase64: att.base64,
      })
      if (r.ok) alert(`일일보고(${att.count}건)를 ${recipientsList.length}명에게 발송했습니다.`)
      else alert(`발송 실패: ${r.error ?? '백엔드 메일 설정(SMTP)을 확인하세요.'}`)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  const [rows, setRows] = useState<Sale[]>([])
  useEffect(() => {
    let alive = true
    listSales(EMPTY_SALES_FILTER).then((list) => {
      if (alive) setRows(list.filter((s) => s.date === date))
    })
    return () => {
      alive = false
    }
  }, [date])
  const total = rows.reduce((a, s) => a + s.payment.totalAmount, 0)
  const cardTotal = rows
    .filter((s) => s.payment.method === '카드' || s.payment.method === '혼합')
    .reduce((a, s) => a + s.payment.cardInstallments.reduce((x, c) => x + c.amount, 0), 0)
  const cashTotal = rows
    .filter((s) => s.payment.method === '현금' || s.payment.method === '혼합')
    .reduce((a, s) => a + s.payment.cashInstallments.reduce((x, c) => x + c.amount, 0), 0)

  const recipients = parseEmails(emails)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-6 overflow-y-auto">
      <div className="w-full max-w-[820px] rounded-[14px] border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-[17px] font-extrabold text-text-strong">
            일일보고 미리보기 <span className="text-[12px] font-semibold text-[#64748b]">(매일 22:00 자동 발송 양식)</span>
          </h2>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-white"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[74vh] overflow-y-auto">
          <div className="flex items-center gap-3">
            <label className="text-[12px] font-bold text-[#94a3b8]">보고일자</label>
            <DateTextInput value={date} onChange={setDate}
              className="h-9 rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary" />
            <span className="ml-auto text-[12px] text-[#94a3b8]">
              수신: <b className="text-[#c2cde0]">{recipients.length}</b>명
            </span>
          </div>

          {/* 메일 양식 */}
          <div className="rounded-[10px] border border-border bg-input/30 p-4">
            <div className="text-[15px] font-extrabold text-text-strong mb-1">
              [일일 매출 보고] {date}
            </div>
            <div className="text-[12px] text-[#94a3b8] mb-3">
              수신: {recipients.join(', ') || '(수신자 없음)'}
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              <Kpi label="총 매출" value={won(total)} />
              <Kpi label="카드" value={won(cardTotal)} />
              <Kpi label="현금" value={won(cashTotal)} />
            </div>

            <div className="overflow-x-auto rounded-[8px] border border-border">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-[11.5px] text-[#94a3b8] border-b border-border bg-input/40">
                    {['구매자', '내용', '금액', '카드사', '담당'].map((h) => (
                      <th key={h} className={`px-3 py-2 font-semibold ${h === '금액' ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} className="border-b border-border">
                      <td className="px-3 py-1.5 text-[#e2e8f0]">{s.buyer}</td>
                      <td className="px-3 py-1.5 text-[#c2cde0]">{s.category}</td>
                      <td className="px-3 py-1.5 text-right tabular font-bold text-warning">{comma(s.payment.totalAmount)}</td>
                      <td className="px-3 py-1.5 text-[#94a3b8]">{s.payment.cardInstallments[0]?.issuer || (s.payment.cashInstallments.length ? '현금' : '-')}</td>
                      <td className="px-3 py-1.5 text-[#94a3b8]">{s.manager}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-[#64748b]">해당 일자 매출 없음</td></tr>
                  )}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-border font-bold">
                      <td className="px-3 py-2 text-[#e2e8f0]" colSpan={2}>합계 ({rows.length}건)</td>
                      <td className="px-3 py-2 text-right tabular text-text-strong">{comma(total)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div className="rounded-[8px] border border-dashed border-border px-3 py-2.5 text-[11.5px] text-[#64748b]">
            ⓘ 위 양식이 매일 <b className="text-[#94a3b8]">오후 10시(22:00)</b> 수신 이메일로 자동 발송됩니다.
            실제 발송 스케줄·메일러는 백엔드 연동이 필요합니다.
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="h-10 rounded-[10px] border border-border px-4 text-sm font-semibold text-[#c2cde0] hover:bg-hover">닫기</button>
          <button
            onClick={onDownload}
            disabled={busy !== ''}
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-success px-4 text-sm font-bold text-white hover:brightness-110 disabled:opacity-60"
          >
            {busy === 'excel' ? '생성 중…' : (<><Download size={15} /> 엑셀 양식 다운로드</>)}
          </button>
          <button
            onClick={onSend}
            disabled={busy !== ''}
            className="h-10 rounded-[10px] bg-primary px-5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-60"
          >
            {busy === 'send' ? '발송 중…' : '✉ 이메일 발송'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-border bg-card px-3 py-2">
      <div className="text-[11px] text-[#64748b]">{label}</div>
      <div className="text-[15px] font-extrabold text-text-strong tabular">{value}</div>
    </div>
  )
}
