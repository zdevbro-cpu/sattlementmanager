// 라스온(파트장,파트너) 계약현황 엑셀 — public/라스온 파트장 파트너 계약현황.xlsx 양식 채우기.
// 카드/현금 분할결재는 매출관리 엑셀다운로드(dailyReportExcel.ts)와 동일한 규칙을 적용한다 —
// 합계행(번호 있음, 굵게) + 회차별 상세행으로 펼치되, 일일매출보고와 동일하게 번호·계약일자·이름·
// 주민번호·구분·유치자·계좌정보·비고는 회차행에도 그대로 반복해서 채운다(빈칸으로 남기지 않는다).
import ExcelJS from 'exceljs'
import type { Contract } from '../../types/contract'
import { dateText } from '../../lib/format'

const TEMPLATE_FILE = '라스온 파트장 파트너 계약현황.xlsx'
const TEMPLATE_URL = encodeURI('/' + TEMPLATE_FILE)
const DATA_START_ROW = 7 // R7부터 데이터 (R5~R6=헤더)
const TEMPLATE_DATA_ROWS = 94 // R7~R100
const COL_COUNT = 18
const OUTER_BORDER: ExcelJS.BorderStyle = 'medium' // 표 전체(헤더~마지막 행) 외곽선 — 한 단계 굵은 실선

export interface LasOnRow {
  no: number
  c: Contract
  isLeader: boolean
}

interface Leg {
  method: '카드' | '현금'
  amount: number
  issuer: string
  approvalNo: string
  terminalNo: string
  bank: string // 입금은행 (현금 전용)
}

function toLegs(c: Contract): Leg[] {
  const p = c.current.payment
  const legs: Leg[] = [
    ...p.cardInstallments.map((i) => ({
      method: '카드' as const,
      amount: i.amount,
      issuer: i.issuer || '',
      approvalNo: i.approvalNo || '',
      terminalNo: i.terminalNo || '',
      bank: '',
    })),
    ...p.cashInstallments.map((i) => ({
      method: '현금' as const,
      amount: i.amount,
      issuer: '',
      approvalNo: i.approvalNo || '',
      terminalNo: '',
      bank: i.bank || '',
    })),
  ]
  if (legs.length > 0) return legs
  return [
    {
      method: p.method === '현금' ? '현금' : '카드',
      amount: p.totalAmount,
      issuer: '',
      approvalNo: '',
      terminalNo: '',
      bank: '',
    },
  ]
}

interface PlanRow {
  no: number
  contractDate: string
  contractorName: string
  residentNo: string
  isLeader: boolean
  cashAmount: number
  cardAmount: number
  issuer?: string
  approvalNo?: string
  terminalNo?: string
  depositBank?: string
  recruiter: string
  bankName: string
  accountNo: string
  accountOwner: string
  memo: string
  bold?: boolean
}

function buildPlan(rows: LasOnRow[]): PlanRow[] {
  const plan: PlanRow[] = []
  rows.forEach((r) => {
    const s = r.c.current
    const legs = toLegs(r.c)
    // 번호·계약일자·이름·주민번호·구분·유치자·계좌정보·비고 — 회차행에도 동일하게 반복 (일일매출보고와 동일 규칙)
    const common = {
      no: r.no,
      contractDate: dateText(s.contractDate),
      contractorName: s.contractorName,
      residentNo: s.residentNo,
      isLeader: r.isLeader,
      recruiter: s.recruiter,
      bankName: s.bankName,
      accountNo: s.accountNo,
      accountOwner: s.accountOwner,
      memo: s.memo || '',
    }

    if (legs.length <= 1) {
      const only = legs[0]
      plan.push({
        ...common,
        cashAmount: only?.method === '현금' ? only.amount : 0,
        cardAmount: only?.method === '카드' ? only.amount : 0,
        issuer: only?.issuer || '',
        approvalNo: only?.approvalNo || '',
        terminalNo: only?.terminalNo || '',
        depositBank: only?.bank || '',
      })
      return
    }

    plan.push({
      ...common,
      cashAmount: legs.filter((l) => l.method === '현금').reduce((a, l) => a + l.amount, 0),
      cardAmount: legs.filter((l) => l.method === '카드').reduce((a, l) => a + l.amount, 0),
      bold: true,
    })
    legs.forEach((leg) => {
      plan.push({
        ...common,
        cashAmount: leg.method === '현금' ? leg.amount : 0,
        cardAmount: leg.method === '카드' ? leg.amount : 0,
        issuer: leg.issuer,
        approvalNo: leg.approvalNo,
        terminalNo: leg.terminalNo,
        depositBank: leg.bank,
      })
    })
  })
  return plan
}

function resizeToPlan(ws: ExcelJS.Worksheet, total: number): void {
  const templateLastRow = DATA_START_ROW + TEMPLATE_DATA_ROWS - 1
  if (total > TEMPLATE_DATA_ROWS) {
    ws.duplicateRow(templateLastRow, total - TEMPLATE_DATA_ROWS, true)
  }
  const keepThrough = DATA_START_ROW + Math.max(total, 1) - 1
  if (ws.rowCount > keepThrough) {
    // eslint-disable-next-line no-underscore-dangle
    ;(ws as unknown as { _rows: unknown[] })._rows.length = keepThrough
  }
}

export async function downloadLasOnStatusReport(rows: LasOnRow[], businessUnitLabel: string): Promise<void> {
  const res = await fetch(TEMPLATE_URL)
  if (!res.ok) throw new Error(`엑셀 양식(${TEMPLATE_FILE})을 불러올 수 없습니다.`)
  const buf = await res.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  const ws = wb.worksheets[0]
  ws.getCell('A4').value = `사업부 : ${businessUnitLabel}`

  const plan = buildPlan(rows)
  resizeToPlan(ws, plan.length)

  const lastDataRow = DATA_START_ROW + Math.max(plan.length, 1) - 1

  plan.forEach((p, i) => {
    const row = ws.getRow(DATA_START_ROW + i)
    const isGroupStart = i === 0 || plan[i - 1].no !== p.no
    const isGroupEnd = i === plan.length - 1 || plan[i + 1].no !== p.no
    const isTableStart = i === 0
    const isTableEnd = i === plan.length - 1

    row.getCell(1).value = p.no
    row.getCell(2).value = p.contractDate
    row.getCell(3).value = p.contractorName
    row.getCell(4).value = p.residentNo
    row.getCell(5).value = p.isLeader ? p.contractorName : ''
    row.getCell(6).value = p.isLeader ? '' : p.contractorName
    const total = p.cashAmount + p.cardAmount
    row.getCell(7).value = total
    row.getCell(8).value = p.cashAmount || ''
    row.getCell(9).value = p.cardAmount || ''
    row.getCell(10).value = p.issuer ?? ''
    row.getCell(11).value = p.approvalNo ?? ''
    row.getCell(12).value = p.terminalNo ?? ''
    row.getCell(13).value = p.depositBank ?? ''
    // 유치자는 예금주 오른쪽(17열) — 템플릿 헤더 순서와 동일하게 맞춘다
    row.getCell(14).value = p.bankName
    row.getCell(15).value = p.accountNo
    row.getCell(16).value = p.accountOwner
    row.getCell(17).value = p.recruiter
    row.getCell(18).value = p.memo

    for (let c = 1; c <= COL_COUNT; c++) {
      const cell = row.getCell(c)
      const originalNumFmt = cell.numFmt
      // ExcelJS는 alignment/font/border를 각각 별도로 대입하면 행이 많을 때 스타일 테이블이
      // 내부적으로 어긋나는 버그가 있다 — 반드시 style 객체 하나로 한 번에 대입해야 안전하다.
      cell.style = {
        font: { ...cell.font, bold: !!p.bold },
        alignment: { horizontal: 'center', vertical: 'middle' },
        numFmt: [7, 8, 9].includes(c) ? '#,##0' : originalNumFmt,
        border: {
          top: { style: isTableStart ? OUTER_BORDER : isGroupStart ? 'double' : 'dotted' },
          bottom: { style: isTableEnd ? OUTER_BORDER : isGroupEnd ? 'double' : 'dotted' },
          left: { style: c === 1 ? OUTER_BORDER : 'thin' },
          right: { style: c === COL_COUNT ? OUTER_BORDER : 'thin' },
        },
      }
    }
    row.commit?.()
  })

  // 표 외곽(헤더 5행부터 데이터 마지막 행까지) 좌우 변을 한 단계 굵은 실선으로 통일
  for (let r = 5; r <= lastDataRow; r++) {
    const left = ws.getRow(r).getCell(1)
    left.border = { ...left.border, left: { style: OUTER_BORDER } }
    const right = ws.getRow(r).getCell(COL_COUNT)
    right.border = { ...right.border, right: { style: OUTER_BORDER } }
  }

  const outBuf = await wb.xlsx.writeBuffer()
  const blob = new Blob([outBuf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `라스온현황_${businessUnitLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
