import type {
  Contract,
  ContractSnapshot,
  PaymentInfo,
} from '../types/contract'

export const ORGS = ['A', 'B']
export const BRANCHES = ['강남지점', '분당지점', '수원지점', '일산지점', '판교지점']
export const MANAGERS = ['김관리', '이관리', '박관리', '최관리']
export const RECRUITERS = ['정유치', '한유치', '오유치', '서유치', '문유치']

function cardPayment(total: number): PaymentInfo {
  return {
    method: '카드',
    totalAmount: total,
    cardInstallments: [
      {
        seq: 1,
        amount: total,
        issuer: '신한카드',
        cardNumber: '1234-56**-****-7890',
        approvalNo: '30021456',
        terminalNo: 'CAT001982',
        serialNo: 'SN-77281',
        transactionDate: '2026-03-12',
      },
    ],
    cashInstallments: [],
  }
}

function cashPayment(total: number, splits: number): PaymentInfo {
  const per = Math.floor(total / splits)
  return {
    method: '현금',
    totalAmount: total,
    cardInstallments: [],
    cashInstallments: Array.from({ length: splits }, (_, i) => ({
      seq: i + 1,
      amount: i === splits - 1 ? total - per * (splits - 1) : per,
      approvalNo: `CR${String(90010 + i)}`,
      transactionDate: `2026-0${3 + i}-05`,
      identifierType: '휴대폰',
      identifierNo: '010-****-1234',
      merchantName: 'LAS 정산센터',
      merchantBizNo: '123-45-67890',
      bank: '국민은행',
      depositor: '홍길동',
    })),
  }
}

let seq = 0
function snap(p: Partial<ContractSnapshot>): ContractSnapshot {
  seq += 1
  return {
    historyId: `H${String(seq).padStart(4, '0')}`,
    status: '신규',
    eventDate: '2026-03-12',
    org: 'A',
    contractorName: '계약자',
    contractType: 'LAS매장점주',
    contractDate: '2026-03-12',
    deposit: 3_000_000,
    allowance: 500_000,
    allowancePayDay: 25,
    firstAllowancePayDate: '2026-04-25',
    contractEndDate: '2027-03-11',
    branch: '강남지점',
    manager: '김관리',
    recruiter: '정유치',
    bankName: '국민은행',
    accountNo: '123456-04-567890',
    accountOwner: '계약자',
    residentNo: '900101-1******',
    phone: '010-1234-5678',
    payment: cardPayment(3_000_000),
    documents: [],
    memo: '',
    createdAt: '2026-03-12',
    ...p,
  }
}

/** 이력이 여러 개인 계약 (신규 → 증액) */
const c1History: ContractSnapshot[] = [
  snap({
    status: '증액',
    eventDate: '2026-06-01',
    contractorName: '홍길동',
    org: 'A',
    deposit: 5_000_000,
    allowance: 800_000,
    allowancePayDay: 25,
    firstAllowancePayDate: '2026-04-25',
    contractDate: '2026-06-01',
    branch: '분당지점',
    manager: '이관리',
    recruiter: '한유치',
    payment: cardPayment(5_000_000),
    memo: '보증금 증액 및 수당 상향',
    documents: [
      {
        id: 'D1',
        kind: '계약서',
        fileName: '계약서_홍길동_20260601.pdf',
        driveFileId: 'drv_c1_2',
        driveViewUrl: '#',
        uploadedAt: '2026-06-01',
      },
    ],
  }),
  snap({
    status: '신규',
    eventDate: '2026-03-12',
    contractorName: '홍길동',
    org: 'A',
    deposit: 3_000_000,
    allowance: 500_000,
    contractDate: '2026-03-12',
    branch: '분당지점',
    manager: '이관리',
    recruiter: '한유치',
    payment: cardPayment(3_000_000),
    memo: '신규 계약',
    documents: [
      {
        id: 'D0',
        kind: '계약서',
        fileName: '계약서_홍길동_20260312.pdf',
        driveFileId: 'drv_c1_1',
        driveViewUrl: '#',
        uploadedAt: '2026-03-12',
      },
    ],
  }),
]

/** 현금 분할입금 계약 */
const c2History: ContractSnapshot[] = [
  snap({
    status: '신규',
    eventDate: '2026-05-20',
    contractorName: '김영수',
    org: 'B',
    deposit: 6_000_000,
    allowance: 700_000,
    allowancePayDay: 25,
    firstAllowancePayDate: '2026-06-25',
    contractDate: '2026-05-20',
    contractEndDate: '2027-05-19',
    branch: '수원지점',
    manager: '박관리',
    recruiter: '오유치',
    payment: cashPayment(6_000_000, 3),
    memo: '현금 3회 분할입금',
    documents: [
      {
        id: 'D2',
        kind: '현금입금증',
        fileName: '입금증_김영수_1회차.pdf',
        driveFileId: 'drv_c2_1',
        driveViewUrl: '#',
        uploadedAt: '2026-05-20',
      },
    ],
  }),
]

function simple(
  id: string,
  status: ContractSnapshotStatusInput,
): Contract {
  const s = snap(status)
  return { id, contractorId: id, current: s, history: [s] }
}

type ContractSnapshotStatusInput = Partial<ContractSnapshot>

export const MOCK_CONTRACTS: Contract[] = [
  { id: 'C001', contractorId: 'M001', current: c1History[0], history: c1History },
  { id: 'C002', contractorId: 'M002', current: c2History[0], history: c2History },
  simple('C003', {
    status: '양수',
    contractorName: '박지훈',
    org: 'A',
    deposit: 4_000_000,
    allowance: 600_000,
    contractDate: '2026-04-02',
    branch: '판교지점',
    manager: '최관리',
    recruiter: '서유치',
    eventDate: '2026-04-02',
  }),
  simple('C004', {
    status: '양도',
    contractorName: '이서연',
    org: 'B',
    deposit: 2_500_000,
    allowance: 400_000,
    contractDate: '2026-04-15',
    branch: '일산지점',
    manager: '김관리',
    recruiter: '문유치',
    eventDate: '2026-04-15',
    payment: cashPayment(2_500_000, 2),
  }),
  simple('C005', {
    status: '해지',
    contractorName: '정민호',
    org: 'A',
    deposit: 0,
    allowance: 0,
    contractDate: '2026-02-10',
    contractEndDate: '2026-06-30',
    branch: '강남지점',
    manager: '이관리',
    recruiter: '정유치',
    eventDate: '2026-06-30',
  }),
  simple('C006', {
    status: '신규',
    contractorName: '강수진',
    org: 'B',
    deposit: 3_500_000,
    allowance: 550_000,
    contractDate: '2026-06-18',
    branch: '수원지점',
    manager: '박관리',
    recruiter: '한유치',
    eventDate: '2026-06-18',
  }),
  simple('C007', {
    status: '폐기',
    contractorName: '윤태양',
    org: 'A',
    deposit: 0,
    allowance: 0,
    contractDate: '2026-01-08',
    branch: '분당지점',
    manager: '최관리',
    recruiter: '오유치',
    eventDate: '2026-05-02',
  }),
  simple('C008', {
    status: '신규',
    contractorName: '조은별',
    org: 'B',
    deposit: 4_200_000,
    allowance: 620_000,
    contractDate: '2026-06-27',
    branch: '판교지점',
    manager: '김관리',
    recruiter: '서유치',
    eventDate: '2026-06-27',
    payment: cardPayment(4_200_000),
  }),
]
