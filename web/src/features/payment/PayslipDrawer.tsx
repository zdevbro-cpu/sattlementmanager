// 급여명세서 — 급여관리 목록의 [상세]에서 열린다. 인쇄 시 명세서 영역만 출력된다.
import { createPortal } from 'react-dom'
import { Printer, X } from 'lucide-react'
import { comma, dateText } from '../../lib/format'
import type { PayrollRow } from './payrollEngine'

/**
 * 인쇄 시 명세서 영역만 출력한다.
 *
 * visibility:hidden 은 요소를 숨겨도 레이아웃 공간을 그대로 차지해, 뒤에 깔린 목록(수백 행)과
 * 사이드바 높이만큼 빈 페이지가 함께 출력된다. 따라서 배경 앱은 display:none 으로 레이아웃에서
 * 완전히 제거해야 한다. 그러려면 명세서가 body 직속 자식이어야 하므로 Portal 로 띄운다.
 *
 * 화면은 다크테마라 인쇄 시 글자색을 검정으로 강제한다(흰 배경에 밝은 회색 글자는 안 보인다).
 */
const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 14mm; }
  html, body {
    height: auto !important;
    overflow: visible !important;
    background: #fff !important;
  }
  /* 배경 앱(사이드바·목록)을 레이아웃에서 제거 — 빈 페이지 방지 */
  body > *:not(#payslip-portal) { display: none !important; }

  #payslip-portal {
    position: static !important;
    display: block !important;
    inset: auto !important;
    padding: 0 !important;
    overflow: visible !important;
    background: transparent !important;
    z-index: auto !important;
  }
  #payslip-portal .payslip-card {
    max-width: none !important;
    width: 100% !important;
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    background: #fff !important;
  }
  #payslip-portal .payslip-scroll {
    max-height: none !important;
    overflow: visible !important;
    padding: 0 !important;
  }
  #payslip-print {
    border: none !important;
    border-radius: 0 !important;
    background: #fff !important;
    padding: 0 !important;
  }
  /* 다크테마 색상 → 인쇄용 검정 */
  #payslip-print, #payslip-print * {
    color: #000 !important;
    background: transparent !important;
  }
  #payslip-print .payslip-cell {
    border: 1px solid #999 !important;
    break-inside: avoid;
  }
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
  // body 직속으로 띄운다 — 인쇄 시 배경 앱을 display:none 으로 제거하려면 형제 노드여야 한다.
  return createPortal(
    <div
      id="payslip-portal"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-6 overflow-y-auto"
    >
      <style>{PRINT_CSS}</style>
      <div className="payslip-card w-full max-w-[720px] rounded-[14px] border border-border bg-card shadow-xl">
        <div className="payslip-noprint flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-[17px] font-extrabold text-text-strong">급여명세서</h2>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="payslip-scroll px-6 py-5 max-h-[74vh] overflow-y-auto">
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
                {/* 실지급액은 최우측 컬럼에 고정 */}
                <Cell label="실지급액" value={`${comma(row.laborNet)} 원`} strong className="col-start-3" />
              </Grid>
            </Section>

            {/* 사업소득 */}
            <Section title="사업소득">
              <Grid>
                <Cell label="사업소득 (수당 + 활동비)" value={`${comma(row.businessIncome)} 원`} />
                <Cell label="활동비" value={`${comma(row.activity)} 원`} />
                <Cell label="소득세 (3.3%)" value={`${comma(row.incomeTax)} 원`} />
                {/* 실지급액은 최우측 컬럼에 고정 */}
                <Cell label="실지급액" value={`${comma(row.businessNet)} 원`} strong className="col-start-3" />
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
    </div>,
    document.body,
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

/** 섹션 내부 셀 배치 — 명세서 전 섹션 3컬럼 */
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-2">{children}</div>
}

function Cell({
  label,
  value,
  strong,
  className = '',
}: {
  label: string
  value: string
  strong?: boolean
  /** 그리드 배치용 (예: 'col-start-3' — 최우측 컬럼 고정) */
  className?: string
}) {
  return (
    <div className={`payslip-cell rounded-[8px] border border-border px-3 py-2 ${className}`}>
      <div className="text-[11px] text-[#64748b]">{label}</div>
      <div
        className={`tabular ${strong ? 'text-[15px] font-extrabold text-text-strong' : 'text-[13px] font-semibold text-[#c2cde0]'}`}
      >
        {value}
      </div>
    </div>
  )
}
