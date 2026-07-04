// DB 스키마 초기화 + (옵션) 샘플 시드
// 사용: node scripts/initDb.js         → 스키마만
//       node scripts/initDb.js --seed  → 스키마 + 샘플 계약 2건
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const { pool } = require('../db')
const repo = require('../contractRepo')

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8')
  await pool.query(sql)
  console.log('[initDb] 스키마 생성 완료')

  if (process.argv.includes('--seed')) {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM contracts')
    if (rows[0].c > 0) {
      console.log('[initDb] 이미 데이터가 있어 시드를 건너뜁니다.')
    } else {
      await repo.createContract({
        status: '신규',
        eventDate: '2026-05-20',
        org: 'A',
        contractorName: '김영수',
        contractType: 'LAS매장점주',
        contractDate: '2026-05-20',
        deposit: 6000000,
        allowance: 700000,
        allowancePayDay: 25,
        firstAllowancePayDate: '2026-06-25',
        contractEndDate: '2027-05-19',
        branch: '수원지점',
        manager: '박관리',
        recruiter: '오유치',
        bankName: '국민은행',
        accountNo: '123456-04-567890',
        residentNo: '900101-1******',
        phone: '010-1234-5678',
        memo: '현금 3회 분할입금',
        payment: {
          method: '현금',
          totalAmount: 6000000,
          cardInstallments: [],
          cashInstallments: [
            { seq: 1, amount: 2000000, approvalNo: 'CR90010', transactionDate: '2026-05-20', identifierType: '휴대폰', identifierNo: '010-1234-5678', merchantName: 'LAS 정산센터', merchantBizNo: '123-45-67890', bank: '국민은행', depositor: '김영수' },
            { seq: 2, amount: 2000000, approvalNo: 'CR90011', transactionDate: '2026-06-20', identifierType: '휴대폰', identifierNo: '010-1234-5678', merchantName: 'LAS 정산센터', merchantBizNo: '123-45-67890', bank: '국민은행', depositor: '김영수' },
            { seq: 3, amount: 2000000, approvalNo: 'CR90012', transactionDate: '2026-07-20', identifierType: '휴대폰', identifierNo: '010-1234-5678', merchantName: 'LAS 정산센터', merchantBizNo: '123-45-67890', bank: '국민은행', depositor: '김영수' },
          ],
        },
      })
      await repo.createContract({
        status: '신규',
        eventDate: '2026-03-12',
        org: 'B',
        contractorName: '홍길동',
        contractType: 'LAS-On파트장',
        contractDate: '2026-03-12',
        deposit: 3000000,
        allowance: 500000,
        allowancePayDay: 25,
        firstAllowancePayDate: '2026-04-25',
        contractEndDate: '2027-03-11',
        branch: '분당지점',
        manager: '이관리',
        recruiter: '한유치',
        bankName: '신한은행',
        accountNo: '110-234-567890',
        residentNo: '851212-1******',
        phone: '010-9876-5432',
        memo: '신규 계약',
        payment: {
          method: '카드',
          totalAmount: 3000000,
          cardInstallments: [
            { seq: 1, amount: 3000000, issuer: '신한카드', cardNumber: '1234-56**-****-7890', approvalNo: '30021456', terminalNo: 'CAT001982', serialNo: 'SN-77281', transactionDate: '2026-03-12' },
          ],
          cashInstallments: [],
        },
      })
      console.log('[initDb] 샘플 계약 2건 시드 완료')
    }
  }
  await pool.end()
}

main().catch((e) => {
  console.error('[initDb] 실패:', e.message)
  process.exit(1)
})
