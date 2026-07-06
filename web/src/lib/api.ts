// 백엔드(Firebase Functions / Express) 호출 클라이언트.
// - OCR: lavenmanager POST /api/ocr (Gemini) 규격
// - Drive 업로드: contractmanager POST /api/contracts/:id/pdf (base64) 규격
import type { Contract, ContractFilter, ContractSnapshot } from '../types/contract'
import type { Appointment, AppointmentFilter } from '../types/appointment'
import type { Sale, SalesFilter } from '../types/sales'
import type { ExtraPayee } from '../types/payout'

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

/** 촬영한 영수증/전표 원본 이미지 → Google Drive 업로드 (매출·계약 레코드 생성 전, OCR과 함께 호출) */
export async function uploadReceiptImage(
  file: File,
): Promise<{ driveFileId: string; driveViewUrl: string }> {
  const data = await fileToBase64(file)
  const res = await fetch('/api/drive/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      data,
      mimeType: file.type || 'image/jpeg',
    }),
  })
  if (!res.ok) throw new Error(`Drive 업로드 실패 (${res.status})`)
  const json = await res.json()
  return {
    driveFileId: json.driveFileId ?? '',
    driveViewUrl: json.driveViewUrl ?? '#',
  }
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

/** 매출 전표/입금증 → Google Drive 업로드 후 링크 반환 */
export async function uploadSaleDoc(
  saleId: string,
  file: File,
  kind: string,
): Promise<{ driveFileId: string; driveViewUrl: string }> {
  const data = await fileToBase64(file)
  const res = await fetch(`/api/sales/${encodeURIComponent(saleId)}/document`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      data,
      mimeType: file.type || 'application/octet-stream',
      kind,
    }),
  })
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

/* ══════════════════════════════════════════════════════════
 * 구조화 데이터 CRUD — 전부 Cloud SQL(PostgreSQL) 백엔드를 통해 조회/저장한다.
 * ══════════════════════════════════════════════════════════ */

function qs(params: Record<string, string | undefined>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v)
  const s = p.toString()
  return s ? `?${s}` : ''
}

async function getData<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`요청 실패 (${res.status})`)
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || '요청 실패')
  return json.data
}

async function sendJson<T>(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`요청 실패 (${res.status})`)
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || '요청 실패')
  return json.data
}

// ── 계약관리 ──────────────────────────────────────────────
export function fetchContracts(filter: ContractFilter): Promise<Contract[]> {
  return getData(
    `/api/contracts${qs({
      keyword: filter.keyword,
      status: filter.status,
      branch: filter.branch,
      manager: filter.manager,
      startDate: filter.contractDate,
      endDate: filter.contractEndDate,
      recruiter: filter.recruiter,
      org: filter.org,
    })}`,
  )
}
export function fetchContract(id: string): Promise<Contract> {
  return getData(`/api/contracts/${encodeURIComponent(id)}`)
}
export function createContractApi(snapshot: ContractSnapshot): Promise<Contract> {
  return sendJson('/api/contracts', 'POST', snapshot)
}
export function addContractHistoryApi(
  id: string,
  snapshot: ContractSnapshot,
): Promise<Contract> {
  return sendJson(`/api/contracts/${encodeURIComponent(id)}/history`, 'POST', snapshot)
}

// ── 조직관리(임용계약) ─────────────────────────────────────
export function fetchAppointments(filter: AppointmentFilter): Promise<Appointment[]> {
  return getData(
    `/api/appointments${qs({
      keyword: filter.keyword,
      startDate: filter.startDate,
      endDate: filter.endDate,
    })}`,
  )
}
export function fetchAppointment(id: string): Promise<Appointment> {
  return getData(`/api/appointments/${encodeURIComponent(id)}`)
}
export function createAppointmentApi(a: Omit<Appointment, 'id'>): Promise<Appointment> {
  return sendJson('/api/appointments', 'POST', a)
}
export function updateAppointmentApi(
  id: string,
  patch: Partial<Appointment>,
  meta: { memo: string; editedAt: string },
): Promise<Appointment> {
  return sendJson(`/api/appointments/${encodeURIComponent(id)}`, 'PATCH', {
    patch,
    ...meta,
  })
}
export async function nextAppointmentContractNo(dateISO: string): Promise<string> {
  return getData(`/api/appointments/next-contract-no${qs({ date: dateISO })}`)
}

// ── 매출관리 ──────────────────────────────────────────────
export function fetchSales(filter: SalesFilter): Promise<Sale[]> {
  return getData(
    `/api/sales${qs({
      startDate: filter.startDate,
      endDate: filter.endDate,
      category: filter.category,
      businessUnit: filter.businessUnit,
      buyer: filter.buyer,
      inputterOrg: filter.inputterOrg,
      inputterName: filter.inputterName,
    })}`,
  )
}
export function fetchSale(id: string): Promise<Sale> {
  return getData(`/api/sales/${encodeURIComponent(id)}`)
}
export function createSaleApi(s: Omit<Sale, 'id'>): Promise<Sale> {
  return sendJson('/api/sales', 'POST', s)
}
export function deleteSaleApi(id: string): Promise<void> {
  return sendJson(`/api/sales/${encodeURIComponent(id)}`, 'DELETE')
}

// ── 지급관리 · 추가지급 대상자 ───────────────────────────────
export function fetchExtraPayouts(): Promise<ExtraPayee[]> {
  return getData('/api/extra-payouts')
}
export function createExtraPayoutApi(p: Omit<ExtraPayee, 'id'>): Promise<ExtraPayee> {
  return sendJson('/api/extra-payouts', 'POST', p)
}
export function deleteExtraPayoutApi(id: string): Promise<void> {
  return sendJson(`/api/extra-payouts/${encodeURIComponent(id)}`, 'DELETE')
}
