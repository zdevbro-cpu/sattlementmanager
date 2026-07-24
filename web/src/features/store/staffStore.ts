import type { Staff, StaffRequest } from '../../types/staff'
import {
  approveStaffRequestApi,
  deleteStaffApi,
  fetchStaff,
  fetchStaffRequests,
  rejectStaffRequestApi,
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
  data: { name: string; phone: string; role: string; part: string },
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
