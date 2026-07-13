// 조직관리 — 임용계약(appointment) 도메인 타입
// contractmanager 임용계약관리 준용

/** 임용계약 상태 — 시스템관리 공통코드관리(임용계약 상태)에서 추가·삭제하는 동적 코드 */
export type AppointmentStatus = string

export type IncomeType = '사업소득' | '근로소득'

export const INCOME_TYPES: IncomeType[] = ['사업소득', '근로소득']

/**
 * 소득구분 정규화 — 기존 데이터의 '4대보험'은 '근로소득'과 동일한 의미다.
 * (DB 마이그레이션 없이 읽는 시점에만 라벨을 정리한다)
 */
export function normalizeIncomeType(v: string | undefined | null): IncomeType {
  return v === '근로소득' || v === '4대보험' ? '근로소득' : '사업소득'
}

/** 직급별 급여조건 (직급 → 연봉/활동비) */
export interface PositionRule {
  position: string // 직급
  basic: number // 연봉(원)
  activity: number // 활동비(원)
}

/** 임용계약 종류(계약명) — 직급별 rules 보유 */
export interface AppointmentType {
  id: string
  name: string // 계약명
  contractYears: number // 계약기간(년)
  payoutMonths: number // 급여일 = 계약일 + N개월
  positions: PositionRule[]
}

/** 임용계약 레코드 */
export interface Appointment {
  id: string
  contractNo: string // 계약번호 (LASE-yyyymmdd-000)
  name: string // 계약자명
  typeName: string // 계약종류(계약명)
  ref: string // 추천인/추천점
  residentNo: string // 주민번호
  phone: string // 연락처
  position: string // 직급
  salary: number // 급여(연봉)
  activity: number // 활동비
  insuranceType: IncomeType // 소득구분
  contractDate: string // 계약일
  payoutDate: string // 급여일
  workStartDate: string // 업무개시일
  reportStartDate: string // 신고개시일
  endDate: string // 계약종료일
  bankName: string // 은행/기관
  accountNo: string // 계좌번호
  accountOwner: string // 예금주
  status: AppointmentStatus // 계약상태
  memo?: string // 비고
  createdAt: string
  history?: AppointmentHistory[] // 변경 이력
  documents?: AppointmentDoc[] // 제출서류 (Google Drive)
}

/** 제출서류 1건 (Google Drive 저장 링크) */
export interface AppointmentDoc {
  id: string // 서류종류 키
  docType: string // 서류종류 (예: 주민등록등본)
  fileName: string
  driveFileId: string
  driveViewUrl: string
  uploadedAt: string
}

/** 변경 이력 — 필드 단위 변경 기록 1건 */
export interface AppointmentChange {
  label: string // 항목명
  before: string // 변경 전
  after: string // 변경 후
}

/** 변경 이력 항목 (수정 1회 = 이력 1건) */
export interface AppointmentHistory {
  historyId: string
  editedAt: string // 변경일
  memo: string // 변경 사유
  changes: AppointmentChange[]
}

/** 목록 필터 */
export interface AppointmentFilter {
  keyword: string // 계약자명
  branch: string // 지점명(소속지점)
  position: string // 직급 ('전체' 포함)
  startDate: string // 계약일 시작
  endDate: string // 계약일 종료
}

export const EMPTY_APPOINTMENT_FILTER: AppointmentFilter = {
  keyword: '',
  branch: '',
  position: '전체',
  startDate: '',
  endDate: '',
}

export const BANKS = [
  '국민은행',
  '신한은행',
  '우리은행',
  '하나은행',
  '농협은행',
  'IBK기업은행',
  'SC제일은행',
  '카카오뱅크',
  '토스뱅크',
  '새마을금고',
  '우체국',
]

/** 상태 → 배지 톤 */
export function appointmentStatusTone(
  status: string,
): 'green' | 'amber' | 'red' | 'slate' {
  switch (status) {
    case '정상':
    case '정상운영':
      return 'green'
    case '휴직':
    case '일시정지':
    case '계약만료':
      return 'amber'
    case '해지':
    case '계약해지':
      return 'red'
    default:
      return 'slate'
  }
}
