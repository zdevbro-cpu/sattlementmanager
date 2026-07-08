// 일일보고 엑셀 양식(web/public/매출 일일 보고.xlsx) 채우기
// 템플릿을 불러와 매출을 채운다 — 분할결제는 합계행 + 회차별행으로 펼친다.
// 헤더: 번호 / 날짜 / 결재구분 / CAT ID / 사업부 / 구매자 / 내용 / 금액 / 카드사 / 카드번호 / 승인번호 / 담당
import ExcelJS from 'exceljs'
import { EMPTY_SALES_FILTER, type Sale } from '../../types/sales'
import { listSales } from './salesStore'

const TEMPLATE_FILE = '매출 일일 보고.xlsx'
const TEMPLATE_URL = encodeURI('/' + TEMPLATE_FILE)
const DATA_START_ROW = 4 // R4부터 데이터 (R3=헤더)

async function loadTemplate(): Promise<ExcelJS.Workbook> {
  const res = await fetch(TEMPLATE_URL)
  if (!res.ok) throw new Error(`엑셀 양식(${TEMPLATE_FILE})을 불러올 수 없습니다.`)
  const buf = await res.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  return wb
}

interface Leg {
  method: '카드' | '현금'
  amount: number
  issuer: string
  cardNumber: string
  approvalNo: string
  terminalNo: string
}

/** 매출 1건 → 결제 회차(카드/현금) 단위로 펼침. 분할결제 시 회차마다 1건씩 반환 */
function toLegs(s: Sale): Leg[] {
  const legs: Leg[] = [
    ...s.payment.cardInstallments.map((c) => ({
      method: '카드' as const,
      amount: c.amount,
      issuer: c.issuer || '',
      cardNumber: c.cardNumber || '',
      approvalNo: c.approvalNo || '',
      terminalNo: c.terminalNo || '',
    })),
    ...s.payment.cashInstallments.map((c) => ({
      method: '현금' as const,
      amount: c.amount,
      issuer: c.bank || '', // 카드사/입금은행 컬럼 ← 입금은행명
      cardNumber: c.identifierNo || '',
      approvalNo: c.depositor || '', // 승인번호 컬럼 ← 입금자명
      terminalNo: '',
    })),
  ]
  if (legs.length > 0) return legs
  return [
    {
      method: s.payment.method === '현금' ? '현금' : '카드',
      amount: s.payment.totalAmount,
      issuer: '',
      cardNumber: '',
      approvalNo: '',
      terminalNo: '',
    },
  ]
}

interface PlanRow {
  no: number | null // null = 분할결제 회차행(번호 없음)
  date?: string
  method?: string // 결재구분(카드/현금/카드+현금)
  terminalNo?: string
  businessUnit?: string
  buyer?: string
  category?: string
  amount: number
  issuer?: string
  cardNumber?: string
  approvalNo?: string
  manager?: string
  bold?: boolean
}

/** 매출 목록 → 출력행 계획. 단건은 1행, 분할결제는 합계행(번호 있음, 굵게) + 회차행(번호 없음)으로 펼친다. */
function buildPlan(sales: Sale[]): PlanRow[] {
  const plan: PlanRow[] = []
  let no = 0
  sales.forEach((s) => {
    const legs = toLegs(s)
    no++

    if (legs.length <= 1) {
      const only = legs[0]
      plan.push({
        no,
        date: s.date,
        method: only?.method || '',
        terminalNo: only?.terminalNo || '',
        businessUnit: s.businessUnit,
        buyer: s.buyer,
        category: s.category,
        amount: s.payment.totalAmount,
        issuer: only?.issuer || '',
        cardNumber: only?.cardNumber || '',
        approvalNo: only?.approvalNo || '',
        manager: s.manager,
      })
      return
    }

    const hasCard = legs.some((l) => l.method === '카드')
    const hasCash = legs.some((l) => l.method === '현금')
    const summaryMethod = hasCard && hasCash ? '카드+현금' : hasCard ? '카드' : '현금'

    plan.push({
      no,
      date: s.date,
      method: summaryMethod,
      businessUnit: s.businessUnit,
      buyer: s.buyer,
      category: s.category,
      amount: s.payment.totalAmount,
      manager: s.manager,
      bold: true,
    })
    legs.forEach((leg) => {
      plan.push({
        no: null,
        method: leg.method,
        terminalNo: leg.terminalNo,
        amount: leg.amount,
        issuer: leg.issuer,
        cardNumber: leg.cardNumber,
        approvalNo: leg.approvalNo,
      })
    })
  })
  return plan
}

/** 템플릿이 미리 갖춘, 테두리 서식이 있는 데이터 행 수 (R4~R100 = 97행) */
const TEMPLATE_DATA_ROWS = 97

/**
 * 실제 필요한 행 수에 맞춰 템플릿 행을 늘리거나(서식 복제) 줄인다(초과분 삭제).
 * ExcelJS의 spliceRows는 "삭제 범위가 시트 끝까지 이어지는" 경우 아무 것도 지우지 못하는
 * 버그가 있어(내부 nKeep > nEnd 케이스 무시), 꼬리 행 제거는 내부 배열 길이를 직접 자른다.
 */
function resizeToPlan(ws: ExcelJS.Worksheet, total: number): void {
  const templateLastRow = DATA_START_ROW + TEMPLATE_DATA_ROWS - 1 // R100

  if (total > TEMPLATE_DATA_ROWS) {
    ws.duplicateRow(templateLastRow, total - TEMPLATE_DATA_ROWS, true)
  }

  const keepThrough = DATA_START_ROW + total - 1
  if (ws.rowCount > keepThrough) {
    // eslint-disable-next-line no-underscore-dangle
    ;(ws as unknown as { _rows: unknown[] })._rows.length = keepThrough
  }
}

/**
 * 매출 목록을 템플릿 시트에 채운다. 번호는 거래 단위 일련번호로 새로 생성하고,
 * 분할결제 회차행은 번호를 비운다. 데이터 행 수에 맞춰 템플릿 서식을 유지한 채 나머지 행은 삭제한다.
 */
function fillRows(ws: ExcelJS.Worksheet, sales: Sale[]): number {
  const plan = buildPlan(sales)
  resizeToPlan(ws, plan.length)

  plan.forEach((p, i) => {
    const row = ws.getRow(DATA_START_ROW + i)
    row.getCell(1).value = p.no
    if (p.date !== undefined) row.getCell(2).value = p.date
    row.getCell(3).value = p.method ?? ''
    row.getCell(4).value = p.terminalNo ?? ''
    if (p.businessUnit !== undefined) row.getCell(5).value = p.businessUnit
    if (p.buyer !== undefined) row.getCell(6).value = p.buyer
    if (p.category !== undefined) row.getCell(7).value = p.category
    row.getCell(8).value = p.amount
    row.getCell(8).numFmt = '#,##0'
    row.getCell(9).value = p.issuer ?? ''
    row.getCell(10).value = p.cardNumber ?? ''
    row.getCell(11).value = p.approvalNo ?? ''
    if (p.manager !== undefined) row.getCell(12).value = p.manager
    if (p.bold) {
      // 주의: row.font = {...}는 템플릿에서 여러 행이 공유하는 스타일 객체를 그대로 변경(mutate)해
      // 손대지 않은 다른 행의 글꼴까지 깨뜨린다. 셀마다 기존 font를 복사한 새 객체로 교체해야 안전하다.
      for (let c = 1; c <= 12; c++) {
        const cell = row.getCell(c)
        cell.font = { ...cell.font, bold: true }
      }
    }
    row.commit?.()
  })

  return plan.length
}

/** 해당 일자 매출을 템플릿에 채운 Workbook 반환 */
export async function buildDailyReportWorkbook(
  date: string,
): Promise<{ wb: ExcelJS.Workbook; rows: Sale[] }> {
  const wb = await loadTemplate()
  const ws = wb.worksheets[0]
  const all = await listSales(EMPTY_SALES_FILTER)
  // 등록일(createdAt) 기준 집계 — 그날 등록된 매출(직접등록 + 계약 보증금 연동)을 모두 포함
  const rows = all.filter((s) => (s.createdAt ?? '').slice(0, 10) === date)

  ws.getCell('A1').value = `매출 일일 보고(교육사업부)   ·   ${date}`
  fillRows(ws, rows)

  return { wb, rows }
}

/** 매출관리 목록(현재 필터된 매출)을 동일 양식으로 엑셀 다운로드 */
export async function downloadSalesListReport(sales: Sale[], label: string): Promise<void> {
  const wb = await loadTemplate()
  const ws = wb.worksheets[0]
  ws.name = '매출일일보고' // 시트 탭 명칭
  ws.getCell('A1').value = `매출 일일 보고(교육사업부)   ·   ${label}`
  fillRows(ws, sales)

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `매출목록_${label}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
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
  a.download = `매출일일보고_${date}.xlsx`
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
    filename: `매출일일보고_${date}.xlsx`,
    count: rows.length,
  }
}
