import { useEffect, useState } from 'react'
import { Check, Eye, KeyRound, Trash2, UserCheck, UserX, X } from 'lucide-react'
import Badge, { branchTone } from '../../components/ui/Badge'
import { dateText } from '../../lib/format'
import { STAFF_ROLE_LABEL, type Staff, type StaffRequest } from '../../types/staff'
import {
  approveStaffRequest,
  deleteStaff,
  listStaff,
  listStaffRequests,
  rejectStaffRequest,
  resetStaffPassword,
  setStaffStatus,
} from './staffStore'
import StaffDetailDrawer from './StaffDetailDrawer'

/**
 * 파트너 계정 관리 — LAS-On_Store_Manager.md 7.3.4 대응.
 * 본인이 별도의 가입요청 페이지(/staff-request)에서 신청하면, 여기서 관리자가 승인/거절한다.
 * 승인 시 Firebase Auth 계정이 만들어지고 본인에게 비밀번호 설정 이메일이 발송된다(관리자는 비밀번호를 모름).
 */
export default function StaffManagePage() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [requests, setRequests] = useState<StaffRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [detailStaff, setDetailStaff] = useState<Staff | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([listStaff(), listStaffRequests()]).then(([s, r]) => {
      if (alive) {
        setStaff(s)
        setRequests(r)
        setLoading(false)
      }
    })
    return () => {
      alive = false
    }
  }, [refresh])

  const approve = async (r: StaffRequest) => {
    setBusyId(r.id)
    try {
      await approveStaffRequest(r.id)
      setRefresh((n) => n + 1)
    } finally {
      setBusyId(null)
    }
  }

  const reject = async (r: StaffRequest) => {
    if (!confirm(`${r.name}님의 가입 요청을 거절할까요?`)) return
    setBusyId(r.id)
    try {
      await rejectStaffRequest(r.id)
      setRefresh((n) => n + 1)
    } finally {
      setBusyId(null)
    }
  }

  const toggleStatus = async (s: Staff) => {
    const next = s.status === 'active' ? 'inactive' : 'active'
    if (next === 'inactive' && !confirm(`${s.name} 계정을 비활성화할까요? 즉시 로그인이 차단됩니다.`)) return
    await setStaffStatus(s.id, next)
    setRefresh((n) => n + 1)
  }

  const onDelete = async (s: Staff) => {
    if (!confirm(`${s.name} 계정을 완전히 삭제할까요? 되돌릴 수 없습니다.`)) return
    await deleteStaff(s.id)
    setRefresh((n) => n + 1)
  }

  const onResetPassword = async (s: Staff) => {
    if (!confirm(`${s.name}(${s.email})님의 비밀번호를 초기화할까요? 본인 이메일로 재설정 링크가 발송됩니다.`)) return
    setBusyId(s.id)
    try {
      await resetStaffPassword(s.id)
      alert(`${s.name}님에게 비밀번호 재설정 메일을 발송했습니다.`)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <p className="mb-4 text-[13px] text-[#94a3b8]">
        현장 파트장/파트너 본인이 가입 요청 페이지(<code className="text-[#c2cde0]">/staff-request</code>)에서 신청하면,
        여기서 승인·거절합니다. 승인하면 본인 이메일로 비밀번호 설정 링크가 발송됩니다.
      </p>

      <section className="mb-6">
        <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">
          가입 요청 (대기중 {requests.length}건)
        </h3>
        <div className="rounded-[14px] border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-[13px]">
              <thead>
                <tr className="text-left text-[12.5px] text-[#94a3b8] border-y border-border">
                  {['이름', '전화번호', '이메일', '역할', '소속', '신청일', '처리'].map((h) => (
                    <th key={h} className={`px-3 py-1.5 font-semibold whitespace-nowrap ${h === '처리' ? 'text-center' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-b border-border hover:bg-hover">
                    <td className="px-3 py-1.5 font-semibold text-text-strong whitespace-nowrap">{r.name}</td>
                    <td className="px-3 py-1.5 tabular whitespace-nowrap">{r.phone || '-'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{r.email}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <Badge tone={r.role === 'part_leader' ? 'blue' : r.role === 'field_partner' ? 'green' : 'amber'}>
                        {STAFF_ROLE_LABEL[r.role]}
                      </Badge>
                    </td>
                    {/* 소속 표기는 축마다 다르다 — 파트너·파트장은 소속 파트, 점주·점장은 사업부/지점 */}
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {r.role === 'store_owner' || r.role === 'store_manager'
                        ? [r.businessUnit, r.branch].filter(Boolean).join(' / ') || '-'
                        : r.part || '-'}
                    </td>
                    <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#94a3b8]">{dateText(r.createdAt)}</td>
                    <td className="px-3 py-1.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => approve(r)}
                          disabled={busyId === r.id}
                          title="승인"
                          className="h-8 w-8 rounded-lg border border-success inline-flex items-center justify-center text-success hover:bg-hover disabled:opacity-60"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={() => reject(r)}
                          disabled={busyId === r.id}
                          title="거절"
                          className="h-8 w-8 rounded-lg border border-danger inline-flex items-center justify-center text-danger hover:bg-hover disabled:opacity-60"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {requests.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-[#64748b]">
                      {loading ? '불러오는 중…' : '대기중인 가입 요청이 없습니다.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">
          등록된 계정 ({staff.length})
        </h3>
        <div className="rounded-[14px] border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[13px]">
              <thead>
                <tr className="text-left text-[12.5px] text-[#94a3b8] border-y border-border">
                  {['이름', '전화번호', '이메일', '사업부', '역할', '소속 파트', '상태', '등록일', '관리'].map((h) => (
                    <th key={h} className={`px-3 py-1.5 font-semibold whitespace-nowrap ${h === '관리' ? 'text-center' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} className="border-b border-border hover:bg-hover">
                    <td className="px-3 py-1.5 font-semibold text-text-strong whitespace-nowrap">{s.name}</td>
                    <td className="px-3 py-1.5 tabular whitespace-nowrap">{s.phone || '-'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{s.email}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {s.businessUnit ? <Badge tone={branchTone(s.businessUnit)}>{s.businessUnit}</Badge> : '-'}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <Badge tone={s.role === 'part_leader' ? 'blue' : 'green'}>{STAFF_ROLE_LABEL[s.role]}</Badge>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{s.part || '-'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <Badge tone={s.status === 'active' ? 'green' : 'slate'}>{s.status === 'active' ? '활성' : '비활성'}</Badge>
                    </td>
                    <td className="px-3 py-1.5 tabular whitespace-nowrap text-[#94a3b8]">{dateText(s.createdAt)}</td>
                    <td className="px-3 py-1.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setDetailStaff(s)}
                          title="상세 보기 / 수정"
                          className="h-8 w-8 rounded-lg border border-border inline-flex items-center justify-center text-[#94a3b8] hover:bg-hover hover:text-white"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => onResetPassword(s)}
                          disabled={busyId === s.id}
                          title="비밀번호 초기화"
                          className="h-8 w-8 rounded-lg border border-border inline-flex items-center justify-center text-[#94a3b8] hover:bg-hover hover:text-white disabled:opacity-60"
                        >
                          <KeyRound size={16} />
                        </button>
                        <button
                          onClick={() => toggleStatus(s)}
                          title={s.status === 'active' ? '비활성화' : '활성화'}
                          className="h-8 w-8 rounded-lg border border-border inline-flex items-center justify-center text-[#94a3b8] hover:bg-hover hover:text-white"
                        >
                          {s.status === 'active' ? <UserX size={16} /> : <UserCheck size={16} />}
                        </button>
                        <button
                          onClick={() => onDelete(s)}
                          title="삭제"
                          className="h-8 w-8 rounded-lg border border-border inline-flex items-center justify-center text-danger hover:bg-hover hover:brightness-125"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {staff.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center text-[#64748b]">
                      {loading ? '불러오는 중…' : '등록된 계정이 없습니다.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {detailStaff && (
        <StaffDetailDrawer
          staff={detailStaff}
          onClose={() => setDetailStaff(null)}
          onSaved={() => {
            setDetailStaff(null)
            setRefresh((n) => n + 1)
          }}
        />
      )}
    </div>
  )
}
