// 백엔드(Firebase Functions / Express) 호출 클라이언트.
// - OCR: POST /api/ocr (Gemini) 규격
// - Drive 업로드: contractmanager POST /api/contracts/:id/pdf (base64) 규격
import type { Contract, ContractFilter, ContractSnapshot } from '../types/contract'
import type { Appointment, AppointmentFilter } from '../types/appointment'
import type { Sale, SalesFilter } from '../types/sales'
import type { ExtraPayee } from '../types/payout'
import type { TextbookApplication, TextbookApplicationFilter } from '../types/textbook'
import type { PaymentInfo } from '../types/contract'
import type { RecruitmentLog, Store, StoreFilter } from '../types/store'
import type { Staff, StaffRequest } from '../types/staff'
import type { Shipment, ShipmentFilter, ShipmentSummary } from '../types/delivery'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase'

/**
 * 로그인된 뒤에 실행한다 — 이미 로그인 상태면 즉시, 아니면 로그인되는 시점에 실행된다.
 *
 * 설정 스토어들은 모듈이 로드되는 즉시 서버 동기화를 시도하는데, 그 시점은 로그인 화면일 수 있다.
 * 그때 보낸 요청은 토큰이 없어 인가를 강제하면 401 이 되고, 이 스토어들은 한 번만 호출하고
 * 실패를 조용히 무시하므로 로그인한 뒤에도 영영 채워지지 않는다(급여표·지점 목록이 빈 채로 남는다).
 * 로그인 이후로 미뤄 이 문제를 없앤다.
 */
export function onSignedIn(run: () => void): void {
  onAuthStateChanged(auth, (u) => {
    if (u) run()
  })
}

/**
 * 인증 토큰을 붙여 요청한다 — 이 파일의 모든 /api 호출은 이 함수를 거친다.
 * 서버는 Authorization: Bearer <Firebase ID 토큰> 을 검증한다(server/middleware/auth.js).
 * 토큰을 얻지 못해도 요청은 그대로 보낸다 — 인증 판정은 서버가 한다(공개 엔드포인트 존재).
 */
async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  try {
    // 세션 복원이 끝날 때까지 기다린 뒤 토큰을 읽는다.
    // 일부 스토어(branchStore/positionSalaryStore/reportStore)는 모듈이 로드되는 즉시 API를 부르는데,
    // 그 시점엔 Firebase 가 아직 세션을 복원하지 않아 currentUser 가 null 이다.
    // 기다리지 않으면 그 요청들만 토큰 없이 나가 401 이 된다(관찰 모드 로그로 실제 확인됨).
    // 최초 1회만 대기하고, 이후에는 즉시 resolve 된다.
    await auth.authStateReady()
    const token = await auth.currentUser?.getIdToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  } catch {
    /* 토큰 갱신 실패 — 서버가 401 로 응답하면 재로그인 유도 */
  }
  return fetch(input, { ...init, headers })
}

/** 로그인 사용자 본인 정보(역할·소속) — 프론트 라우팅 분기의 기준 */
export interface MeInfo {
  email: string
  name: string
  roles: string[]
  isStaff: boolean
  part: string
  branch: string
  lasCode?: string
  canRegisterStore: boolean
}

export function fetchMe(): Promise<MeInfo> {
  return getData('/api/me')
}

/** 선점 파트 선택용 파트장 이름 목록 — 계약 원장 전체를 받지 않고 이름만 조회한다 */
export function fetchPartLeaders(): Promise<string[]> {
  return getData('/api/part-leaders')
}

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
  const res = await authFetch('/api/ocr', { method: 'POST', body: form })
  if (!res.ok) throw new Error(`OCR 실패 (${res.status})`)
  const json = await res.json()
  return json.data ?? {}
}

/** 촬영한 영수증/전표 원본 이미지 → Google Drive 업로드 (매출·계약 레코드 생성 전, OCR과 함께 호출) */
export async function uploadReceiptImage(
  file: File,
): Promise<{ driveFileId: string; driveViewUrl: string }> {
  const data = await fileToBase64(file)
  const res = await authFetch('/api/drive/upload', {
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
  const res = await authFetch('/api/report/send', {
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
  const res = await authFetch(
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
  const res = await authFetch(`/api/sales/${encodeURIComponent(saleId)}/document`, {
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
  const res = await authFetch(`/api/contracts/${contractId}/pdf`, {
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
  const res = await authFetch(url)
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
  const res = await authFetch(url, {
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
  const res = await authFetch(`/api/stores/${encodeURIComponent(storeId)}/photo`, {
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
export function updateStaffApi(
  id: string,
  data: {
    name: string
    phone: string
    businessUnit?: string
    role: string
    part: string
    branch?: string
    canRegisterStore: boolean
  },
): Promise<Staff> {
  return sendJson(`/api/staff/${encodeURIComponent(id)}`, 'PATCH', data)
}
export function resetStaffPasswordApi(id: string): Promise<Staff> {
  return sendJson(`/api/staff/${encodeURIComponent(id)}/reset-password`, 'POST')
}
/** 본인 가입 요청 제출 — 로그인 없이 호출 가능 */
export function submitStaffRequestApi(data: {
  name: string
  phone: string
  email: string
  role: string
  part: string
  businessUnit?: string
  branch?: string
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

// ── 은행/기관 목록 ────────────────────────────────────────
export function fetchBanks(): Promise<string> {
  return getData('/api/system/config/banks')
}
export function updateBanksApi(value: string): Promise<string> {
  return sendJson('/api/system/config/banks', 'PATCH', { value })
}

// ── 제출서류 종류 ─────────────────────────────────────────
export function fetchDocTypes(): Promise<string> {
  return getData('/api/system/config/doc-types')
}
export function updateDocTypesApi(value: string): Promise<string> {
  return sendJson('/api/system/config/doc-types', 'PATCH', { value })
}

// ── 매출구분(카드결제 분류) ──────────────────────────────────
export function fetchSalesCategories(): Promise<string> {
  return getData('/api/system/config/sales-categories')
}
export function updateSalesCategoriesApi(value: string): Promise<string> {
  return sendJson('/api/system/config/sales-categories', 'PATCH', { value })
}

// ── 정산 수수료율 ────────────────────────────────────────
export function fetchSettlementFeeRate(): Promise<string> {
  return getData('/api/system/config/settlement-fee-rate')
}
export function updateSettlementFeeRateApi(value: string): Promise<string> {
  return sendJson('/api/system/config/settlement-fee-rate', 'PATCH', { value })
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
  a: Omit<TextbookApplication, 'id' | 'createdAt'> & { payment?: PaymentInfo },
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
  const res = await authFetch(`/api/textbook-applications/${encodeURIComponent(id)}/photo`, {
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
  const res = await authFetch(`/api/textbook-applications/${encodeURIComponent(id)}/generate-pdf`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error(`PDF 생성 실패 (${res.status})`)
  const json = await res.json()
  return { driveFileId: json.driveFileId ?? '', driveViewUrl: json.driveViewUrl ?? '#' }
}

// ── 시스템관리 공통코드 (로그인 없이도 조회 가능 — 파트너 가입요청 페이지에서 사용) ──
export interface CodeSetApi {
  orgs: string[]
  contractTypes: string[]
  statuses: string[]
  businessUnits: string[]
  appointmentStatuses: string[]
}
export function fetchCodes(): Promise<CodeSetApi> {
  return getData('/api/codes')
}
export function addCodeApi(kind: string, value: string): Promise<CodeSetApi> {
  return sendJson('/api/codes', 'POST', { kind, value })
}
export function removeCodeApi(kind: string, value: string): Promise<CodeSetApi> {
  return sendJson('/api/codes', 'DELETE', { kind, value })
}
export function reorderCodeApi(kind: string, value: string, direction: 'up' | 'down'): Promise<CodeSetApi> {
  return sendJson('/api/codes/reorder', 'POST', { kind, value, direction })
}

/* ══════════════════════════════════════════════════════════
 * 배송관리 — 교재구매 신청에서 파생된 배송 라이프사이클
 * ══════════════════════════════════════════════════════════ */

export function fetchShipments(filter: ShipmentFilter): Promise<Shipment[]> {
  return getData(
    `/api/shipments${qs({
      startDate: filter.startDate,
      endDate: filter.endDate,
      status: filter.status === '전체' ? '' : filter.status,
      keyword: filter.keyword,
    })}`,
  )
}

export function fetchShipmentSummary(): Promise<ShipmentSummary> {
  return getData('/api/shipments/summary')
}

/** 신규 배송 수동 등록 — 교재신청과 무관한 배송건(전화·방문 접수 등)을 단독 생성한다 */
export function createShipmentApi(
  data: Pick<
    Shipment,
    'recipientName' | 'phone' | 'address' | 'deliveryMemo' | 'book1Name' | 'book2Name' | 'carrier' | 'trackingNo' | 'memo'
  >,
): Promise<Shipment> {
  return sendJson('/api/shipments', 'POST', data)
}

export function fetchShipment(id: string): Promise<Shipment> {
  return getData(`/api/shipments/${encodeURIComponent(id)}`)
}

export function updateShipmentApi(id: string, patch: Partial<Shipment>): Promise<Shipment> {
  return sendJson(`/api/shipments/${encodeURIComponent(id)}`, 'PATCH', patch)
}

/** 상태 전이 — 규칙에 없는 전이·배송지 미확정 확정은 서버가 사유와 함께 거부한다 */
export function setShipmentStatusApi(id: string, toStatus: string, memo?: string): Promise<Shipment> {
  return sendJson(`/api/shipments/${encodeURIComponent(id)}/status`, 'POST', { toStatus, memo })
}

/* ══════════════════════════════════════════════════════════
 * 본인 신청·배송 조회 (모바일) — 점주는 본인 건, 점장은 자기 지점 건.
 * 조회 범위는 서버가 강제한다(클라이언트 필터가 아니다).
 * ══════════════════════════════════════════════════════════ */

export interface MyApplication {
  id: string
  applyDate: string
  buyerName: string
  childName: string
  phone: string
  address: string
  book1Name: string
  book2Name: string
  createdAt: string
  shipmentId: string
  /** 요약 상태 — 내부 8단계가 아니라 구매자에게 그대로 읽어줄 수 있는 말 */
  deliveryStatus: string
  carrier: string
  trackingNo: string
}

export function fetchMyApplications(keyword = ''): Promise<MyApplication[]> {
  return getData(`/api/my-applications${qs({ keyword })}`)
}
