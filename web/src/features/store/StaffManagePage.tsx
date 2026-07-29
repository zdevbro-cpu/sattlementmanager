import { useEffect, useState } from 'react'
import { Check, Eye, KeyRound, Smartphone, Trash2, UserCheck, UserX, X } from 'lucide-react'
import Badge, { branchTone, type Tone } from '../../components/ui/Badge'
import { dateText } from '../../lib/format'
import { FIELD_ROLES, STAFF_ROLE_LABEL, STORE_ROLES, type Staff, type StaffRequest, type StaffRole } from '../../types/staff'
import {
  approveStaffRequest,
  deleteStaff,
  linkAllStaffPhones,
  linkStaffPhone,
  listStaff,
  listStaffRequests,
  rejectStaffRequest,
  resetStaffPassword,
  setStaffStatus,
} from './staffStore'
import StaffDetailDrawer from './StaffDetailDrawer'

/** 역할별 배지 색상 — 가입요청·등록된 계정 표에서 동일하게 사용한다 */
function roleTone(role: StaffRole): Tone {
  if (role === 'part_leader') return 'blue'
  if (role === 'field_partner') return 'green'
  return 'amber' // store_owner / store_manager
}

type SubTab = 'field' | 'store'

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
  const [subTab, setSubTab] = useState<SubTab>('field')

  const tabRoles = subTab === 'field' ? FIELD_ROLES : STORE_ROLES
  const visibleRequests = requests.filter((r) => (tabRoles as StaffRole[]).includes(r.role))
  const visibleStaff = staff.filter((s) => s.roles.some((r) => (tabRoles as StaffRole[]).includes(r)))

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

  /**
   * 문자 로그인 준비 — 활성 계정 전체에 전화번호를 연결한다.
   * 계정을 새로 만들지 않고 로그인 수단만 더하는 것이라 이메일 로그인은 그대로 남는다.
   * 번호 형식 오류·중복처럼 사람이 확인해야 하는 실패는 사유를 모아 보여준다.
   */
  const [linking, setLinking] = useState(false)
  const onLinkPhones = async () => {
    if (!confirm('활성 계정 전체에 휴대폰 번호를 연결할까요?\n연결되면 문자로도 로그인할 수 있고, 기존 이메일 로그인도 그대로 됩니다.'))
      return
    setLinking(true)
    try {
      const r = await linkAllStaffPhones()
      const head = `연결 완료 ${r.linked.length}건`
      if (!r.failed.length) alert(head)
      else
        alert(
          `${head}\n실패 ${r.failed.length}건 — 아래는 번호를 확인해 주세요.\n\n` +
            r.failed.map((f) => `· ${f.name}: ${f.reason}`).join('\n'),
        )
      setRefresh((n) => n + 1)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setLinking(false)
    }
  }

  /**
   * 계정 1건만 문자 로그인용 전화번호를 연결한다.
   * 일괄 연결과 동작은 같고 대상만 다르다 — 계정을 새로 만들지 않고 로그인 수단만 더하므로
   * 기존 이메일 로그인은 그대로 유지된다.
   */
  const onLinkPhone = async (s: Staff) => {
    if (!confirm(`${s.name}님의 휴대폰 번호(${s.phone || '없음'})를 연결할까요?\n연결되면 문자로도 로그인할 수 있고, 기존 이메일 로그인도 그대로 됩니다.`))
      return
    setBusyId(s.id)
    try {
      const r = await linkStaffPhone(s.id)
      alert(`${r.name}님 연결 완료 — ${r.phone}`)
      setRefresh((n) => n + 1)
    } catch (e) {
      // 번호 형식 오류·중복은 사람이 고쳐야 하는 문제라 서버 사유를 그대로 보여준다
      alert((e as Error).message)
    } finally {
      setBusyId(null)
    }
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
        현장 파트장/파트너/점주/점장 본인이 가입 요청 페이지에서 신청하면, 여기서 승인·거절합니다. 승인하면 본인
        이메일로 비밀번호 설정 링크가 발송됩니다.
      </p>

      <div className="flex gap-1 mb-4 border-b border-border">
        <SubTabButton active={subTab === 'field'} onClick={() => setSubTab('field')}>
          섭외조직 (파트장·파트너)
        </SubTabButton>
        <SubTabButton active={subTab === 'store'} onClick={() => setSubTab('store')}>
          매장운영 (점주·점장)
        </SubTabButton>
      </div>

      <section className="mb-6">
        <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">
          가입 요청 (대기중 {visibleRequests.length}건)
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
                {visibleRequests.map((r) => (
                  <tr key={r.id} className="border-b border-border hover:bg-hover">
                    <td className="px-3 py-1.5 font-semibold text-text-strong whitespace-nowrap">{r.name}</td>
                    <td className="px-3 py-1.5 tabular whitespace-nowrap">{r.phone || '-'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{r.email}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <Badge tone={roleTone(r.role)}>{STAFF_ROLE_LABEL[r.role]}</Badge>
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
                {visibleRequests.length === 0 && (
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
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="text-[13px] font-extrabold text-text-strong">
            등록된 계정 ({visibleStaff.length})
          </h3>
          <button
            onClick={onLinkPhones}
            disabled={linking}
            title="활성 계정에 휴대폰 번호를 연결해 문자 로그인을 쓸 수 있게 합니다"
            className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-border px-3 text-[12.5px] font-bold text-[#c2cde0] hover:bg-hover disabled:opacity-60"
          >
            <Smartphone size={14} /> {linking ? '연결 중…' : '휴대폰 번호 일괄 연결'}
          </button>
        </div>
        <div className="rounded-[14px] border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[13px]">
              <thead>
                <tr className="text-left text-[12.5px] text-[#94a3b8] border-y border-border">
                  {['이름', '전화번호', '이메일', '사업부', '역할', '소속', '상태', '등록일', '관리'].map((h) => (
                    <th key={h} className={`px-3 py-1.5 font-semibold whitespace-nowrap ${h === '관리' ? 'text-center' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleStaff.map((s) => (
                  <tr key={s.id} className="border-b border-border hover:bg-hover">
                    <td className="px-3 py-1.5 font-semibold text-text-strong whitespace-nowrap">{s.name}</td>
                    <td className="px-3 py-1.5 tabular whitespace-nowrap">{s.phone || '-'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{s.email}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {s.businessUnit ? <Badge tone={branchTone(s.businessUnit)}>{s.businessUnit}</Badge> : '-'}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <Badge tone={roleTone(s.role)}>{STAFF_ROLE_LABEL[s.role]}</Badge>
                    </td>
                    {/* 소속 표기는 축마다 다르다 — 파트너·파트장은 소속 파트, 점주·점장은 지점 */}
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {s.role === 'store_owner' || s.role === 'store_manager' ? s.branch || '-' : s.part || '-'}
                    </td>
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
                        {/* 연결됨/미연결을 색으로 구분한다 — 눌러서 확인하지 않아도 상태가 보이도록 */}
                        <button
                          onClick={() => onLinkPhone(s)}
                          disabled={busyId === s.id}
                          title={
                            s.phoneLinked
                              ? `문자 로그인 연결됨 (${s.phone || '-'}) — 다시 누르면 재연결`
                              : `문자 로그인 미연결 — 누르면 ${s.phone || '번호 없음'} 연결`
                          }
                          className={`h-8 w-8 rounded-lg border inline-flex items-center justify-center hover:bg-hover disabled:opacity-60 ${
                            s.phoneLinked
                              ? 'border-success text-success'
                              : 'border-border text-[#94a3b8] hover:text-white'
                          }`}
                        >
                          <Smartphone size={16} />
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
                {visibleStaff.length === 0 && (
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
          axis={subTab}
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

function SubTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-2 text-[13px] font-bold border-b-2 -mb-px ${
        active ? 'border-primary text-text-strong' : 'border-transparent text-[#94a3b8] hover:text-[#c2cde0]'
      }`}
    >
      {children}
    </button>
  )
}
