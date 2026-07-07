// 교재구매 관리 대장 (관리자 화면) — docs/교재구매관리대장_관리자화면.png 준용
// 교재구입 정보만 취급 — 결제/입금 관련 내용은 매출관리에서 별도 처리한다.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, FolderOpen, FileText, Trash2 } from 'lucide-react'
import { dateText } from '../../lib/format'
import { generateTextbookPdf } from '../../lib/api'
import {
  EMPTY_TEXTBOOK_FILTER,
  type TextbookApplication,
  type TextbookApplicationFilter,
} from '../../types/textbook'
import { deleteApplication, listApplications, summarizeApplications } from './textbookStore'
import DateTextInput from '../../components/ui/DateTextInput'

const inputCls =
  'h-9 w-full rounded-[8px] bg-input border border-border px-2.5 text-[13px] text-input-text outline-none focus:border-primary'

export default function TextbookAdminPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<TextbookApplicationFilter>(EMPTY_TEXTBOOK_FILTER)
  const [rows, setRows] = useState<TextbookApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [detailId, setDetailId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setLoadErr('')
    listApplications(filter)
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

  const sum = summarizeApplications(rows)

  const onDelete = async (a: TextbookApplication) => {
    if (!confirm(`${a.buyerName} 신청 건을 삭제할까요?`)) return
    await deleteApplication(a.id)
    setRefresh((n) => n + 1)
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <h1 className="text-[22px] font-extrabold tracking-[-0.5px] text-text-strong">구매관리</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setRefresh((n) => n + 1)}
            className="h-10 rounded-[10px] border border-border px-4 text-sm font-bold text-[#c2cde0] hover:bg-hover"
          >
            ↻ 새로고침
          </button>
          <button
            onClick={() => navigate('/textbook-apply')}
            className="h-10 rounded-[10px] bg-primary px-4 text-sm font-bold text-white hover:brightness-110"
          >
            ＋ 신청 등록
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-4">
        <SummaryCard label="전체 신청서" value={`${sum.total}건`} tint="#e0edff" fg="#2563eb" />
        <SummaryCard label="오늘 접수된 신청서" value={`${sum.todayCount}건`} tint="#e2f7ec" fg="#16a34a" />
        <SummaryCard label="수기신청서 사진 첨부" value={`${sum.withPhoto}건`} tint="#fff1e0" fg="#f59e0b" />
        <SummaryCard label="양식 PDF 생성" value={`${sum.withPdf}건`} tint="#f3e8ff" fg="#7c3aed" />
      </div>

      <div className="rounded-[14px] border border-border bg-card p-4 mb-4">
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
          <Field label="기간 시작">
            <DateTextInput value={filter.startDate} onChange={(v) => setFilter({ ...filter, startDate: v })} className={inputCls} />
          </Field>
          <Field label="기간 종료">
            <DateTextInput value={filter.endDate} onChange={(v) => setFilter({ ...filter, endDate: v })} className={inputCls} />
          </Field>
          <Field label="구매자명">
            <input value={filter.buyer} onChange={(e) => setFilter({ ...filter, buyer: e.target.value })} placeholder="구매자명 검색" className={inputCls} />
          </Field>
          <button
            onClick={() => setFilter(EMPTY_TEXTBOOK_FILTER)}
            className="h-9 rounded-[8px] border border-border px-4 text-sm font-semibold text-[#c2cde0] hover:bg-hover whitespace-nowrap"
          >
            초기화
          </button>
        </div>
      </div>

      <div className="rounded-[14px] border border-border bg-card overflow-hidden">
        <div className="px-4 py-3">
          <span className="text-[15px] font-extrabold text-text-strong">
            전체 <span className="text-primary">{rows.length}</span>건
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-[13px]">
            <thead>
              <tr className="text-left text-[12.5px] text-[#94a3b8] border-y border-border">
                {['접수번호', '구매자명', '연락처', '배송지 주소', '자녀명', '신청교재 1/2', '접수일자', '관리'].map((h) => (
                  <th key={h} className={`px-3 py-1.5 font-semibold whitespace-nowrap ${h === '관리' ? 'text-center' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <Row key={a.id} a={a} onDetail={() => setDetailId(a.id)} onDelete={() => onDelete(a)} />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-[#64748b]">
                    {loading ? '불러오는 중…' : loadErr ? `불러오기 실패: ${loadErr}` : '조건에 맞는 신청서가 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detailId && (
        <TextbookDetailDrawer
          id={detailId}
          onClose={() => setDetailId(null)}
          onChanged={() => setRefresh((n) => n + 1)}
        />
      )}
    </div>
  )
}

function Row({
  a,
  onDetail,
  onDelete,
}: {
  a: TextbookApplication
  onDetail: () => void
  onDelete: () => void
}) {
  return (
    <tr className="border-b border-border hover:bg-hover">
      <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#c2cde0]">#{a.id.replace(/^T/, '')}</td>
      <td className="px-3 py-1.5 font-semibold text-text-strong whitespace-nowrap">{a.buyerName}</td>
      <td className="px-3 py-1.5 tabular whitespace-nowrap">{a.phone || '-'}</td>
      <td className="px-3 py-1.5 whitespace-nowrap max-w-[220px] truncate" title={a.address}>{a.address || '-'}</td>
      <td className="px-3 py-1.5 whitespace-nowrap">{a.childName || '-'}</td>
      <td className="px-3 py-1.5 whitespace-nowrap">{[a.book1Name, a.book2Name].filter(Boolean).join(' / ') || '-'}</td>
      <td className="px-3 py-1.5 tabular text-center whitespace-nowrap">{dateText(a.applyDate)}</td>
      <td className="px-3 py-1.5">
        <div className="flex items-center justify-center gap-1.5">
          <button onClick={onDetail} title="상세" className="h-8 w-8 rounded-lg border border-border inline-flex items-center justify-center text-[#94a3b8] hover:bg-hover hover:text-white">
            <Eye size={16} />
          </button>
          <button onClick={onDelete} title="삭제" className="h-8 w-8 rounded-lg border border-border inline-flex items-center justify-center text-[#94a3b8] hover:bg-hover hover:text-danger">
            <Trash2 size={16} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function SummaryCard({ label, value, tint, fg }: { label: string; value: string; tint: string; fg: string }) {
  return (
    <div className="rounded-[12px] border border-border bg-card p-4 flex items-center gap-3">
      <div className="h-[38px] w-[38px] rounded-[11px] flex items-center justify-center text-lg font-black" style={{ background: tint, color: fg }}>📚</div>
      <div>
        <div className="text-[13px] font-semibold text-[#64748b]">{label}</div>
        <div className="text-[21px] font-extrabold text-text-strong leading-tight">{value}</div>
      </div>
    </div>
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

/** 상세서랍 — 수기신청서 사진 연결, 없으면 양식 PDF 생성/보기 */
function TextbookDetailDrawer({
  id,
  onClose,
  onChanged,
}: {
  id: string
  onClose: () => void
  onChanged: () => void
}) {
  const [a, setA] = useState<TextbookApplication | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = () => {
    listApplications(EMPTY_TEXTBOOK_FILTER).then((list) => {
      const found = list.find((x) => x.id === id)
      if (found) setA(found)
    })
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!a) return null

  const onGeneratePdf = async () => {
    setPdfBusy(true)
    setErr('')
    try {
      await generateTextbookPdf(a.id)
      load()
      onChanged()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setPdfBusy(false)
    }
  }

  const info: [string, string][] = [
    ['접수번호', `#${a.id.replace(/^T/, '')}`],
    ['신청일자', dateText(a.applyDate)],
    ['구매자 성명', a.buyerName],
    ['자녀 성명', a.childName],
    ['자녀생년월일', a.childBirthdate],
    ['전화번호', a.phone],
    ['배송지', a.address],
    ['배송메모', a.deliveryMemo],
    ['교재구입 1', a.book1Name],
    ['교재구입 2', a.book2Name],
    ['구독회원 구분', a.subscriptionType],
    ['관리회원 구분', a.managementType],
    ['담당자', a.sellerName],
  ]

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div className="h-full w-full max-w-[560px] bg-card border-l border-border overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <h2 className="text-[17px] font-extrabold text-text-strong">{a.buyerName} 신청 상세</h2>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-white">✕</button>
        </div>
        <div className="px-6 py-5 space-y-6">
          <section>
            <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">신청 정보</h3>
            <div className="rounded-[10px] border border-border p-3 grid grid-cols-2 gap-x-6 gap-y-2">
              {info.map(([k, v]) => (
                <div key={k} className="flex justify-between text-[12.5px]">
                  <span className="text-[#64748b]">{k}</span>
                  <span className="text-[#e2e8f0] tabular">{v || '-'}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">첨부 원본 (Google Drive)</h3>
            {a.drivePhotoFileId ? (
              <a
                href={a.drivePhotoViewUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-[8px] border border-border px-3 py-2.5 text-[12.5px] hover:bg-hover"
              >
                <span className="flex items-center gap-2 text-[#c2cde0]">
                  <FolderOpen size={16} /> 수기 신청서 원본 사진
                </span>
                <span className="text-primary font-bold">Drive 열기 →</span>
              </a>
            ) : (
              <div className="space-y-2">
                <div className="rounded-[8px] border border-dashed border-border px-3 py-4 text-center text-[12px] text-[#64748b]">
                  연결된 수기 신청서가 없습니다.
                </div>
                {a.drivePdfFileId ? (
                  <a
                    href={a.drivePdfViewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-[8px] border border-border px-3 py-2.5 text-[12.5px] hover:bg-hover"
                  >
                    <span className="flex items-center gap-2 text-[#c2cde0]">
                      <FileText size={16} /> 양식 기반 생성 PDF
                    </span>
                    <span className="text-primary font-bold">PDF 열기 →</span>
                  </a>
                ) : (
                  <button
                    onClick={onGeneratePdf}
                    disabled={pdfBusy}
                    className="h-10 w-full rounded-[8px] bg-primary text-[13px] font-bold text-white hover:brightness-110 disabled:opacity-60"
                  >
                    {pdfBusy ? 'PDF 생성 중…' : '📄 입력정보로 양식 PDF 생성'}
                  </button>
                )}
                {err && <div className="text-[11.5px] text-danger">{err}</div>}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
