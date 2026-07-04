// 임용계약(조직관리) 데이터 접근 계층 (인메모리 목데이터)
import { MOCK_APPOINTMENTS } from '../../data/mockAppointments'
import type { Appointment, AppointmentFilter } from '../../types/appointment'
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
