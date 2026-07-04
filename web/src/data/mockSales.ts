import type { PaymentInfo } from '../types/contract'
import type { Sale } from '../types/sales'

export const BUSINESS_UNITS = ['교육선교위원회', '교육사업부', 'LAS-On', '구독']
export const SALES_MANAGERS = [
  '동백C/강장용',
  '강동/박명화',
  '진주/유외옥',
  '마포점/김수현',
  '청라/김수현',
  '신강/김미영',
]

interface CardOpts {
  amount: number
  issuer: string
  catId: string
  cardNumber: string
  approvalNo: string
  date: string
}

function card1(o: CardOpts): PaymentInfo {
  return {
    method: '카드',
    totalAmount: o.amount,
    cardInstallments: [
      {
        seq: 1,
        amount: o.amount,
        issuer: o.issuer,
        cardNumber: o.cardNumber,
        approvalNo: o.approvalNo,
        terminalNo: o.catId,
        serialNo: '',
        transactionDate: o.date,
      },
    ],
    cashInstallments: [],
  }
}

function cardSplit(items: CardOpts[]): PaymentInfo {
  return {
    method: '카드',
    totalAmount: items.reduce((a, b) => a + b.amount, 0),
    cardInstallments: items.map((o, i) => ({
      seq: i + 1,
      amount: o.amount,
      issuer: o.issuer,
      cardNumber: o.cardNumber,
      approvalNo: o.approvalNo,
      terminalNo: o.catId,
      serialNo: '',
      transactionDate: o.date,
    })),
    cashInstallments: [],
  }
}

function cash1(amount: number, date: string): PaymentInfo {
  return {
    method: '현금',
    totalAmount: amount,
    cardInstallments: [],
    cashInstallments: [
      {
        seq: 1,
        amount,
        approvalNo: '021120519',
        transactionDate: date,
        identifierType: '휴대폰',
        identifierNo: '010-****-8002',
        merchantName: 'LAS 매출',
        merchantBizNo: '123-45-67890',
        bank: '국민은행',
        depositor: '현금영수증',
      },
    ],
  }
}

const RAW: Omit<Sale, 'source'>[] = [
  {
    id: 'S001', date: '2026-07-04', category: '점주보증금', businessUnit: '교육선교위원회',
    buyer: '최미향', manager: '동백C/강장용', inputterOrg: '교육선교위원회', inputterName: '강장용',
    payment: card1({ amount: 7_000_000, issuer: '삼성카드', catId: '35181****1', cardNumber: '5188-3165-****-734*', approvalNo: '55243848', date: '2026-07-04' }),
    documents: [], verified: true, createdAt: '2026-07-04',
  },
  {
    id: 'S002', date: '2026-07-04', category: '구독회원 S2', businessUnit: '교육선교위원회',
    buyer: '김형희', manager: '동백C/강장용', inputterOrg: '교육선교위원회', inputterName: '강장용',
    payment: cardSplit([
      { amount: 1_100_000, issuer: 'KB국민카드', catId: '35181', cardNumber: '9445-4263-****-304*', approvalNo: '30028576', date: '2026-07-04' },
      { amount: 1_100_000, issuer: '현대카드', catId: '35181xxxx1', cardNumber: '5165-2601-****-504*', approvalNo: '00982907', date: '2026-07-04' },
    ]),
    documents: [], verified: true, createdAt: '2026-07-04',
  },
  {
    id: 'S003', date: '2026-07-04', category: '점주보증금', businessUnit: '교육선교위원회',
    buyer: '강신우', manager: '동백C/강장용', inputterOrg: '교육선교위원회', inputterName: '강장용',
    payment: cardSplit([
      { amount: 2_000_000, issuer: '하나카드', catId: '35181****1', cardNumber: '5531-7700-****-022*', approvalNo: '16246510', date: '2026-07-04' },
      { amount: 8_000_000, issuer: '롯데카드', catId: '35181****1', cardNumber: '5137-9200-****-045*', approvalNo: '55899225', date: '2026-07-04' },
    ]),
    documents: [], verified: true, createdAt: '2026-07-04',
  },
  {
    id: 'S004', date: '2026-07-03', category: 'LAS On 파트너', businessUnit: '교육사업부',
    buyer: '조한진', manager: '강동/박명화', inputterOrg: '교육사업부', inputterName: '박명화',
    payment: card1({ amount: 10_000_000, issuer: '하나카드', catId: '37817xxxx', cardNumber: '5181-8500-****-419*', approvalNo: '21060417', date: '2026-07-03' }),
    documents: [], verified: true, createdAt: '2026-07-03',
  },
  {
    id: 'S005', date: '2026-07-03', category: '구독회원 S2', businessUnit: '교육사업부',
    buyer: '조서영', manager: '마포점/김수현', inputterOrg: '교육사업부', inputterName: '김수현',
    payment: card1({ amount: 2_200_000, issuer: '삼성카드', catId: '3299869001', cardNumber: '9410-10**-****-5160', approvalNo: '71238298', date: '2026-07-03' }),
    documents: [], verified: false, createdAt: '2026-07-03',
  },
  {
    id: 'S006', date: '2026-07-03', category: '매장결제', businessUnit: '교육사업부',
    buyer: '최명기', manager: '동탄/이영', inputterOrg: '교육사업부', inputterName: '이영',
    payment: cash1(190_000, '2026-07-03'),
    documents: [], verified: false, createdAt: '2026-07-03',
  },
  {
    id: 'S007', date: '2026-07-02', category: '독서지도사', businessUnit: '교육사업부',
    buyer: '조민경', manager: '청라/김수현', inputterOrg: '교육사업부', inputterName: '김수현',
    payment: card1({ amount: 600_000, issuer: 'NH카드', catId: '3299869001', cardNumber: '5424-16**-****-3561', approvalNo: '40664674', date: '2026-07-02' }),
    documents: [], verified: true, createdAt: '2026-07-02',
  },
  {
    id: 'S008', date: '2026-07-02', category: 'LAS On 파트너', businessUnit: '교육사업부',
    buyer: '배명희', manager: '신강/김미영', inputterOrg: '교육사업부', inputterName: '김미영',
    payment: card1({ amount: 20_000_000, issuer: '우리카드', catId: '3299869001', cardNumber: '4693-69**-****-1485', approvalNo: '83980665', date: '2026-07-02' }),
    documents: [], verified: true, createdAt: '2026-07-02',
  },
]

export const MOCK_SALES: Sale[] = RAW.map((s) => ({ ...s, source: 'sale' }))
