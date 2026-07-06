// 임용계약(조직관리) 데이터 접근 계층 — Cloud SQL(PostgreSQL) 백엔드(server/appointmentRepo.js)를 통해 조회/저장한다.
import type { Appointment, AppointmentFilter } from '../../types/appointment'
import {
  createAppointmentApi,
  fetchAppointment,
  fetchAppointments,
  nextAppointmentContractNo,
  updateAppointmentApi,
} from '../../lib/api'

export function listAppointments(filter: AppointmentFilter): Promise<Appointment[]> {
  return fetchAppointments(filter)
}

export function getAppointment(id: string): Promise<Appointment> {
  return fetchAppointment(id)
}

export function createAppointment(a: Omit<Appointment, 'id'>): Promise<Appointment> {
  return createAppointmentApi(a)
}

/**
 * 임용계약 수정 — 변경된 항목을 비교해 이력 1건을 남기고 레코드를 갱신한다 (서버에서 처리).
 */
export function updateAppointment(
  id: string,
  patch: Partial<Appointment>,
  meta: { memo: string; editedAt: string },
): Promise<Appointment> {
  return updateAppointmentApi(id, patch, meta)
}

/** 계약번호 자동생성 LASE-yyyymmdd-000 */
export function nextContractNo(dateISO: string): Promise<string> {
  return nextAppointmentContractNo(dateISO)
}

export function summarizeAppointments(list: Appointment[]) {
  const active = list.filter((a) => a.status === '정상운영').length
  const paused = list.filter((a) => a.status === '일시정지').length
  const ended = list.filter(
    (a) => a.status === '계약해지' || a.status === '계약만료',
  ).length
  return { total: list.length, active, paused, ended }
}
