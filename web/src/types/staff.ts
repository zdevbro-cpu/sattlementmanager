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
