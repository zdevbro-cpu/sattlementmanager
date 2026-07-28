import type { ContractSnapshot } from '../../types/contract'

/**
 * 근로소득 최소 기준액(월) — 시스템관리 직급급여의 '점주' 등급 근로소득 기본급여와 같다.
 * 4대보험 공제가 직급별 정액이라, 수당이 이 금액보다 적으면 공제율이 비정상적으로 커진다.
 * (예: 수당 50만원에 정액 공제 215,810원 → 공제율 43%)
 */
export const LABOR_INCOME_MIN = 2_000_000

type IncomeType = ContractSnapshot['incomeType']

/**
 * 소득구분 토글 — 수익금(수당) 지급 시 근로소득/사업소득 분리 기준.
 * 근로소득으로 두면 점주 등급 기준으로 4대보험이 공제되고 나머지가 사업소득으로 나뉜다.
 * 수당이 기준액 미만이면 켤 수 없다(공제가 정액이라 실지급액이 비정상이 된다).
 */
export default function IncomeTypeToggle({
  value,
  onChange,
  allowance,
}: {
  value: IncomeType
  onChange: (v: IncomeType) => void
  /** 이 스냅샷의 수당 — 기준액 미만이면 근로소득으로 전환할 수 없다 */
  allowance: number
}) {
  const eligible = allowance >= LABOR_INCOME_MIN
  const on = eligible && value === '근로소득'

  return (
    <div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={!eligible}
        onClick={() => onChange(on ? '사업소득' : '근로소득')}
        title={
          eligible
            ? '근로소득으로 두면 4대보험이 공제되고 나머지가 사업소득으로 지급됩니다.'
            : `수당이 ${LABOR_INCOME_MIN.toLocaleString('ko-KR')}원 이상일 때만 근로소득으로 전환할 수 있습니다.`
        }
        className={`inline-flex h-9 w-full items-center gap-2 rounded-[8px] border px-2.5 text-[13px] font-semibold transition-colors ${
          !eligible
            ? 'cursor-not-allowed border-border bg-input text-[#64748b] opacity-60'
            : on
              ? 'border-primary bg-input text-primary'
              : 'border-border bg-input text-[#c2cde0] hover:bg-hover'
        }`}
      >
        <span
          className={`relative inline-block h-[18px] w-[34px] shrink-0 rounded-full transition-colors ${
            on ? 'bg-primary' : 'bg-[#334155]'
          }`}
        >
          <span
            className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all ${
              on ? 'left-[18px]' : 'left-[2px]'
            }`}
          />
        </span>
        {on ? '근로소득' : '사업소득'}
      </button>
      {!eligible && (
        <div className="mt-1 text-[11px] text-[#64748b]">
          수당 {LABOR_INCOME_MIN.toLocaleString('ko-KR')}원 이상만 근로소득 전환 가능
        </div>
      )}
    </div>
  )
}
