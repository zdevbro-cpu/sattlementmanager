import type { AppointmentType } from '../types/appointment'

/** 임용계약 종류 + 직급별 급여조건 (시스템관리 이관 전 마스터) */
export const APPOINTMENT_TYPES: AppointmentType[] = [
  {
    id: 'AT1',
    name: '임용계약서(2026)',
    contractYears: 3,
    payoutMonths: 2,
    positions: [
      { position: '지사장', basic: 60_000_000, activity: 1_000_000 },
      { position: '지점장', basic: 48_000_000, activity: 800_000 },
      { position: '팀장', basic: 36_000_000, activity: 500_000 },
      { position: '팀원', basic: 30_000_000, activity: 300_000 },
    ],
  },
  {
    id: 'AT2',
    name: '전문강사 임용계약서(2026)',
    contractYears: 2,
    payoutMonths: 1,
    positions: [
      { position: '수석강사', basic: 42_000_000, activity: 600_000 },
      { position: '전임강사', basic: 33_000_000, activity: 400_000 },
    ],
  },
]
