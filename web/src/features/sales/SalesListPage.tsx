import { useMemo, useState } from 'react'
import { Eye, Trash2 } from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Badge, { categoryTone } from '../../components/ui/Badge'
import { comma, dateText, won } from '../../lib/format'
import { BUSINESS_UNITS } from '../../data/mockSales'
import {
  EMPTY_SALES_FILTER,
  type Sale,
  type SalesFilter,
} from '../../types/sales'
import { deleteSale, listSales, summarizeSales } from './salesStore'
import {
  addSalesCategory,
  removeSalesCategory,
  useSalesCategories,
} from './salesCategoryStore'
import SalesRegisterModal from './SalesRegisterModal'
import SalesDetailDrawer from './SalesDetailDrawer'
import DailyReportModal from './DailyReportModal'
import { getReportEmails, parseEmails, setReportEmails } from './reportStore'

type Tab = 'card' | 'textbook'
const TODAY = '2026-07-04' // 시스템 기준일

export default function SalesListPage() {
  const categories = useSalesCategories()
  const [tab, setTab] = useState<Tab>('card')
  const [draft, setDraft] = useState<SalesFilter>(EMPTY_SALES_FILTER)
  const [applied, setApplied] = useState<SalesFilter>(EMPTY_SALES_FILTER)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [refresh, setRefresh] = useState(0)

  // 일일보고 수신 이메일 (편집 드래프트, 저장 시 영속화)
  const [emailDraft, setEmailDraft] = useState(getReportEmails())
  // 분류 추가 입력
  const [newCat, setNewCat] = useState('')
  const [newMax, setNewMax] = useState(10)

  const saveEmails = () => {
    const valid = parseEmails(emailDraft)
    if (valid.length === 0) {
      alert('유효한 이메일 주소를 1개 이상 입력하세요.')
      return
    }
    setReportEmails(emailDraft)
    alert(`일일보고 수신 이메일 ${valid.length}건이 저장되었습니다.`)
  }

  const rows = useMemo(() => listSales(applied), [applied, refresh])
  const sum = useMemo(
    () => summarizeSales(listSales(EMPTY_SALES_FILTER)),
    [refresh],
  )

  const onDelete = (s: Sale) => {
    if (s.source === 'contract') {
      alert('계약 보증금 연동 항목입니다. 계약관리에서 관리하세요.')
      return
    }
    if (!confirm('이 매출을 삭제할까요?')) return
    deleteSale(s.id)
    setRefresh((n) => n + 1)
  }

  return (
    <AppLayout title="카드결제 등록 관리">
      {/* 상단 탭 */}
      <div className="flex items-center gap-2 mb-4">
        <TabBtn active={tab === 'card'} onClick={() => setTab('card')}>
          💳 카드결제 관리
        </TabBtn>
        <TabBtn active={tab === 'textbook'} onClick={() => setTab('textbook')}>
          📚 교재구매 신청 관리
        </TabBtn>
      </div>

      {tab === 'textbook' ? (
        <div className="rounded-[14px] border border-border bg-card p-10 text-center text-[#94a3b8]">
          교재구매 신청 관리 화면은 준비 중입니다.
        </div>
      ) : (
        <>
          {/* 헤더 */}
          <div className="flex items-start justify-between mb-4">
            <h1 className="text-[22px] font-extrabold tracking-[-0.5px] text-text-strong">
              카드결제 등록 관리
            </h1>
            <div className="flex gap-2">
              <button
                onClick={() => setRefresh((n) => n + 1)}
                className="h-10 rounded-[10px] border border-border px-4 text-sm font-bold text-[#c2cde0] hover:bg-hover"
              >
                ↻ 새로고침
              </button>
              <button className="h-10 rounded-[10px] bg-success px-4 text-sm font-bold text-white hover:brightness-110">
                ⭳ 엑셀 다운로드
              </button>
              <button
                onClick={() => setRegisterOpen(true)}
                className="h-10 rounded-[10px] bg-primary px-4 text-sm font-bold text-white hover:brightness-110"
              >
                ＋ 매출 등록
              </button>
            </div>
          </div>

          {/* 일일보고 수신 이메일 (매일 22:00 매출 양식 자동 발송 대상) */}
          <div className="rounded-[14px] border border-border bg-card p-3 mb-4 flex items-center gap-3">
            <span className="text-[12px] font-bold text-[#94a3b8] whitespace-nowrap">
              ✉ 일일보고 수신 이메일
            </span>
            <input
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              placeholder="쉼표로 구분 (예: a@x.com, b@y.com)"
              className="h-9 flex-1 rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary"
            />
            <button
              onClick={() => setReportOpen(true)}
              className="h-9 rounded-[8px] border border-border px-4 text-[13px] font-bold text-[#c2cde0] hover:bg-hover"
            >
              일일보고 미리보기
            </button>
            <button
              onClick={saveEmails}
              className="h-9 rounded-[8px] bg-indigo px-4 text-[13px] font-bold text-white hover:brightness-110"
            >
              💾 저장
            </button>
          </div>

          {/* 카드결제 분류 관리 */}
          <div className="rounded-[14px] border border-border bg-card p-4 mb-4">
            <div className="mb-2.5 text-[13px] font-bold text-text-strong">
              🏷 카드결제 분류 관리{' '}
              <span className="text-[11.5px] font-semibold text-[#64748b]">
                — 어드민이 등록한 분류가 매출등록 페이지의 드롭다운에 노출됩니다
              </span>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {categories.map((c) => (
                <span
                  key={c.name}
                  className="inline-flex items-center gap-1.5 rounded-[8px] border border-border bg-input px-2.5 py-1.5 text-[12.5px]"
                >
                  <b className="text-[#e2e8f0]">{c.name}</b>
                  <span className="text-[#64748b]">(max {c.max})</span>
                  <button
                    onClick={() => removeSalesCategory(c.name)}
                    className="text-danger"
                    title="삭제"
                  >
                    🗑
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                placeholder="새 분류 이름 (예: LAS On 파트장)"
                className="h-9 flex-1 rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary"
              />
              <label className="flex items-center gap-1.5 text-[12px] text-[#94a3b8]">
                최대 매수
                <input
                  type="number"
                  min={1}
                  value={newMax}
                  onChange={(e) => setNewMax(Number(e.target.value) || 1)}
                  className="h-9 w-16 rounded-[8px] bg-input border border-border px-2 text-[13px] text-input-text outline-none focus:border-primary"
                />
              </label>
              <button
                onClick={() => {
                  if (addSalesCategory(newCat, newMax)) setNewCat('')
                }}
                className="h-9 rounded-[8px] bg-primary px-4 text-[13px] font-bold text-white hover:brightness-110"
              >
                ＋ 추가
              </button>
            </div>
          </div>

          {/* 요약 카드 */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <SummaryCard label="전체 건수" value={`${sum.total}건`} tint="#e0edff" fg="#2563eb" />
            <SummaryCard label="카드매출" value={won(sum.cardTotal)} tint="#e0edff" fg="#2563eb" />
            <SummaryCard label="현금매출" value={won(sum.cashTotal)} tint="#e2f7ec" fg="#16a34a" />
            <SummaryCard label="분할 / 미검증" value={`${sum.splitCount} / ${sum.unverified}`} tint="#fff1e0" fg="#f59e0b" />
          </div>

          {/* 필터 바 — 기간시작 ~ 입력자 성명 + 검색/초기화 모두 1줄 */}
          <div className="rounded-[14px] border border-border bg-card p-4 mb-4 overflow-x-auto">
            <div className="grid grid-cols-[repeat(7,minmax(120px,1fr))_auto] gap-2 items-end min-w-[1100px]">
              <Field label="기간 시작">
                <input type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} className={inputCls} />
              </Field>
              <Field label="기간 종료">
                <input type="date" value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} className={inputCls} />
              </Field>
              <Field label="종류">
                <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className={inputCls}>
                  <option value="전체">전체</option>
                  {categories.map((c) => (
                    <option key={c.name}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="사업부">
                <input value={draft.businessUnit} onChange={(e) => setDraft({ ...draft, businessUnit: e.target.value })} placeholder="포함" className={inputCls} list="bu-list" />
                <datalist id="bu-list">
                  {BUSINESS_UNITS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </Field>
              <Field label="구매자">
                <input value={draft.buyer} onChange={(e) => setDraft({ ...draft, buyer: e.target.value })} placeholder="포함" className={inputCls} />
              </Field>
              <Field label="입력자 소속">
                <input value={draft.inputterOrg} onChange={(e) => setDraft({ ...draft, inputterOrg: e.target.value })} placeholder="포함" className={inputCls} />
              </Field>
              <Field label="입력자 성명">
                <input value={draft.inputterName} onChange={(e) => setDraft({ ...draft, inputterName: e.target.value })} placeholder="포함" className={inputCls} />
              </Field>
              <div className="flex items-end gap-2">
                <button onClick={() => setApplied(draft)} className="h-[38px] rounded-[8px] bg-indigo px-4 text-sm font-bold text-white hover:brightness-110 whitespace-nowrap">
                  🔍 검색
                </button>
                <button
                  onClick={() => {
                    setDraft(EMPTY_SALES_FILTER)
                    setApplied(EMPTY_SALES_FILTER)
                  }}
                  className="h-[38px] rounded-[8px] border border-border px-4 text-sm font-semibold text-[#c2cde0] hover:bg-hover whitespace-nowrap"
                >
                  초기화
                </button>
              </div>
            </div>
          </div>

          {/* 테이블 */}
          <div className="rounded-[14px] border border-border bg-card overflow-hidden">
            <div className="px-4 py-3">
              <span className="text-[15px] font-extrabold text-text-strong">
                총 <span className="text-primary">{rows.length}</span>건
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] text-[13px]">
                <thead>
                  <tr className="text-left text-[12.5px] text-[#94a3b8] border-y border-border">
                    {['번호', '날짜', 'CAT ID', '사업부', '구매자', '내용', '금액', '카드사', '카드번호', '승인번호', '담당', '관리'].map(
                      (h) => (
                        <th
                          key={h}
                          className={`px-3 py-1.5 font-semibold whitespace-nowrap ${
                            h === '금액' ? 'text-right' : h === '관리' ? 'text-center' : ''
                          }`}
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s, i) => (
                    <Row
                      key={s.id}
                      s={s}
                      no={rows.length - i}
                      onDetail={() => setDetailId(s.id)}
                      onDelete={() => onDelete(s)}
                    />
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={12} className="px-3 py-10 text-center text-[#64748b]">
                        조건에 맞는 매출이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {registerOpen && (
        <SalesRegisterModal
          onClose={() => setRegisterOpen(false)}
          onCreated={() => {
            setRegisterOpen(false)
            setRefresh((n) => n + 1)
          }}
        />
      )}
      {detailId && (
        <SalesDetailDrawer saleId={detailId} onClose={() => setDetailId(null)} />
      )}
      {reportOpen && (
        <DailyReportModal defaultDate={TODAY} onClose={() => setReportOpen(false)} />
      )}
    </AppLayout>
  )
}

const inputCls =
  'h-[38px] w-full rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary'

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'h-9 rounded-[9px] px-3.5 text-[13px] font-bold border transition-colors',
        active
          ? 'bg-indigo text-white border-indigo'
          : 'border-border text-[#94a3b8] hover:bg-hover',
      ].join(' ')}
    >
      {children}
    </button>
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

function SummaryCard({ label, value, tint, fg }: { label: string; value: string; tint: string; fg: string }) {
  return (
    <div className="rounded-[12px] border border-border bg-card p-4 flex items-center gap-3">
      <div className="h-[38px] w-[38px] rounded-[11px] flex items-center justify-center text-lg font-black" style={{ background: tint, color: fg }}>
        ₩
      </div>
      <div>
        <div className="text-[13px] font-semibold text-[#64748b]">{label}</div>
        <div className="text-[18px] font-extrabold text-text-strong leading-tight tabular">{value}</div>
      </div>
    </div>
  )
}

function Row({
  s,
  no,
  onDetail,
  onDelete,
}: {
  s: Sale
  no: number
  onDetail: () => void
  onDelete: () => void
}) {
  const card = s.payment.cardInstallments[0]
  const cash = s.payment.cashInstallments[0]
  const splitN = Math.max(
    s.payment.cardInstallments.length,
    s.payment.cashInstallments.length,
  )
  const hasSplit = splitN > 1
  const catId = card?.terminalNo || '-'
  const issuer = card?.issuer || (cash ? '현금' : '-')
  const cardNo = card?.cardNumber || cash?.identifierNo || '-'
  const approval = card?.approvalNo || cash?.approvalNo || '-'

  return (
    <tr className="border-b border-border hover:bg-hover">
      <td className="px-3 py-1.5 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <span className="tabular text-[#c2cde0]">{no}</span>
          {hasSplit && (
            <span
              className="inline-flex items-center rounded-md bg-[#fff1e0] px-1.5 py-0.5 text-[10.5px] font-bold text-[#b45309]"
              title={`${splitN}회 분할결제`}
            >
              📋{splitN}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-1.5 tabular whitespace-nowrap">{dateText(s.date)}</td>
      <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#94a3b8]">{catId}</td>
      <td className="px-3 py-1.5 whitespace-nowrap">{s.businessUnit}</td>
      <td className="px-3 py-1.5 font-semibold text-text-strong whitespace-nowrap">
        <span className="flex items-center gap-1.5">
          {s.buyer}
          {s.source === 'contract' && (
            <Badge tone="slate" className="!text-[10px] !px-1.5">
              계약
            </Badge>
          )}
        </span>
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap">
        <Badge tone={categoryTone(s.category)}>{s.category}</Badge>
      </td>
      <td className="px-3 py-1.5 tabular text-right font-bold text-warning whitespace-nowrap">
        {comma(s.payment.totalAmount)}
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap">{issuer}</td>
      <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#94a3b8]">{cardNo}</td>
      <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#94a3b8]">{approval}</td>
      <td className="px-3 py-1.5 whitespace-nowrap">{s.manager}</td>
      <td className="px-3 py-1.5 whitespace-nowrap text-center">
        <div className="flex items-center justify-center gap-1.5">
          <button
            onClick={onDetail}
            title="상세"
            className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-[#94a3b8] hover:bg-hover hover:text-white transition-colors"
          >
            <Eye size={16} />
          </button>
          <button
            onClick={onDelete}
            title="삭제"
            className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-danger hover:bg-hover hover:brightness-125 transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </td>
    </tr>
  )
}
