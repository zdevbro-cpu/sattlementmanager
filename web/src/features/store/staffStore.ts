import type { Staff, StaffRequest } from '../../types/staff'
import {
  approveStaffRequestApi,
  deleteStaffApi,
  fetchStaff,
  fetchStaffRequests,
  rejectStaffRequestApi,
  createStaffLoginTokenApi,
  linkAllStaffPhonesApi,
  linkStaffPhoneApi,
  resetStaffPasswordApi,
  setStaffStatusApi,
  submitStaffRequestApi,
  updateStaffApi,
} from '../../lib/api'

export function listStaff(): Promise<Staff[]> {
  return fetchStaff()
}

export function setStaffStatus(id: string, status: 'active' | 'inactive'): Promise<Staff> {
  return setStaffStatusApi(id, status)
}

export function deleteStaff(id: string): Promise<void> {
  return deleteStaffApi(id)
}

export function updateStaff(
  id: string,
  data: {
    name: string
    phone: string
    businessUnit?: string
    role: string
    part: string
    branch?: string
  },
): Promise<Staff> {
  return updateStaffApi(id, data)
}

/** 비밀번호 초기화 — 관리자는 새 비밀번호를 모르고, 본인 이메일로 재설정 링크만 발송된다 */
export function resetStaffPassword(id: string): Promise<Staff> {
  return resetStaffPasswordApi(id)
}

/** 본인 가입 요청 제출 (로그인 불필요) */
export function submitStaffRequest(data: {
  name: string
  phone: string
  email: string
  role: string
  part: string
  businessUnit?: string
  branch?: string
}): Promise<StaffRequest> {
  return submitStaffRequestApi(data)
}

/** 가입 요청 목록 — 기본은 대기중만 */
export function listStaffRequests(all = false): Promise<StaffRequest[]> {
  return fetchStaffRequests(all)
}

export function approveStaffRequest(id: string): Promise<Staff> {
  return approveStaffRequestApi(id)
}

export function rejectStaffRequest(id: string): Promise<StaffRequest> {
  return rejectStaffRequestApi(id)
}

/** 문자 로그인 준비 — 계정에 전화번호를 연결한다. 이메일 로그인은 그대로 유지된다 */
export function linkStaffPhone(id: string) {
  return linkStaffPhoneApi(id)
}

/** 즉시 로그인 토큰 발급 — 관리자가 링크를 만들어 사용자에게 전달한다 */
export function createStaffLoginToken(id: string) {
  return createStaffLoginTokenApi(id)
}

/** 전체 일괄 연결 — 실패 건은 사유와 함께 돌아온다 */
export function linkAllStaffPhones() {
  return linkAllStaffPhonesApi()
}
