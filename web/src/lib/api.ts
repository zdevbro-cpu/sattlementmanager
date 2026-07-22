// 백엔드(Firebase Functions / Express) 호출 클라이언트.
// - OCR: POST /api/ocr (Gemini) 규격
// - Drive 업로드: contractmanager POST /api/contracts/:id/pdf (base64) 규격
import type { Contract, ContractFilter, ContractSnapshot } from '../types/contract'
import type { Appointment, AppointmentFilter } from '../types/appointment'
import type { Sale, SalesFilter } from '../types/sales'
import type { ExtraPayee } from '../types/payout'
import type { TextbookApplication, TextbookApplicationFilter } from '../types/textbook'
import type { RecruitmentLog, Store, StoreFilter } from '../types/store'
import type { Staff, StaffRequest } from '../types/staff'

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

/** 교재구매 신청서(수기) OCR 결과 (type='textbook_application') */
export interface TextbookOcrResult {
  applyDate?: string
  buyerName?: string
  childName?: string
  childBirthdate?: string
  phone?: string
  address?: string
  deliveryMemo?: string
  book1Name?: string
  book2Name?: string
  subscriptionType?: string
  managementType?: string
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
  type: 'sales' | 'cash_receipt' | 'textbook_application',
): Promise<CardOcrResult | CashOcrResult | TextbookOcrResult> {
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
  historyId?: string,
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
      historyId,
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
/** 양수 처리 — 양수인 계약에 이력 추가 + 양도인 계약에 자동으로 '양도' 이력 추가 */
export function transferInApi(
  id: string,
  transferorContractId: string,
  transferAmount: number,
  snap: ContractSnapshot,
): Promise<Contract> {
  return sendJson(`/api/contracts/${encodeURIComponent(id)}/transfer-in`, 'POST', {
    transferorContractId,
    transferAmount,
    snap,
  })
}
/** 오타수정 — 새 이력행 추가 없이 기존 스냅샷(historyId)을 그대로 고친다 */
export function correctContractHistoryApi(
  id: string,
  historyId: string,
  snapshot: ContractSnapshot,
): Promise<Contract> {
  return sendJson(
    `/api/contracts/${encodeURIComponent(id)}/history/${encodeURIComponent(historyId)}`,
    'PATCH',
    snapshot,
  )
}

// ── LAS-ON 매장선정관리 ────────────────────────────────────
export function fetchStores(filter: StoreFilter): Promise<Store[]> {
  return getData(`/api/stores${qs({ keyword: filter.keyword, status: filter.status })}`)
}
export function fetchStore(id: string): Promise<Store> {
  return getData(`/api/stores/${encodeURIComponent(id)}`)
}
export function checkDuplicateStores(params: {
  bizNo?: string
  phone?: string
  name?: string
}): Promise<Store[]> {
  return getData(`/api/stores/check${qs(params)}`)
}
export function createStoreApi(data: Partial<Store>): Promise<Store> {
  return sendJson('/api/stores', 'POST', data)
}
export function updateStoreApi(id: string, data: Partial<Store>): Promise<Store> {
  return sendJson(`/api/stores/${encodeURIComponent(id)}`, 'PATCH', data)
}
export function deleteStoreApi(id: string): Promise<void> {
  return sendJson(`/api/stores/${encodeURIComponent(id)}`, 'DELETE')
}
export function addRecruitmentLogApi(
  storeId: string,
  log: Omit<RecruitmentLog, 'id' | 'createdAt'>,
): Promise<Store> {
  return sendJson(`/api/stores/${encodeURIComponent(storeId)}/log`, 'POST', log)
}
export async function uploadStorePhoto(storeId: string, file: File): Promise<Store> {
  const data = await fileToBase64(file)
  const res = await fetch(`/api/stores/${encodeURIComponent(storeId)}/photo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, data, mimeType: file.type || 'image/jpeg' }),
  })
  if (!res.ok) throw new Error(`Drive 업로드 실패 (${res.status})`)
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || '업로드 실패')
  return json.data
}

// ── 파트너 계정 관리 (가입요청 → 승인) ───────────────────────
export function fetchStaff(): Promise<Staff[]> {
  return getData('/api/staff')
}
export function setStaffStatusApi(id: string, status: string): Promise<Staff> {
  return sendJson(`/api/staff/${encodeURIComponent(id)}/status`, 'PATCH', { status })
}
export function deleteStaffApi(id: string): Promise<void> {
  return sendJson(`/api/staff/${encodeURIComponent(id)}`, 'DELETE')
}
/** 본인 가입 요청 제출 — 로그인 없이 호출 가능 */
export function submitStaffRequestApi(data: {
  name: string
  phone: string
  email: string
  role: string
  part: string
}): Promise<StaffRequest> {
  return sendJson('/api/staff-requests', 'POST', data)
}
export function fetchStaffRequests(all = false): Promise<StaffRequest[]> {
  return getData(`/api/staff-requests${qs({ all: all ? 'true' : '' })}`)
}
export function approveStaffRequestApi(id: string): Promise<Staff> {
  return sendJson(`/api/staff-requests/${encodeURIComponent(id)}/approve`, 'POST')
}
export function rejectStaffRequestApi(id: string): Promise<StaffRequest> {
  return sendJson(`/api/staff-requests/${encodeURIComponent(id)}/reject`, 'POST')
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
export function updateSaleApi(id: string, s: Omit<Sale, 'id'>): Promise<Sale> {
  return sendJson(`/api/sales/${encodeURIComponent(id)}`, 'PATCH', s)
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

// ── 일일보고 수신 이메일 설정 (백엔드 cron이 참조하는 DB 값) ──
export function fetchReportEmails(): Promise<string> {
  return getData('/api/system/config/daily-report-email')
}
export function updateReportEmailsApi(value: string): Promise<string> {
  return sendJson('/api/system/config/daily-report-email', 'PATCH', { value })
}

// ── 직급별 기본급여 설정 (JSON 문자열로 저장) ──
export function fetchPositionSalaries(): Promise<string> {
  return getData('/api/system/config/position-salaries')
}
export function updatePositionSalariesApi(value: string): Promise<string> {
  return sendJson('/api/system/config/position-salaries', 'PATCH', { value })
}

// ── 지점명(임용계약 소속지점) 목록 ─────────────────────────
export function fetchBranches(): Promise<string> {
  return getData('/api/system/config/branches')
}
export function updateBranchesApi(value: string): Promise<string> {
  return sendJson('/api/system/config/branches', 'PATCH', { value })
}

// ── 교재구매 신청 관리 ──────────────────────────────────────
export function fetchTextbookApplications(
  filter: TextbookApplicationFilter,
): Promise<TextbookApplication[]> {
  return getData(
    `/api/textbook-applications${qs({
      startDate: filter.startDate,
      endDate: filter.endDate,
      buyer: filter.buyer,
    })}`,
  )
}
export function fetchTextbookApplication(id: string): Promise<TextbookApplication> {
  return getData(`/api/textbook-applications/${encodeURIComponent(id)}`)
}
export function createTextbookApplicationApi(
  a: Omit<TextbookApplication, 'id' | 'createdAt'>,
): Promise<TextbookApplication> {
  return sendJson('/api/textbook-applications', 'POST', a)
}
export function deleteTextbookApplicationApi(id: string): Promise<void> {
  return sendJson(`/api/textbook-applications/${encodeURIComponent(id)}`, 'DELETE')
}
/** 수기 신청서 원본 사진 → Google Drive 업로드 후 링크 반환 */
export async function uploadTextbookPhoto(
  id: string,
  file: File,
): Promise<{ driveFileId: string; driveViewUrl: string }> {
  const data = await fileToBase64(file)
  const res = await fetch(`/api/textbook-applications/${encodeURIComponent(id)}/photo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, data, mimeType: file.type || 'image/jpeg' }),
  })
  if (!res.ok) throw new Error(`Drive 업로드 실패 (${res.status})`)
  const json = await res.json()
  return { driveFileId: json.driveFileId ?? '', driveViewUrl: json.driveViewUrl ?? '#' }
}
/** 수기신청서가 없는 신청건 — 입력정보로 양식 PDF 생성 (서버에서 Drive 업로드까지 처리) */
export async function generateTextbookPdf(
  id: string,
): Promise<{ driveFileId: string; driveViewUrl: string }> {
  const res = await fetch(`/api/textbook-applications/${encodeURIComponent(id)}/generate-pdf`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error(`PDF 생성 실패 (${res.status})`)
  const json = await res.json()
  return { driveFileId: json.driveFileId ?? '', driveViewUrl: json.driveViewUrl ?? '#' }
}
