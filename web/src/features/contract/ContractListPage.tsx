import { useEffect, useRef, useState } from 'react'
import { Download, Eye, FileText, Plus, PlusCircle, Trash2, XCircle } from 'lucide-react'
import type { ComponentType } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import StatusBadge from '../../components/ui/StatusBadge'
import Badge, { methodTone } from '../../components/ui/Badge'
import DateTextInput from '../../components/ui/DateTextInput'
import { comma, dateText, todayIso } from '../../lib/format'
import {
  EMPTY_FILTER,
  type Contract,
  type ContractFilter,
} from '../../types/contract'
import { useCodes } from '../../lib/codeStore'
import { BRANCHES, MANAGERS, RECRUITERS } from '../../data/mockContracts'
import { addHistory, listContracts, summarize } from './contractStore'
import ContractRegisterModal from './ContractRegisterModal'
import ContractDetailDrawer from './ContractDetailDrawer'
import { downloadListAsExcel } from '../../lib/excelExport'

// 목록 컬럼 정의 (결재구분은 유치자 다음, 보증금/수당은 우측 정렬 + 폭 고정)
const COLS: { label: string; align?: 'center' | 'right'; w?: number }[] = [
  { label: '번호', align: 'center', w: 56 },
  { label: '소속', align: 'center' },
  { label: '계약자' },
  { label: '계약구분', align: 'center' },
  { label: '계약일', align: 'center' },
  { label: '보증금', align: 'right', w: 132 }, // 최대 10자리
  { label: '수당', align: 'right', w: 116 }, // 최대 9자리
  { label: '수당지급일' },
  { label: '최초수당지급일' },
  { label: '계약종료일', align: 'center' },
  { label: '지점명', align: 'center' },
  { label: '관리자' },
  { label: '유치자' },
  { label: '결재구분' },
  { label: '상태' },
  { label: '관리', align: 'center' },
]

export default function ContractListPage() {
  const codes = useCodes()
  // 입력 중 필터(draft)와 적용된 필터(applied)를 분리 → [검색] 눌러야 반영
  const [draft, setDraft] = useState<ContractFilter>(EMPTY_FILTER)
  const [applied, setApplied] = useState<ContractFilter>(EMPTY_FILTER)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const contractEndDateRef = useRef<HTMLInputElement>(null)

  const [rows, setRows] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [sum, setSum] = useState(() => summarize([]))

  useEffect(() => {
    let alive = true
    setLoading(true)
    setLoadErr('')
    listContracts(applied)
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
    // refresh 로 재조회 강제
  }, [applied, refresh])

  useEffect(() => {
    let alive = true
    listContracts(EMPTY_FILTER).then((list) => {
      if (alive) setSum(summarize(list))
    })
    return () => {
      alive = false
    }
  }, [refresh])

  const onDelete = async (c: Contract) => {
    if (c.current.status === '폐기') {
      alert('이미 폐기 처리된 계약입니다.')
      return
    }
    if (!confirm(`${c.current.contractorName} 계약을 폐기 처리할까요? (삭제 대신 상태가 "폐기"로 전환되며 이력은 보존됩니다)`))
      return
    await addHistory(c.id, {
      ...c.current,
      historyId: '',
      status: '폐기',
      eventDate: todayIso(),
      memo: '목록에서 폐기 처리',
      createdAt: todayIso(),
    })
    setRefresh((n) => n + 1)
  }

  const onExcelDownload = () => {
    const headers = COLS.filter((c) => c.label !== '관리').map((c) => c.label)
    const data = rows.map((c, i) => {
      const s = c.current
      return [
        rows.length - i,
        s.org,
        s.contractorName,
        s.contractType,
        dateText(s.contractDate),
        s.deposit,
        s.allowance,
        s.allowancePayDay ? `매월 ${s.allowancePayDay}일` : '-',
        dateText(s.firstAllowancePayDate),
        dateText(s.contractEndDate),
        s.branch,
        s.manager,
        s.recruiter,
        payMethodLabel(s.payment.method),
        s.status,
      ]
    })
    downloadListAsExcel(`계약목록_${new Date().toISOString().slice(0, 10)}.xlsx`, headers, data, undefined, [5, 6])
  }

  return (
    <AppLayout title="계약 조회">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-[-0.5px] text-text-strong">
            계약 조회
          </h1>
          <p className="text-[13px] text-[#94a3b8] mt-1">
            계약 목록을 조회하고 신규 계약을 등록합니다. 상세에서 계약 이력과
            결재정보를 확인할 수 있습니다.
          </p>
        </div>
        <button
          onClick={() => setRegisterOpen(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-bold text-white hover:brightness-110"
        >
          <Plus size={15} /> 계약 등록
        </button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <SummaryCard label="전체 계약" value={sum.total} tint="#e0edff" fg="#2563eb" icon={FileText} />
        <SummaryCard
          label="진행중"
          value={sum.active}
          tint="#e2f7ec"
          fg="#16a34a"
          icon={FileText}
        />
        <SummaryCard
          label="이번달 신규"
          value={sum.newThisMonth}
          tint="#fff1e0"
          fg="#f59e0b"
          icon={PlusCircle}
        />
        <SummaryCard
          label="해지·폐기"
          value={sum.terminated}
          tint="#fee2e2"
          fg="#ef4444"
          icon={XCircle}
        />
      </div>

      {/* 필터 바 — 1줄 배치 */}
      <div className="rounded-[14px] border border-border bg-card p-4 mb-4 overflow-x-auto">
        <div className="grid grid-cols-[repeat(8,minmax(120px,1fr))_auto_auto] gap-2 items-end min-w-[1400px]">
          <Field label="소속">
            <SelectFilter
              value={draft.org}
              options={codes.orgs}
              onChange={(v) => setDraft({ ...draft, org: v })}
            />
          </Field>
          <Field label="계약자명">
            <input
              value={draft.keyword}
              onChange={(e) => setDraft({ ...draft, keyword: e.target.value })}
              placeholder="계약자명 검색"
              className={inputCls}
            />
          </Field>
          <Field label="계약일자">
            <DateTextInput
              value={draft.contractDate}
              onChange={(v) => setDraft({ ...draft, contractDate: v })}
              onTabNext={() => contractEndDateRef.current?.focus()}
              className={inputCls}
            />
          </Field>
          <Field label="계약종료일">
            <DateTextInput
              ref={contractEndDateRef}
              value={draft.contractEndDate}
              onChange={(v) => setDraft({ ...draft, contractEndDate: v })}
              className={inputCls}
            />
          </Field>
          <Field label="지점명">
            <SelectFilter
              value={draft.branch}
              options={BRANCHES}
              onChange={(v) => setDraft({ ...draft, branch: v })}
            />
          </Field>
          <Field label="관리자">
            <SelectFilter
              value={draft.manager}
              options={MANAGERS}
              onChange={(v) => setDraft({ ...draft, manager: v })}
            />
          </Field>
          <Field label="유치자">
            <SelectFilter
              value={draft.recruiter}
              options={RECRUITERS}
              onChange={(v) => setDraft({ ...draft, recruiter: v })}
            />
          </Field>
          <Field label="상태">
            <SelectFilter
              value={draft.status}
              options={codes.statuses}
              onChange={(v) => setDraft({ ...draft, status: v })}
            />
          </Field>
          <button
            onClick={() => setApplied(draft)}
            className="h-[38px] rounded-[8px] bg-indigo px-5 text-sm font-bold text-white hover:brightness-110 whitespace-nowrap"
          >
            검색
          </button>
          <button
            onClick={() => {
              setDraft(EMPTY_FILTER)
              setApplied(EMPTY_FILTER)
            }}
            className="h-[38px] rounded-[8px] border border-border px-5 text-sm font-semibold text-[#c2cde0] hover:bg-hover whitespace-nowrap"
          >
            초기화
          </button>
        </div>
      </div>

      {/* 테이블 */}
      <div className="rounded-[14px] border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[15px] font-extrabold text-text-strong">
            계약 목록{' '}
            <span className="text-[#64748b] font-semibold">({rows.length})</span>
          </span>
          <button
            onClick={onExcelDownload}
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-success px-4 text-sm font-bold text-white hover:brightness-110"
          >
            <Download size={15} /> 엑셀 다운로드
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1400px] text-[13px]">
            <thead>
              <tr className="text-left text-[12.5px] text-[#94a3b8] border-y border-border">
                {COLS.map((c) => (
                  <th
                    key={c.label}
                    className={`px-3 py-1.5 font-semibold whitespace-nowrap ${
                      c.align === 'center'
                        ? 'text-center'
                        : c.align === 'right'
                          ? 'text-right'
                          : ''
                    }`}
                    style={c.w ? { width: c.w, minWidth: c.w } : undefined}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <Row
                  key={c.id}
                  c={c}
                  no={rows.length - i}
                  onDetail={() => setDetailId(c.id)}
                  onDelete={() => onDelete(c)}
                />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={COLS.length}
                    className="px-3 py-10 text-center text-[#64748b]"
                  >
                    {loading
                      ? '불러오는 중…'
                      : loadErr
                        ? `불러오기 실패: ${loadErr}`
                        : '조건에 맞는 계약이 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {registerOpen && (
        <ContractRegisterModal
          onClose={() => setRegisterOpen(false)}
          onCreated={() => {
            setRegisterOpen(false)
            setRefresh((n) => n + 1)
          }}
        />
      )}
      {detailId && (
        <ContractDetailDrawer
          contractId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={() => setRefresh((n) => n + 1)}
        />
      )}
    </AppLayout>
  )
}

const inputCls =
  'h-[38px] w-full rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary'

function SelectFilter({
  value,
  options,
  onChange,
}: {
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    >
      <option value="전체">전체</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-semibold text-[#94a3b8]">
        {label}
      </span>
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
      <div
        className="h-[38px] w-[38px] rounded-[11px] flex items-center justify-center"
        style={{ background: tint, color: fg }}
      >
        <Icon size={18} />
      </div>
      <div>
        <div className="text-[13px] font-semibold text-[#64748b]">{label}</div>
        <div className="text-[25px] font-extrabold text-text-strong leading-tight">
          {value}
        </div>
      </div>
    </div>
  )
}

/** 결재구분 배지 라벨 (혼합 → 카드+현금) */
function payMethodLabel(method: string): string {
  return method === '혼합' ? '카드+현금' : method
}

function Row({
  c,
  no,
  onDetail,
  onDelete,
}: {
  c: Contract
  no: number
  onDetail: () => void
  onDelete: () => void
}) {
  const s = c.current
  return (
    <tr className="border-b border-border hover:bg-hover">
      <td className="px-2 py-1.5 text-center whitespace-nowrap tabular text-[#c2cde0]">
        {no}
      </td>
      <td className="px-3 py-1.5 text-center whitespace-nowrap">{s.org}</td>
      <td className="px-3 py-1.5 font-semibold text-text-strong whitespace-nowrap">
        {s.contractorName}
      </td>
      <td className="px-3 py-1.5 text-center whitespace-nowrap">
        {s.contractType}
      </td>
      <td className="px-3 py-1.5 tabular text-center whitespace-nowrap">
        {dateText(s.contractDate)}
      </td>
      <td
        className="px-3 py-1.5 tabular text-right whitespace-nowrap"
        style={{ width: 132, minWidth: 132 }}
      >
        {comma(s.deposit)}
      </td>
      <td
        className="px-3 py-1.5 tabular text-right whitespace-nowrap"
        style={{ width: 116, minWidth: 116 }}
      >
        {comma(s.allowance)}
      </td>
      <td className="px-3 py-1.5 tabular whitespace-nowrap">
        {s.allowancePayDay ? `매월 ${s.allowancePayDay}일` : '-'}
      </td>
      <td className="px-3 py-1.5 tabular whitespace-nowrap">
        {dateText(s.firstAllowancePayDate)}
      </td>
      <td className="px-3 py-1.5 tabular text-center whitespace-nowrap">
        {dateText(s.contractEndDate)}
      </td>
      <td className="px-3 py-1.5 text-center whitespace-nowrap">{s.branch}</td>
      <td className="px-3 py-1.5 whitespace-nowrap">{s.manager}</td>
      <td className="px-3 py-1.5 whitespace-nowrap">{s.recruiter}</td>
      <td className="px-3 py-1.5 whitespace-nowrap">
        <Badge tone={methodTone(s.payment.method)}>
          {payMethodLabel(s.payment.method)}
        </Badge>
      </td>
      <td className="px-3 py-1.5">
        <StatusBadge status={s.status} />
      </td>
      <td className="px-3 py-1.5 text-center whitespace-nowrap">
        <div className="flex items-center justify-center gap-1.5">
          <button
            onClick={onDetail}
            title="상세 보기"
            className="h-8 w-8 rounded-lg border border-border inline-flex items-center justify-center text-[#94a3b8] hover:bg-hover hover:text-white"
          >
            <Eye size={16} />
          </button>
          <button
            onClick={onDelete}
            title="폐기 처리"
            className="h-8 w-8 rounded-lg border border-border inline-flex items-center justify-center text-danger hover:bg-hover hover:brightness-125"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </td>
    </tr>
  )
}
