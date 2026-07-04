// 백엔드(Firebase Functions / Express) 호출 클라이언트.
// - OCR: lavenmanager POST /api/ocr (Gemini) 규격
// - Drive 업로드: contractmanager POST /api/contracts/:id/pdf (base64) 규격

/** 카드전표 OCR 결과 (type='sales') */
export interface CardOcrResult {
  amount?: string
  issuer?: string
  approvalNo?: string
  terminalNo?: string
  serialNo?: string
  cardNumber?: string
  transactionDate?: string
}

/** 현금영수증 OCR 결과 (type='cash_receipt') */
export interface CashOcrResult {
  amount?: string
  approvalNo?: string
  transactionDate?: string
  identifierType?: string
  identifierNo?: string
  merchantName?: string
  merchantBizNo?: string
}

/** 파일 → base64(dataURL 프리픽스 제거) */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/** 촬영/업로드 이미지 → OCR 정보추출 */
export async function ocrImage(
  file: File,
  type: 'sales' | 'cash_receipt',
): Promise<CardOcrResult | CashOcrResult> {
  const form = new FormData()
  form.append('photo', file)
  form.append('type', type)
  const res = await fetch('/api/ocr', { method: 'POST', body: form })
  if (!res.ok) throw new Error(`OCR 실패 (${res.status})`)
  const json = await res.json()
  return json.data ?? {}
}

/** 일일보고 엑셀을 이메일로 발송 (백엔드 nodemailer) */
export async function sendDailyReport(payload: {
  date: string
  emails: string[]
  filename: string
  xlsxBase64: string
  summaryHtml?: string
}): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/report/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return res.json().catch(() => ({ ok: false, error: '응답 파싱 실패' }))
}

/** 임용계약 제출서류(등본/신분증/통장/원천징수 등) → Google Drive 업로드 후 링크 반환 */
export async function uploadAppointmentDoc(
  appointmentRef: string,
  file: File,
  docType: string,
): Promise<{ driveFileId: string; driveViewUrl: string }> {
  const data = await fileToBase64(file)
  const res = await fetch(
    `/api/appointments/${encodeURIComponent(appointmentRef)}/document`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        data,
        mimeType: file.type || 'application/octet-stream',
        docType,
      }),
    },
  )
  if (!res.ok) throw new Error(`Drive 업로드 실패 (${res.status})`)
  const json = await res.json()
  return {
    driveFileId: json.driveFileId ?? '',
    driveViewUrl: json.driveViewUrl ?? '#',
  }
}

/** 계약서/전표/입금증 PDF·이미지 → Google Drive 업로드 후 링크 반환 */
export async function uploadToDrive(
  contractId: string,
  file: File,
  reason: string,
): Promise<{ driveFileId: string; driveViewUrl: string }> {
  const data = await fileToBase64(file)
  const res = await fetch(`/api/contracts/${contractId}/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      data,
      mimeType: file.type || 'application/pdf',
      reason,
    }),
  })
  if (!res.ok) throw new Error(`Drive 업로드 실패 (${res.status})`)
  const json = await res.json()
  return {
    driveFileId: json.driveFileId ?? '',
    driveViewUrl: json.driveViewUrl ?? '#',
  }
}
