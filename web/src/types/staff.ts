// 파트너 계정(현장 파트장/파트너) 타입

export type StaffRole = 'field_partner' | 'part_leader'

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  field_partner: '파트너',
  part_leader: '파트장',
}

export interface Staff {
  id: string
  name: string
  phone: string
  email: string
  role: StaffRole
  part: string
  status: 'active' | 'inactive'
  /** 매장섭외관리 신규 매장 등록 권한 — 본부 담당자로 지정된 계정만 true */
  canRegisterStore: boolean
  createdAt: string
}

export interface StaffRequest {
  id: string
  name: string
  phone: string
  email: string
  role: StaffRole
  part: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  reviewedAt: string
}
