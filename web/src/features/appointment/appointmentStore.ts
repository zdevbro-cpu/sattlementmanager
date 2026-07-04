// 임용계약(조직관리) 데이터 접근 계층 (인메모리 목데이터)
import { MOCK_APPOINTMENTS } from '../../data/mockAppointments'
import type {
  Appointment,
  AppointmentChange,
  AppointmentDoc,
  AppointmentFilter,
  AppointmentHistory,
} from '../../types/appointment'
import { parseDate } from '../../lib/format'

let store: Appointment[] = [...MOCK_APPOINTMENTS]
let seq = store.length

export function listAppointments(filter: AppointmentFilter): Appointment[] {
  const start = parseDate(filter.startDate)
  const end = parseDate(filter.endDate)
  const kw = filter.keyword.trim()

  return store
    .filter((a) => {
      if (kw && !a.name.includes(kw) && !a.ref.includes(kw)) return false
      const d = parseDate(a.contractDate)
      if (start && d && d < start) return false
      if (end && d && d > end) return false
      return true
    })
    .sort((a, b) => (b.contractDate ?? '').localeCompare(a.contractDate ?? ''))
}

export function getAppointment(id: string): Appointment | undefined {
  return store.find((a) => a.id === id)
}

export function createAppointment(a: Omit<Appointment, 'id'>): Appointment {
  seq += 1
  const created: Appointment = { ...a, id: `AP${String(seq).padStart(3, '0')}` }
  store = [created, ...store]
  return created
}

/** 수정 가능한 항목 → 이력 표기용 라벨 */
const EDIT_FIELD_LABELS: Partial<Record<keyof Appointment, string>> = {
  name: '계약자명',
  phone: '연락처',
  position: '직급',
  salary: '연봉',
  contractDate: '계약일',
  payoutDate: '급여일',
  endDate: '계약종료일',
  status: '계약상태',
  bankName: '은행/기관',
  accountNo: '계좌번호',
  accountOwner: '예금주',
}

/**
 * 임용계약 수정 — 변경된 항목을 비교해 이력 1건을 남기고 레코드를 갱신한다.
 * 변경된 항목이 없으면 이력을 남기지 않는다.
 */
export function updateAppointment(
  id: string,
  patch: Partial<Appointment>,
  meta: { memo: string; editedAt: string },
): Appointment | undefined {
  const idx = store.findIndex((a) => a.id === id)
  if (idx < 0) return undefined
  const prev = store[idx]

  const changes: AppointmentChange[] = []
  for (const key of Object.keys(patch) as (keyof Appointment)[]) {
    const label = EDIT_FIELD_LABELS[key]
    if (!label) continue
    const before = String(prev[key] ?? '')
    const after = String(patch[key] ?? '')
    if (before !== after) changes.push({ label, before, after })
  }

  let history = prev.history ?? []
  if (changes.length > 0) {
    const entry: AppointmentHistory = {
      historyId: `${id}-H${history.length + 1}`,
      editedAt: meta.editedAt,
      memo: meta.memo,
      changes,
    }
    history = [entry, ...history]
  }

  const next: Appointment = { ...prev, ...patch, history }
  store = store.map((a, i) => (i === idx ? next : a))
  return next
}

/** 제출서류 목록 갱신 (Drive 업로드 후 링크 저장) */
export function setAppointmentDocuments(
  id: string,
  documents: AppointmentDoc[],
): Appointment | undefined {
  const idx = store.findIndex((a) => a.id === id)
  if (idx < 0) return undefined
  const next: Appointment = { ...store[idx], documents }
  store = store.map((a, i) => (i === idx ? next : a))
  return next
}

/** 계약번호 자동생성 LASE-yyyymmdd-000 */
export function nextContractNo(dateISO: string): string {
  const compact = (dateISO || '').replace(/-/g, '') || '00000000'
  const n = store.length + 1
  return `LASE-${compact}-${String(n).padStart(3, '0')}`
}

export function summarizeAppointments(list: Appointment[]) {
  const active = list.filter((a) => a.status === '정상운영').length
  const paused = list.filter((a) => a.status === '일시정지').length
  const ended = list.filter(
    (a) => a.status === '계약해지' || a.status === '계약만료',
  ).length
  return { total: list.length, active, paused, ended }
}
