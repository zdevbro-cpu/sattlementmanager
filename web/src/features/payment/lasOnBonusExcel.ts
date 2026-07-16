// LAS-On 수당지급(유치보너스) 엑셀 다운로드 — 템플릿(web/public/양식_라스온 파트너 유치 보너스.xlsx) 사용.
// 헤더(3~5행 병합): 연번 / 입금일 / 신규 계약자 / 유치자 / 보증금 합계 / 입금내역(현금, 카드(금액,카드사,승인번호))
//                  / 수당기준금액(단일, 보증금과 동일) / 수령인 / 보너스비율(%) / 보너스금액(원) / 세금(3.3%)
//                  / 실지급액 / 은행 / 계좌번호 / 예금주 / 주민번호 / 비고
import ExcelJS from 'exceljs'
import type { LasOnBonusRow } from './lasOnBonusEngine'

const TEMPLATE_FILE = '양식_라스온 파트너 유치 보너스.xlsx'
const TEMPLATE_URL = encodeURI('/' + TEMPLATE_FILE)
const DATA_START_ROW = 6 // R6부터 데이터 (R1=제목, R3~R5=헤더)
const TEMPLATE_DATA_ROWS = 36 // 템플릿이 미리 갖춘 서식 있는 데이터 행 수 (R6~R41)

async function loadTemplate(): Promise<ExcelJS.Workbook> {
  const res = await fetch(TEMPLATE_URL)
  if (!res.ok) throw new Error(`엑셀 양식(${TEMPLATE_FILE})을 불러올 수 없습니다.`)
  const buf = await res.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  return wb
}

/**
 * 실제 필요한 행 수에 맞춰 템플릿 행을 늘리거나(서식 복제) 줄인다(초과분 삭제).
 * ExcelJS의 spliceRows는 "삭제 범위가 시트 끝까지 이어지는" 경우 아무 것도 지우지 못하는
 * 버그가 있어(내부 nKeep > nEnd 케이스 무시), 꼬리 행 제거는 내부 배열 길이를 직접 자른다.
 */
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

/** rows(합계행+회차행 펼침 완료된 계획)를 템플릿에 채워 다운로드한다 */
export async function downloadLasOnBonusReport(rows: LasOnBonusRow[], label: string): Promise<void> {
  const wb = await loadTemplate()
  const ws = wb.worksheets[0]

  ws.getCell('A1').value = `${label} 라스온 파트너 유치 보너스`
  resizeToPlan(ws, rows.length)

  // 목록(헤더+데이터) 전체를 감싸는 바깥 테두리를 동일한 굵기(medium — thick보다 한 단계 얇게)로
  // 통일한다. 2행(제목과 목록 사이 빈 행)은 테두리를 주지 않고, 헤더 3행 윗줄을 목록 상단
  // 테두리로 삼는다. 헤더 영역은 열(A/T)이 병합돼 있어 병합 앵커 셀에만 좌우 테두리를 설정한다.
  const OUTER_BORDER = 'medium' as const
  for (let c = 1; c <= 20; c++) {
    const cell = ws.getCell(3, c)
    cell.border = { ...cell.border, top: { style: OUTER_BORDER } }
  }
  ws.getCell('A3').border = { ...ws.getCell('A3').border, left: { style: OUTER_BORDER } }
  ws.getCell('T3').border = { ...ws.getCell('T3').border, right: { style: OUTER_BORDER } }

  // 템플릿 행마다 정렬이 제각각이라 컬럼별로 정렬을 명시적으로 통일한다.
  const CENTER_COLS = new Set([1, 2, 8, 9, 12, 19])
  const RIGHT_COLS = new Set([5, 6, 7, 10, 13, 14, 15])
  const NUM_COLS = new Set([5, 6, 7, 10, 13, 14, 15])

  rows.forEach((r, i) => {
    const row = ws.getRow(DATA_START_ROW + i)
    const values = [
      r.no, r.depositDate, r.contractorName, r.recruiter, r.depositTotal,
      r.cashAmount || '', r.cardAmount || '', r.cardIssuer || '', r.approvalNo || '',
      r.baseAmount, r.recipientName, r.bonusRate / 100, r.bonusAmount, r.tax, r.netAmount,
      r.bankName, r.accountNo, r.accountOwner, r.residentNo, r.memo,
    ]
    const isGroupStart = i === 0 || rows[i - 1].no !== r.no
    const isGroupEnd = i === rows.length - 1 || rows[i + 1].no !== r.no

    // 주의: alignment/font/border를 셀마다 따로따로(cell.alignment=…, cell.font=…, cell.border=…)
    // 나눠서 지정하면 ExcelJS가 내부적으로 스타일을 잘못 병합/공유하는 현상이 확인되어(재현·검증 완료),
    // 반드시 style 전체를 한 번에 새 객체로 교체한다. 원본 서식(테두리·서식)은 value 대입 전에
    // 미리 캡처해둔다 — value 대입 이후에 읽으면 ExcelJS가 초기화한 상태를 읽어올 수 있다.
    for (let c = 1; c <= 20; c++) {
      const cell = row.getCell(c)
      const originalNumFmt = cell.numFmt
      cell.value = values[c - 1]
      const horizontal = CENTER_COLS.has(c) ? 'center' : RIGHT_COLS.has(c) ? 'right' : 'left'
      const isTableStart = i === 0
      const isTableEnd = i === rows.length - 1
      cell.style = {
        font: { ...cell.font, bold: !!r.bold },
        alignment: { vertical: 'middle', horizontal },
        border: {
          // 표 전체 바깥 테두리(맨 아래/좌우)는 헤더 상단과 동일한 굵기로,
          // 그 외 연번 그룹 경계는 기존대로 이중실선/점선으로 표시한다.
          top: { style: isTableStart ? OUTER_BORDER : isGroupStart ? 'double' : 'dotted' },
          bottom: { style: isTableEnd ? OUTER_BORDER : isGroupEnd ? 'double' : 'dotted' },
          ...(c === 1 ? { left: { style: OUTER_BORDER } } : {}),
          ...(c === 20 ? { right: { style: OUTER_BORDER } } : {}),
        },
        numFmt: NUM_COLS.has(c) ? '#,##0' : c === 12 ? '0%' : originalNumFmt,
      }
    }
    row.commit?.()
  })

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `LAS-On수당지급_${label}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
