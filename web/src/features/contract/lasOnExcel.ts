// 라스온(파트장,파트너) 계약현황 엑셀 — docs/양식_라스온 파트장 파트너 계약현황.xlsx 양식 채우기.
// 카드/현금 분할결재는 매출관리 엑셀다운로드(dailyReportExcel.ts)와 동일한 규칙을 적용한다 —
// 합계행(번호 있음, 굵게) + 회차별 상세행(번호 없음)으로 펼친다.
import ExcelJS from 'exceljs'
import type { Contract } from '../../types/contract'
import { dateText } from '../../lib/format'

const TEMPLATE_FILE = '라스온 파트장 파트너 계약현황.xlsx'
const TEMPLATE_URL = encodeURI('/' + TEMPLATE_FILE)
const DATA_START_ROW = 7 // R7부터 데이터 (R5~R6=헤더)
const TEMPLATE_DATA_ROWS = 96 // R7~R102

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
  no: number | null // null = 분할결제 회차행(번호 없음)
  contractDate?: string
  contractorName?: string
  residentNo?: string
  isLeader?: boolean
  cashAmount: number
  cardAmount: number
  issuer?: string
  approvalNo?: string
  terminalNo?: string
  depositBank?: string
  recruiter?: string
  bankName?: string
  accountNo?: string
  accountOwner?: string
  memo?: string
  bold?: boolean
}

function buildPlan(rows: LasOnRow[]): PlanRow[] {
  const plan: PlanRow[] = []
  rows.forEach((r) => {
    const s = r.c.current
    const legs = toLegs(r.c)

    if (legs.length <= 1) {
      const only = legs[0]
      plan.push({
        no: r.no,
        contractDate: dateText(s.contractDate),
        contractorName: s.contractorName,
        residentNo: s.residentNo,
        isLeader: r.isLeader,
        cashAmount: only?.method === '현금' ? only.amount : 0,
        cardAmount: only?.method === '카드' ? only.amount : 0,
        issuer: only?.issuer || '',
        approvalNo: only?.approvalNo || '',
        terminalNo: only?.terminalNo || '',
        depositBank: only?.bank || '',
        recruiter: s.recruiter,
        bankName: s.bankName,
        accountNo: s.accountNo,
        accountOwner: s.accountOwner,
        memo: s.memo || '',
      })
      return
    }

    plan.push({
      no: r.no,
      contractDate: dateText(s.contractDate),
      contractorName: s.contractorName,
      residentNo: s.residentNo,
      isLeader: r.isLeader,
      cashAmount: legs.filter((l) => l.method === '현금').reduce((a, l) => a + l.amount, 0),
      cardAmount: legs.filter((l) => l.method === '카드').reduce((a, l) => a + l.amount, 0),
      recruiter: s.recruiter,
      bankName: s.bankName,
      accountNo: s.accountNo,
      accountOwner: s.accountOwner,
      memo: s.memo || '',
      bold: true,
    })
    legs.forEach((leg) => {
      plan.push({
        no: null,
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
  const keepThrough = DATA_START_ROW + total - 1
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

  plan.forEach((p, i) => {
    const row = ws.getRow(DATA_START_ROW + i)
    row.getCell(1).value = p.no
    if (p.contractDate !== undefined) row.getCell(2).value = p.contractDate
    if (p.contractorName !== undefined) row.getCell(3).value = p.contractorName
    if (p.residentNo !== undefined) row.getCell(4).value = p.residentNo
    if (p.isLeader !== undefined) {
      row.getCell(5).value = p.isLeader ? p.contractorName ?? '' : ''
      row.getCell(6).value = p.isLeader ? '' : p.contractorName ?? ''
    }
    const total = p.cashAmount + p.cardAmount
    row.getCell(7).value = total
    row.getCell(7).numFmt = '#,##0'
    row.getCell(8).value = p.cashAmount || ''
    if (p.cashAmount) row.getCell(8).numFmt = '#,##0'
    row.getCell(9).value = p.cardAmount || ''
    if (p.cardAmount) row.getCell(9).numFmt = '#,##0'
    row.getCell(10).value = p.issuer ?? ''
    row.getCell(11).value = p.approvalNo ?? ''
    row.getCell(12).value = p.terminalNo ?? ''
    row.getCell(13).value = p.depositBank ?? ''
    if (p.recruiter !== undefined) row.getCell(14).value = p.recruiter
    if (p.bankName !== undefined) row.getCell(15).value = p.bankName
    if (p.accountNo !== undefined) row.getCell(16).value = p.accountNo
    if (p.accountOwner !== undefined) row.getCell(17).value = p.accountOwner
    if (p.memo !== undefined) row.getCell(18).value = p.memo
    if (p.bold) {
      // 주의: row.font = {...}는 템플릿에서 여러 행이 공유하는 스타일 객체를 그대로 변경(mutate)해
      // 손대지 않은 다른 행의 글꼴까지 깨뜨린다. 셀마다 기존 font를 복사한 새 객체로 교체해야 안전하다.
      for (let c = 1; c <= 18; c++) {
        const cell = row.getCell(c)
        cell.font = { ...cell.font, bold: true }
      }
    }
    row.commit?.()
  })

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
