// 계약관리 도메인 타입 정의
// 요구사항: 목록 컬럼 15종 + 상태구분 6종 + 결재(카드/현금 6분할) + 히스토리 + 파일링크

/** 계약 상태구분 (= 계약 이벤트/변경사유) */
export type ContractStatus =
  | '신규'
  | '증액'
  | '양수'
  | '양도'
  | '해지'
  | '폐기'

export const CONTRACT_STATUSES: ContractStatus[] = [
  '신규',
  '증액',
  '양수',
  '양도',
  '해지',
  '폐기',
]

/** 상태별 배지 색상 키 (docs 디자인 토큰 매핑) */
export const STATUS_BADGE: Record<string, { fg: string; bg: string }> = {
  신규: { fg: '#16a34a', bg: '#e2f7ec' },
  증액: { fg: '#0284c7', bg: '#e0f2fe' },
  양수: { fg: '#2563eb', bg: '#e0edff' },
  양도: { fg: '#b45309', bg: '#fff1e0' },
  해지: { fg: '#dc2626', bg: '#fee2e2' },
  폐기: { fg: '#475569', bg: '#f1f5f9' },
}

/** 상태 문자열 → 배지 색상 (등록되지 않은 값은 기본 slate 색) */
export function statusColor(status: string): { fg: string; bg: string } {
  return STATUS_BADGE[status] ?? { fg: '#475569', bg: '#e2e8f0' }
}

/** 결재구분 (카드/현금 동시 사용 가능 → 혼합) */
export type PaymentMethod = '카드' | '현금' | '혼합' | '없음'

/** 카드 분할결제 1회차 정보 (OCR type='sales' 필드와 정렬) */
export interface CardInstallment {
  seq: number // 회차 1~6
  amount: number // 금액
  issuer: string // 카드사
  cardNumber: string // 카드번호(마스킹)
  approvalNo: string // 승인번호
  terminalNo: string // 단말기번호(TID/CATID)
  serialNo: string // 일련번호(S/N)
  transactionDate: string // 거래일 (YYYY-MM-DD)
  /** 등록한 전표 이미지 파일명 (업로드 전 표시용) */
  imageName?: string
  /** 전표 이미지/스캔 → Google Drive 파일 링크 */
  driveFileId?: string
  driveViewUrl?: string
}

/** 현금 분할입금 1회차 정보 (OCR type='cash_receipt' 필드와 정렬) */
export interface CashInstallment {
  seq: number // 회차 1~6
  amount: number // 금액
  approvalNo: string // 승인번호
  transactionDate: string // 거래일 (YYYY-MM-DD)
  identifierType: string // 식별수단 (휴대폰/사업자번호/현금영수증카드)
  identifierNo: string // 식별번호
  merchantName: string // 가맹점명
  merchantBizNo: string // 가맹점 사업자번호
  bank?: string // 입금 은행
  depositor?: string // 입금자명
  /** 등록한 입금증 이미지 파일명 (업로드 전 표시용) */
  imageName?: string
  /** 입금증 이미지/스캔 → Google Drive 파일 링크 */
  driveFileId?: string
  driveViewUrl?: string
}

/** 결재정보 (계약 1건에 귀속) */
export interface PaymentInfo {
  method: PaymentMethod
  totalAmount: number
  /** 카드일 때 최대 6회 분할결제 */
  cardInstallments: CardInstallment[]
  /** 현금일 때 최대 6회 분할입금 */
  cashInstallments: CashInstallment[]
}

/** Google Drive 문서 링크 (계약서/전표/입금증 PDF) */
export interface DriveDocument {
  id: string
  kind: '계약서' | '카드전표' | '현금입금증'
  fileName: string
  driveFileId: string
  driveViewUrl: string
  uploadedAt: string
}

/**
 * 계약 스냅샷 1건.
 * ContractHistory 는 각 상태 이벤트(신규/증액/양수/양도/해지/폐기) 시점의
 * "전체 값 스냅샷"을 1행씩 보관한다. (감사·복원 용이)
 */
export interface ContractSnapshot {
  historyId: string
  status: string // 상태 (신규/증액/양수/양도/해지/폐기 등, 시스템관리에서 추가)
  eventDate: string // 이벤트 발생일 (계약일/변경일)

  // ── 목록 컬럼 값 ────────────────────────────
  org: string // 소속 (A/B, 시스템관리에서 추가)
  businessUnit: string // 사업부 (매출관리와 별개 필드, 시스템관리에서 추가)
  contractorName: string // 계약자
  /** 계약번호 — PK(id)와 별개, 사용자가 자유입력하는 참조번호 */
  contractNo?: string
  contractType: string // 계약구분 (LAS매장점주/직원/LAS-On파트장/LAS-On파트너)
  /** 소속 파트장 계약 id (LAS-On파트너 전용) — 라스온 현황 연결 키 */
  parentContractId?: string
  contractDate: string // 계약일
  deposit: number // 보증금
  allowance: number // 수당
  allowancePayDay: number // 수당지급일 (매월 1~31일, 날짜 아님)
  firstAllowancePayDate: string // 수당지급기준일 (실제 날짜)
  contractEndDate: string // 계약종료일
  branch: string // 지점명
  manager: string // 관리자
  recruiter: string // 유치자

  // ── 계좌·개인정보 ──────────────────────────
  bankName: string // 은행명
  accountNo: string // 계좌번호
  accountOwner: string // 예금주
  residentNo: string // 주민등록번호
  phone: string // 전화번호

  // ── LAS-On 수당 수령인 (계약자와 별개, LAS-On파트장/파트너 전용) ──
  recipientName?: string // 수령인 이름
  recipientBankName?: string // 수령인 은행명
  recipientAccountNo?: string // 수령인 계좌번호
  recipientAccountOwner?: string // 수령인 예금주
  recipientResidentNo?: string // 수령인 주민등록번호

  // ── 결재정보 ───────────────────────────────
  payment: PaymentInfo

  // ── 첨부 문서 ───────────────────────────────
  documents: DriveDocument[]

  memo?: string
  /** 임시저장 여부 — true면 "계약등록" 확정 전 상태 */
  isDraft?: boolean
  createdAt: string
}

/** 목록에 표시되는 계약 (최신 스냅샷 + 이력 배열) */
export interface Contract {
  id: string
  contractorId: string
  /** 최신(최근) 계약 내용 = current */
  current: ContractSnapshot
  /** 과거 이력 포함 전체 스냅샷 (최신순) */
  history: ContractSnapshot[]
}

/** 목록 조회 필터 (contractmanager 계약관리 조건 참고) */
export interface ContractFilter {
  keyword: string // 계약자명 검색
  status: string // 상태 ('전체' 포함)
  branch: string // 지점명 ('전체' 포함)
  manager: string // 관리자 ('전체' 포함)
  contractDate: string // 계약일자 (해당일 이후)
  contractEndDate: string // 계약종료일 (해당일 이전)
  regStartDate: string // 등록시작 (등록일 이후)
  regEndDate: string // 등록종료 (등록일 이전)
  recruiter: string // 유치자 ('전체' 포함)
  org: string // 소속 ('전체' 포함)
}

export const EMPTY_FILTER: ContractFilter = {
  keyword: '',
  status: '전체',
  branch: '전체',
  manager: '전체',
  contractDate: '',
  contractEndDate: '',
  regStartDate: '',
  regEndDate: '',
  recruiter: '전체',
  org: '전체',
}
