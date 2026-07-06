// 직원 임용계약 실데이터(docs/직원 임용계약_.xlsx "보고서" 시트) → appointments 테이블 마이그레이션
// 사용: node scripts/migrateAppointments.js  (server/.env 기준 DB에 삽입)
require('dotenv').config()
const path = require('path')
const ExcelJS = require('exceljs')
const repo = require('../appointmentRepo')

const FILE = path.join(__dirname, '../../docs/직원 임용계약_.xlsx')

function iso(v) {
  if (!v) return ''
  const d = new Date(v)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

async function main() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(FILE)
  const sheet = wb.getWorksheet('보고서')

  let inserted = 0
  for (let r = 3; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const name = row.getCell(3).value
    if (!name) continue

    const contractDate = iso(row.getCell(8).value)
    await repo.createAppointment({
      contractNo: String(row.getCell(14).value || ''),
      name,
      typeName: '임용계약서(2026)',
      ref: row.getCell(1).value || '',
      residentNo: row.getCell(9).value || '',
      phone: row.getCell(10).value || '',
      position: row.getCell(2).value || '',
      salary: 0,
      activity: 0,
      insuranceType: '사업소득',
      contractDate,
      payoutDate: iso(row.getCell(5).value),
      workStartDate: iso(row.getCell(4).value),
      reportStartDate: iso(row.getCell(6).value),
      endDate: iso(row.getCell(7).value),
      bankName: row.getCell(11).value || '',
      accountNo: String(row.getCell(12).value || ''),
      accountOwner: row.getCell(13).value || '',
      status: '정상운영',
      createdAt: contractDate,
    })
    inserted++
  }
  console.log(`[migrateAppointments] ${inserted}건 삽입 완료`)
  process.exit(0)
}

main().catch((e) => {
  console.error('[migrateAppointments] 실패:', e.message)
  process.exit(1)
})
