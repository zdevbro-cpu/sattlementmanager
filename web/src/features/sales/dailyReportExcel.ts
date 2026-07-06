// 일일보고 엑셀 양식(web/public/A_카드 매출 일일 보고.xlsx) 채우기
// 템플릿을 불러와 해당 일자 매출을 행에 채운 뒤 다운로드/발송용 버퍼를 만든다.
import ExcelJS from 'exceljs'
import { EMPTY_SALES_FILTER, type Sale } from '../../types/sales'
import { listSales } from './salesStore'

const TEMPLATE_FILE = 'A_카드 매출 일일 보고.xlsx'
const TEMPLATE_URL = encodeURI('/' + TEMPLATE_FILE)
const DATA_START_ROW = 4 // R4부터 데이터 (R3=헤더)

/** 해당 일자 매출을 템플릿에 채운 Workbook 반환 */
export async function buildDailyReportWorkbook(
  date: string,
): Promise<{ wb: ExcelJS.Workbook; rows: Sale[] }> {
  const res = await fetch(TEMPLATE_URL)
  if (!res.ok) throw new Error('엑셀 양식(A_카드 매출 일일 보고.xlsx)을 불러올 수 없습니다.')
  const buf = await res.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  const ws = wb.worksheets[0]

  const all = await listSales(EMPTY_SALES_FILTER)
  const rows = all.filter((s) => s.date === date)

  // 제목에 보고일자 표기
  ws.getCell('A1').value = `A_카드 매출 일일 보고(교육사업부)   ·   ${date}`

  rows.forEach((s, i) => {
    const card = s.payment.cardInstallments[0]
    const cash = s.payment.cashInstallments[0]
    const row = ws.getRow(DATA_START_ROW + i)
    row.getCell(1).value = i + 1 // 번호
    row.getCell(2).value = s.date // 날짜
    row.getCell(3).value = card?.terminalNo || '' // CAT ID
    row.getCell(4).value = s.businessUnit // 사업부
    row.getCell(5).value = s.buyer // 구매자
    row.getCell(6).value = s.category // 내용
    row.getCell(7).value = s.payment.totalAmount // 금액
    row.getCell(8).value = card?.issuer || (cash ? '현금' : '') // 카드사
    row.getCell(9).value = card?.cardNumber || cash?.identifierNo || '' // 카드번호
    row.getCell(10).value = card?.approvalNo || cash?.approvalNo || '' // 승인번호
    row.getCell(11).value = s.manager // 담당
    row.commit?.()
  })

  return { wb, rows }
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** 채운 양식을 브라우저에서 다운로드 */
export async function downloadDailyReport(date: string): Promise<number> {
  const { wb, rows } = await buildDailyReportWorkbook(date)
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `A_카드매출일일보고_${date}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
  return rows.length
}

/** 채운 양식을 base64 + 건수로 반환 (이메일 발송용) */
export async function dailyReportAttachment(
  date: string,
): Promise<{ base64: string; filename: string; count: number }> {
  const { wb, rows } = await buildDailyReportWorkbook(date)
  const buf = await wb.xlsx.writeBuffer()
  return {
    base64: bufferToBase64(buf as ArrayBuffer),
    filename: `A_카드매출일일보고_${date}.xlsx`,
    count: rows.length,
  }
}
