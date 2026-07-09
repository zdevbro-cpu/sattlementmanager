// 급여명세서 — 급여관리 목록의 [상세]에서 열린다. 인쇄 시 명세서 영역만 출력된다.
import { Printer, X } from 'lucide-react'
import { comma, dateText } from '../../lib/format'
import type { PayrollRow } from './payrollEngine'

/** 인쇄 시 명세서 영역만 보이도록 — index.css를 건드리지 않고 컴포넌트에 국한한다 */
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #payslip-print, #payslip-print * { visibility: visible !important; }
  #payslip-print {
    position: absolute; left: 0; top: 0; width: 100%;
    background: #fff !important; color: #000 !important;
    border: none !important; box-shadow: none !important;
  }
  #payslip-print .payslip-cell { border-color: #999 !important; }
  .payslip-noprint { display: none !important; }
}
`

export default function PayslipDrawer({
  row,
  baseDate,
  onClose,
}: {
  row: PayrollRow
  baseDate: string
  onClose: () => void
}) {
  const ins = row.insurance
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-6 overflow-y-auto">
      <style>{PRINT_CSS}</style>
      <div className="w-full max-w-[720px] rounded-[14px] border border-border bg-card shadow-xl">
        <div className="payslip-noprint flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-[17px] font-extrabold text-text-strong">급여명세서</h2>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 max-h-[74vh] overflow-y-auto">
          <div id="payslip-print" className="rounded-[10px] border border-border bg-input/20 p-5">
            <div className="text-center mb-5">
              <div className="text-[19px] font-extrabold text-text-strong">급여명세서</div>
              <div className="text-[12px] text-[#94a3b8] mt-1">지급일 {dateText(baseDate)}</div>
            </div>

            {/* 인적사항 */}
            <Section title="인적사항">
              <Grid>
                <Cell label="소속" value={row.org || '-'} />
                <Cell label="성명" value={row.name} />
                <Cell label="주민등록번호" value={row.residentNo || '-'} />
                <Cell label="직급" value={row.position || '-'} />
                <Cell label="소득구분" value={row.incomeType} />
                <Cell label="연봉 / 월환산" value={`${comma(row.annualSalary)} / ${comma(row.monthly)}`} />
              </Grid>
            </Section>

            {/* 근로소득 */}
            <Section title="근로소득">
              <Grid>
                <Cell label="근로소득" value={`${comma(row.laborIncome)} 원`} />
                <Cell label="소득공제 합계" value={`${comma(row.insuranceDeduction)} 원`} />
                <Cell label="국민연금" value={row.pensionExempt ? '해당없음 (60세 이상)' : `${comma(ins.pension)} 원`} />
                <Cell label="건강.요양" value={`${comma(ins.healthCare)} 원`} />
                <Cell label="고용보험" value={`${comma(ins.employment)} 원`} />
                <Cell label="소득세" value={`${comma(ins.laborTax)} 원`} />
                <Cell label="실지급액" value={`${comma(row.laborNet)} 원`} strong />
              </Grid>
            </Section>

            {/* 사업소득 */}
            <Section title="사업소득">
              <Grid>
                <Cell label="사업소득 (수당 + 활동비)" value={`${comma(row.businessIncome)} 원`} />
                <Cell label="활동비" value={`${comma(row.activity)} 원`} />
                <Cell label="소득세 (3.3%)" value={`${comma(row.incomeTax)} 원`} />
                <Cell label="실지급액" value={`${comma(row.businessNet)} 원`} strong />
              </Grid>
            </Section>

            {/* 지급총액 */}
            <div className="payslip-cell mt-4 flex items-center justify-between rounded-[8px] border border-border px-4 py-3">
              <span className="text-[14px] font-bold text-[#c2cde0]">지급총액</span>
              <span className="text-[18px] font-extrabold text-text-strong tabular">
                {comma(row.totalNet)} 원
              </span>
            </div>

            {/* 지급계좌 */}
            <Section title="지급계좌">
              <Grid>
                <Cell label="은행명" value={row.bankName || '-'} />
                <Cell label="계좌번호" value={row.accountNo || '-'} />
                <Cell label="예금주" value={row.accountOwner || '-'} />
              </Grid>
            </Section>

            <div className="mt-4 text-[11px] text-[#64748b] leading-relaxed">
              ⓘ 위 근로소득 공제는 직급별 정액 기준이며, 4대보험 정산 과부족과 최종 실지급액은
              회계부서에서 처리합니다.
            </div>
          </div>
        </div>

        <div className="payslip-noprint flex justify-end gap-2 px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="h-10 rounded-[10px] border border-border px-4 text-sm font-semibold text-[#c2cde0] hover:bg-hover"
          >
            닫기
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-bold text-white hover:brightness-110"
          >
            <Printer size={15} /> 인쇄
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="mb-2 text-[13px] font-bold text-text-strong">{title}</div>
      {children}
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>
}

function Cell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="payslip-cell rounded-[8px] border border-border px-3 py-2">
      <div className="text-[11px] text-[#64748b]">{label}</div>
      <div
        className={`tabular ${strong ? 'text-[15px] font-extrabold text-text-strong' : 'text-[13px] font-semibold text-[#c2cde0]'}`}
      >
        {value}
      </div>
    </div>
  )
}
