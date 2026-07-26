import type { Shipment } from '../../types/delivery'

/** HTML 삽입 전 이스케이프 — 인쇄 화면에 사용자 입력(수령인/주소 등)이 그대로 들어가므로 반드시 거친다 */
function esc(v: string): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function cardHtml(s: Shipment): string {
  const books = [s.book1Name, s.book2Name].filter(Boolean).map(esc).join(', ') || '-'
  return `
    <div class="card">
      <div class="card-title">배송 정보</div>
      <table>
        <tr><th>수령인</th><td>${esc(s.recipientName || '-')}</td></tr>
        <tr><th>연락처</th><td>${esc(s.phone || '-')}</td></tr>
        <tr><th>주소</th><td>${esc(s.address || '-')}</td></tr>
        <tr><th>배송메모</th><td>${esc(s.deliveryMemo || '-')}</td></tr>
        <tr><th>교재</th><td>${books}</td></tr>
        <tr><th>배송번호</th><td>${esc(s.id)}</td></tr>
      </table>
    </div>`
}

/** 선택한 배송건을 A4 용지에 4분할로 배치해 새 창에서 인쇄한다 (브라우저 window.print 방식) */
export function printShipments(shipments: Shipment[]): void {
  const win = window.open('', '_blank')
  if (!win) return

  const pages: string[] = []
  for (let i = 0; i < shipments.length; i += 4) {
    const group = shipments.slice(i, i + 4)
    const cells = group.map(cardHtml).join('')
    const filler = '<div class="card card-empty"></div>'.repeat(4 - group.length)
    pages.push(`<div class="page">${cells}${filler}</div>`)
  }

  win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>배송 정보 인쇄</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Malgun Gothic', sans-serif; margin: 0; }
  .page {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 6mm;
    width: 190mm;
    height: 277mm;
    page-break-after: always;
  }
  .card { border: 1px solid #333; border-radius: 4px; padding: 6mm; overflow: hidden; }
  .card-empty { border: none; }
  .card-title { font-size: 13px; font-weight: 700; margin-bottom: 4mm; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { width: 22mm; text-align: left; color: #555; padding: 2px 4px; vertical-align: top; white-space: nowrap; }
  td { padding: 2px 4px; vertical-align: top; word-break: break-all; }
</style>
</head>
<body>
${pages.join('')}
</body>
</html>`)
  win.document.close()
  win.focus()
  win.onload = () => {
    win.print()
    win.close()
  }
}
