// 급여 계산 엔진 — 화면(목록)·급여명세서·텍스트 출력이 모두 이 모듈의 결과만 사용한다.
// 계산을 한 곳에 모아, 화면과 보고서 값이 어긋나는 것을 막는다.
//
// 계산 규칙
//   monthly      = 직급별 연봉 / 12
//   근로소득      = (소득구분 = 근로소득) ? 직급별 근로기본급여 : 0
//   소득공제      = (근로소득 발생 시) 국민연금* + 건강.요양 + 고용보험 + 소득세  (직급별 정액)
//                   * 60세 생일 이후는 국민연금 의무가입 대상이 아니므로 제외
//   실지급(근로)  = 근로소득 − 소득공제
//   사업소득      = (monthly − 근로소득) + 활동비      ← 활동비는 급여 미반영, 사업소득에 포함
//   소득세        = 사업소득 × 3.3%
//   실지급(사업)  = 사업소득 − 소득세
//   지급총액      = 실지급(근로) + 실지급(사업)
import type { Appointment, IncomeType } from '../../types/appointment'
import { normalizeIncomeType } from '../../types/appointment'
import type { PositionSalary } from '../appointment/positionSalaryStore'

/** 사업소득 원천징수율 3.3% */
export const WITHHOLDING_RATE = 0.033

/** 'YYYY-MM-DD' → 로컬 Date (UTC 파싱으로 인한 하루 밀림 방지) */
function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/**
 * 주민등록번호 → 생년월일.
 * 하이픈 유무를 모두 허용한다 (실데이터에 '6407142921711' 형태가 존재).
 * 성별코드로 세기를 판별한다. 판별 불가 시 null.
 */
export function birthDateOf(residentNo: string): Date | null {
  const d = (residentNo || '').replace(/\D/g, '')
  if (d.length < 7) return null
  const yy = Number(d.slice(0, 2))
  const mm = Number(d.slice(2, 4))
  const dd = Number(d.slice(4, 6))
  const gender = Number(d[6])
  let century: number
  if (gender === 1 || gender === 2 || gender === 5 || gender === 6) century = 1900
  else if (gender === 3 || gender === 4 || gender === 7 || gender === 8) century = 2000
  else if (gender === 9 || gender === 0) century = 1800
  else return null
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
  return new Date(century + yy, mm - 1, dd)
}

/**
 * 국민연금 의무가입 제외 여부.
 * 60세가 되는 본인 생일(주민등록 기준) 당일부터 의무가입 대상이 아니다.
 * 기준일(baseDate)은 급여 산정일을 넘겨야 한다 — 오늘 날짜로 판정하면 과거 급여를 다시 조회할 때 값이 달라진다.
 */
export function isPensionExempt(residentNo: string, baseDateISO: string): boolean {
  const birth = birthDateOf(residentNo)
  const base = parseIsoDate(baseDateISO)
  if (!birth || !base) return false
  const sixtieth = new Date(birth.getFullYear() + 60, birth.getMonth(), birth.getDate())
  return base >= sixtieth
}

/** 급여 계산 결과 1행 — 목록/명세서/텍스트가 공유한다 */
export interface PayrollRow {
  id: string
  org: string // 소속
  name: string
  residentNo: string
  position: string
  incomeType: IncomeType

  // 근로소득(B)
  laborIncome: number // 근로소득
  insuranceDeduction: number // 소득공제(4대보험 본인부담)
  laborNet: number // 실지급액

  // 사업소득(A)
  businessIncome: number // 사업소득 (수당 + 활동비)
  incomeTax: number // 소득세 3.3%
  businessNet: number // 실지급액

  totalNet: number // 지급총액

  bankName: string
  accountNo: string
  accountOwner: string

  // 명세서 상세용
  annualSalary: number
  monthly: number
  activity: number
  pensionExempt: boolean
  /** 근로소득 공제 내역 (직급별 정액, 실제 적용된 값) */
  insurance: {
    pension: number // 국민연금
    healthCare: number // 건강.요양
    employment: number // 고용보험
    laborTax: number // 소득세 (근로소득)
  }
}

/** 임용계약 1건 → 급여 계산 1행 */
export function calcPayroll(
  a: Appointment,
  table: PositionSalary[],
  baseDateISO: string,
): PayrollRow {
  const p = table.find((x) => x.position === a.position)
  // 직급표에 연봉이 없으면 계약서상 연봉으로 대체
  const annualSalary = p?.basic || a.salary || 0
  const monthly = Math.round(annualSalary / 12)
  const activity = a.activity || 0
  const incomeType = normalizeIncomeType(a.insuranceType)
  const pensionExempt = isPensionExempt(a.residentNo, baseDateISO)

  // 근로소득: 직급별 정해진 기본급여. 월지급액을 넘지 않도록 clamp.
  const laborBasic = p?.laborBasic || 0
  const laborIncome =
    incomeType === '근로소득' ? Math.min(laborBasic, monthly) : 0

  // 근로소득이 실제로 발생할 때만 정액 공제한다 (미설정 직급의 음수 실지급 방지)
  const hasLabor = laborIncome > 0
  const pension = hasLabor && !pensionExempt ? p?.pension || 0 : 0
  const healthCare = hasLabor ? p?.healthCare || 0 : 0
  const employment = hasLabor ? p?.employment || 0 : 0
  const laborTax = hasLabor ? p?.incomeTax || 0 : 0
  const insuranceDeduction = pension + healthCare + employment + laborTax
  const laborNet = laborIncome - insuranceDeduction

  // 사업소득: 급여로 떼지 않은 나머지 + 활동비
  const businessIncome = Math.max(0, monthly - laborIncome) + activity
  const incomeTax = Math.round(businessIncome * WITHHOLDING_RATE)
  const businessNet = businessIncome - incomeTax

  return {
    id: a.id,
    org: a.ref || '',
    name: a.name,
    residentNo: a.residentNo,
    position: a.position,
    incomeType,
    laborIncome,
    insuranceDeduction,
    laborNet,
    businessIncome,
    incomeTax,
    businessNet,
    totalNet: laborNet + businessNet,
    bankName: a.bankName,
    accountNo: a.accountNo,
    accountOwner: a.accountOwner || a.name,
    annualSalary,
    monthly,
    activity,
    pensionExempt,
    insurance: { pension, healthCare, employment, laborTax },
  }
}

/* ══════════════════════════════════════════════════════════
 * 수익금(수당) 지급 — 근로소득/사업소득 분리
 *
 * 급여관리와 계산 규칙이 같다. 다른 점은 기준 금액이 '연봉/12'가 아니라
 * 계약 수당(allowance)이고, 직급이 없어 4대보험 등급을 하나로 고정한다는 것뿐이다.
 * ══════════════════════════════════════════════════════════ */

/** 수익금 지급자의 4대보험 등급 — 시스템관리 직급급여의 이 등급 값을 그대로 쓴다 */
export const REVENUE_LABOR_GRADE = '점주'

/** 계산에 필요한 지급대상 정보 (계약 스냅샷 / 추가지급 대상자 공통) */
export interface RevenuePayoutInput {
  name: string
  residentNo: string
  incomeType: IncomeType
  /** 지급 기준 금액 — 계약은 수당, 추가지급은 등록 금액 */
  amount: number
  bankName: string
  accountNo: string
  accountOwner: string
}

/** 수익금 지급 계산 1행 — 목록/엑셀/보고서가 공유한다 */
export interface RevenuePayoutRow extends RevenuePayoutInput {
  laborIncome: number
  insuranceDeduction: number
  laborNet: number
  businessIncome: number
  incomeTax: number
  businessNet: number
  totalNet: number
  pensionExempt: boolean
  insurance: {
    pension: number
    healthCare: number
    employment: number
    laborTax: number
  }
}

/**
 * 수익금 1건 → 근로소득/사업소득 분리 결과.
 * 사업소득이면 기존과 동일하게 전액 3.3% 원천징수만 한다(기존 지급액이 바뀌지 않는다).
 */
export function calcRevenuePayout(
  input: RevenuePayoutInput,
  table: PositionSalary[],
  baseDateISO: string,
): RevenuePayoutRow {
  const p = table.find((x) => x.position === REVENUE_LABOR_GRADE)
  const pensionExempt = isPensionExempt(input.residentNo, baseDateISO)

  // 근로소득: 등급별 정해진 기본급여. 지급액을 넘지 않도록 clamp.
  const laborBasic = p?.laborBasic || 0
  const laborIncome =
    input.incomeType === '근로소득' ? Math.min(laborBasic, input.amount) : 0

  const hasLabor = laborIncome > 0
  const pension = hasLabor && !pensionExempt ? p?.pension || 0 : 0
  const healthCare = hasLabor ? p?.healthCare || 0 : 0
  const employment = hasLabor ? p?.employment || 0 : 0
  const laborTax = hasLabor ? p?.incomeTax || 0 : 0
  const insuranceDeduction = pension + healthCare + employment + laborTax
  const laborNet = laborIncome - insuranceDeduction

  // 사업소득: 근로소득으로 떼지 않은 나머지
  const businessIncome = Math.max(0, input.amount - laborIncome)
  const incomeTax = Math.round(businessIncome * WITHHOLDING_RATE)
  const businessNet = businessIncome - incomeTax

  return {
    ...input,
    laborIncome,
    insuranceDeduction,
    laborNet,
    businessIncome,
    incomeTax,
    businessNet,
    totalNet: laborNet + businessNet,
    pensionExempt,
    insurance: { pension, healthCare, employment, laborTax },
  }
}

/** 급여보고 텍스트 1줄 — 이름|금액|주민번호|은행|계좌번호|예금주 */
export function payrollTextLine(
  r: PayrollRow,
  amount: number,
): string {
  return [
    r.name,
    amount.toLocaleString('ko-KR'),
    r.residentNo,
    r.bankName,
    r.accountNo,
    r.accountOwner,
  ].join('|')
}

/** 급여보고 텍스트 — 근로소득분과 사업소득분을 각각 1줄씩 (금액 0인 줄은 생략) */
export function payrollTextLines(rows: PayrollRow[]): string[] {
  const out: string[] = []
  rows.forEach((r) => {
    if (r.laborNet > 0) out.push(payrollTextLine(r, r.laborNet))
    if (r.businessNet > 0) out.push(payrollTextLine(r, r.businessNet))
  })
  return out
}
