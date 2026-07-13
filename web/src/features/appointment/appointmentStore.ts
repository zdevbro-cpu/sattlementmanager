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
  // 상태는 시스템관리에서 관리하는 동적 코드라 값이 '정상' / '정상운영' 등으로 달라질 수 있다.
  // 정확히 일치가 아니라 접두사로 판정해야 카드 수치가 0으로 나오지 않는다.
  const active = list.filter((a) => a.status.startsWith('정상')).length
  const paused = list.filter((a) => a.status.startsWith('휴직')).length
  const ended = list.filter((a) => a.status.startsWith('해지')).length
  return { total: list.length, active, paused, ended }
}

/**
 * 카드에 고정으로 노출할 직급 순서 (직위 순).
 * 상단 row: 점주·예비과장·과장·차장 / 하단 row: 부장·이사·상무·전무
 * 인원이 0명이어도 자리를 지켜야 두 줄 배치가 유지된다.
 */
export const POSITION_CARD_ORDER = [
  '점주',
  '예비과장',
  '과장',
  '차장',
  '부장',
  '이사',
  '상무',
  '전무',
] as const

/**
 * 직급별 인원수 — 위 고정 순서대로. 해지 건은 제외한다.
 * 고정 목록에 없는 직급(신규 추가 등)이 데이터에 있으면 뒤에 덧붙인다.
 */
export function summarizeByPosition(
  list: Appointment[],
): { position: string; count: number }[] {
  const map = new Map<string, number>()
  list
    .filter((a) => !a.status.startsWith('해지'))
    .forEach((a) => {
      const p = a.position || '(미지정)'
      map.set(p, (map.get(p) ?? 0) + 1)
    })

  const fixed = POSITION_CARD_ORDER.map((position) => ({
    position,
    count: map.get(position) ?? 0,
  }))
  // 고정 목록에 없는 직급은 인원 많은 순으로 뒤에 붙인다 (누락 방지)
  const extra = [...map.entries()]
    .filter(([p]) => !POSITION_CARD_ORDER.includes(p as (typeof POSITION_CARD_ORDER)[number]))
    .map(([position, count]) => ({ position, count }))
    .sort((a, b) => b.count - a.count || a.position.localeCompare(b.position, 'ko'))

  return [...fixed, ...extra]
}
