// 목록 화면 공통 엑셀 다운로드 유틸 — 헤더/행 데이터를 받아 .xlsx로 즉시 다운로드한다.
import ExcelJS from 'exceljs'

export async function downloadListAsExcel(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
  boldRowIndexes?: number[],
  /** 천단위 콤마 자동 포맷을 적용할 열 번호(0-based) */
  moneyCols?: number[],
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('목록')
  ws.addRow(headers)
  ws.getRow(1).font = { bold: true }
  const bold = new Set(boldRowIndexes)
  const moneyColSet = new Set(moneyCols)
  rows.forEach((r, i) => {
    const row = ws.addRow(r)
    if (bold.has(i)) row.font = { bold: true }
    moneyColSet.forEach((c) => {
      const cell = row.getCell(c + 1)
      if (typeof cell.value === 'number') cell.numFmt = '#,##0'
    })
  })
  ws.columns.forEach((col) => {
    let max = 10
    col.eachCell?.({ includeEmpty: true }, (cell) => {
      const len = String(cell.value ?? '').length
      if (len > max) max = len
    })
    col.width = Math.min(max + 2, 40)
  })

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
