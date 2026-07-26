// 계정 타입 — 섭외 조직(파트너/파트장)과 매장 운영(점주/점장)은 별도 운영이며,
// 한 사람이 두 축을 겸할 수 있어 실제 권한 판정은 단일 role 이 아니라 roles 배열로 한다.

/** 섭외 조직 축 — 축 내부에서는 배타 */
export type FieldRole = 'field_partner' | 'part_leader'
/** 매장 운영 축 — 축 내부에서는 배타 */
export type StoreRole = 'store_owner' | 'store_manager'
export type StaffRole = FieldRole | StoreRole

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  field_partner: '파트너',
  part_leader: '파트장',
  store_owner: '점주',
  store_manager: '점장',
}

export const FIELD_ROLES: FieldRole[] = ['field_partner', 'part_leader']
export const STORE_ROLES: StoreRole[] = ['store_owner', 'store_manager']

export interface Staff {
  id: string
  name: string
  phone: string
  email: string
  /** 주 역할(표시용). 실제 권한 판정은 roles 로 한다 */
  role: StaffRole
  /** 보유 역할 전체 — 축이 달라 겸직이 가능하다 */
  roles: StaffRole[]
  part: string
  /** 사업부·지점 — 점주/점장 계정에서 사용 */
  businessUnit?: string
  branch?: string
  lasCode?: string
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
  /** 어느 축의 요청인지는 role 값으로 구분된다 */
  role: StaffRole
  part: string
  businessUnit?: string
  branch?: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  reviewedAt: string
}
