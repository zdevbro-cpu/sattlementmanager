import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { comma, dateText } from '../../lib/format'
import { useCodes } from '../../lib/codeStore'
import { EMPTY_FILTER, type Contract } from '../../types/contract'
import { listContracts } from './contractStore'
import { downloadLasOnStatusReport, type LasOnRow } from './lasOnExcel'

const HEADERS = [
  '번호', '계약일자', '이름', '주민번호', '구분',
  '합계', '현금입금', '카드결제', '카드사', '승인번호', '단말기NO', '입금은행',
  '유치자', '은행명', '계좌번호', '예금주', '비고',
]

function sumAmount(list: { amount: number }[]): number {
  return list.reduce((a, x) => a + (x.amount || 0), 0)
}

function cardIssuers(c: Contract): string {
  const list = c.current.payment.cardInstallments.map((i) => i.issuer).filter(Boolean)
  return list.length ? Array.from(new Set(list)).join(',') : '-'
}
function approvalNo(c: Contract): string {
  const p = c.current.payment
  return p.cardInstallments[0]?.approvalNo || p.cashInstallments[0]?.approvalNo || '-'
}
function terminalNo(c: Contract): string {
  return c.current.payment.cardInstallments[0]?.terminalNo || '-'
}
function depositBank(c: Contract): string {
  const list = c.current.payment.cashInstallments.map((i) => i.bank).filter(Boolean)
  return list.length ? Array.from(new Set(list)).join(',') : '-'
}

/**
 * 라스온(파트장,파트너) 계약 현황 — docs/양식_라스온 파트장 파트너 계약현황.xlsx 양식 준용.
 * 매출관리와 동일하게 계약관리 페이지의 탭으로 내장된다 (별도 페이지/라우트 아님).
 */
export default function LasOnStatusPage() {
  const codes = useCodes()
  const [businessUnit, setBusinessUnit] = useState('전체')
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    listContracts(EMPTY_FILTER).then((list) => {
      if (alive) {
        setContracts(
          list.filter(
            (c) => c.current.contractType === 'LAS-On파트장' || c.current.contractType === 'LAS-On파트너',
          ),
        )
        setLoading(false)
      }
    })
    return () => {
      alive = false
    }
  }, [])

  const filtered = contracts.filter(
    (c) => businessUnit === '전체' || c.current.businessUnit === businessUnit,
  )
  const leaders = filtered.filter((c) => c.current.contractType === 'LAS-On파트장')
  const partnersOf = (leaderId: string) =>
    filtered.filter((c) => c.current.contractType === 'LAS-On파트너' && c.current.parentContractId === leaderId)
  const unassignedPartners = filtered.filter(
    (c) =>
      c.current.contractType === 'LAS-On파트너' &&
      (!c.current.parentContractId || !leaders.some((l) => l.id === c.current.parentContractId)),
  )

  const rows: LasOnRow[] = []
  let no = 0
  leaders.forEach((leader) => {
    no++
    rows.push({ no, c: leader, isLeader: true })
    partnersOf(leader.id).forEach((p) => {
      no++
      rows.push({ no, c: p, isLeader: false })
    })
  })
  unassignedPartners.forEach((p) => {
    no++
    rows.push({ no, c: p, isLeader: false })
  })

  const [excelBusy, setExcelBusy] = useState(false)
  const onExcelDownload = async () => {
    setExcelBusy(true)
    try {
      await downloadLasOnStatusReport(rows, businessUnit)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setExcelBusy(false)
    }
  }

  return (
    <>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-[18px] font-extrabold text-text-strong">
            라스온 (파트장,파트너) 계약 현황
          </h2>
          <p className="text-[13px] text-[#94a3b8] mt-1">
            사업부별로 파트장과 소속 파트너 계약을 묶어서 보여줍니다.
          </p>
        </div>
        <button
          onClick={onExcelDownload}
          disabled={excelBusy}
          className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-success px-4 text-sm font-bold text-white hover:brightness-110 disabled:opacity-60"
        >
          <Download size={15} /> {excelBusy ? '다운로드 중…' : '엑셀 다운로드'}
        </button>
      </div>

      <div className="rounded-[14px] border border-border bg-card p-4 mb-4">
        <label className="block max-w-[240px]">
          <span className="mb-1 block text-[11.5px] font-semibold text-[#94a3b8]">사업부</span>
          <select
            value={businessUnit}
            onChange={(e) => setBusinessUnit(e.target.value)}
            className="h-[38px] w-full rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary"
          >
            <option value="전체">전체</option>
            {codes.businessUnits.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-[14px] border border-border bg-card overflow-hidden">
        <div className="px-4 py-3">
          <span className="text-[15px] font-extrabold text-text-strong">
            계약 현황 <span className="text-[#64748b] font-semibold">({rows.length})</span>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1500px] text-[13px]">
            <thead>
              <tr className="text-left text-[12.5px] text-[#94a3b8] border-y border-border">
                {HEADERS.map((h) => (
                  <th
                    key={h}
                    className={`px-3 py-1.5 font-semibold whitespace-nowrap ${
                      ['합계', '현금입금', '카드결제'].includes(h) ? 'text-right' : ''
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = r.c.current
                return (
                  <tr
                    key={r.c.id}
                    className={`border-b border-border hover:bg-hover ${r.isLeader ? 'bg-input/40' : ''}`}
                  >
                    <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#c2cde0]">{r.no}</td>
                    <td className="px-3 py-1.5 tabular whitespace-nowrap">{dateText(s.contractDate)}</td>
                    <td className={`px-3 py-1.5 whitespace-nowrap ${r.isLeader ? 'font-extrabold text-text-strong' : 'font-semibold pl-6'}`}>
                      {!r.isLeader && '↳ '}
                      {s.contractorName}
                    </td>
                    <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#94a3b8]">{s.residentNo || '-'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                          r.isLeader ? 'bg-[#e0edff] text-[#2563eb]' : 'bg-[#e2f7ec] text-[#16a34a]'
                        }`}
                      >
                        {r.isLeader ? '파트장' : '파트너'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 tabular text-right font-bold text-warning whitespace-nowrap">
                      {comma(s.payment.totalAmount)}
                    </td>
                    <td className="px-3 py-1.5 tabular text-right whitespace-nowrap">
                      {comma(sumAmount(s.payment.cashInstallments))}
                    </td>
                    <td className="px-3 py-1.5 tabular text-right whitespace-nowrap">
                      {comma(sumAmount(s.payment.cardInstallments))}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{cardIssuers(r.c)}</td>
                    <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#94a3b8]">{approvalNo(r.c)}</td>
                    <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#94a3b8]">{terminalNo(r.c)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{depositBank(r.c)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{s.recruiter}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{s.bankName || '-'}</td>
                    <td className="px-3 py-1.5 tabular whitespace-nowrap">{s.accountNo || '-'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{s.accountOwner || '-'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-[#94a3b8]">{s.memo || '-'}</td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={HEADERS.length} className="px-3 py-10 text-center text-[#64748b]">
                    {loading ? '불러오는 중…' : '조건에 맞는 라스온 계약이 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
