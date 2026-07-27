import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import { dateText } from '../../lib/format'
import { phoneFmt } from '../../lib/format'
import { FIELD_ROLES, STAFF_ROLE_LABEL, STORE_ROLES, type Staff } from '../../types/staff'
import { updateStaff } from './staffStore'
import { EMPTY_FILTER } from '../../types/contract'
import { listContracts } from '../contract/contractStore'
import { useCodes } from '../../lib/codeStore'
import { useBranches } from '../appointment/branchStore'

const inputCls =
  'h-9 w-full rounded-[8px] bg-input border border-border px-2.5 text-[13px] text-input-text outline-none focus:border-primary'

/**
 * 계정 등록정보 확인/수정 — 섭외조직(파트너/파트장)과 매장운영(점주/점장)은 축이 달라 편집 항목이 다르다.
 * 겸직 계정이라도 이 화면은 호출한 목록의 축(axis)만 보여준다 — 섭외조직 탭에서 열면 파트너 기능만,
 * 매장운영 탭에서 열면 점주/점장 기능만 표시하고 다른 축은 건드리지 않는다.
 */
export default function StaffDetailDrawer({
  staff,
  axis,
  onClose,
  onSaved,
}: {
  staff: Staff
  axis: 'field' | 'store'
  onClose: () => void
  onSaved: () => void
}) {
  const codes = useCodes()
  const branches = useBranches()
  const isStoreAxis = axis === 'store'
  const axisRoles = isStoreAxis ? STORE_ROLES : FIELD_ROLES
  const [name, setName] = useState(staff.name)
  const [phone, setPhone] = useState(staff.phone)
  const [businessUnit, setBusinessUnit] = useState(staff.businessUnit)
  const [role, setRole] = useState(staff.roles.find((r) => (axisRoles as string[]).includes(r)) ?? axisRoles[0])
  const [part, setPart] = useState(staff.part)
  const [branch, setBranch] = useState(staff.branch ?? '')
  const [partLeaders, setPartLeaders] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (isStoreAxis) return // 매장운영 계정은 소속 파트(파트장 목록)가 필요 없다
    let alive = true
    listContracts(EMPTY_FILTER).then((list) => {
      if (!alive) return
      setPartLeaders(
        list
          .filter((c) => c.current.contractType === 'LAS-On파트장' && c.current.status !== '폐기')
          .map((c) => c.current.contractorName),
      )
    })
    return () => {
      alive = false
    }
  }, [isStoreAxis])

  const save = async () => {
    if (!name.trim()) return setErr('이름을 입력하세요.')
    setSaving(true)
    setErr('')
    try {
      await updateStaff(staff.id, {
        name,
        phone,
        businessUnit,
        role,
        part: isStoreAxis ? '' : part,
        branch: isStoreAxis ? branch : '',
      })
      onSaved()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div className="h-full w-full max-w-[520px] bg-card border-l border-border overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[17px] font-extrabold text-text-strong">{staff.name}</h2>
            <Badge tone={staff.status === 'active' ? 'green' : 'slate'}>
              {staff.status === 'active' ? '활성' : '비활성'}
            </Badge>
          </div>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <Field label="이메일 (변경 불가)">
            <input value={staff.email} disabled className={`${inputCls} opacity-60`} />
          </Field>
          <Field label="이름">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Field>
          <Field label="전화번호">
            <input value={phone} onChange={(e) => setPhone(phoneFmt(e.target.value))} className={inputCls} />
          </Field>
          <Field label="사업부">
            <select value={businessUnit} onChange={(e) => setBusinessUnit(e.target.value)} className={inputCls}>
              <option value="">선택 안 함</option>
              {codes.businessUnits.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>
          {isStoreAxis ? (
            <>
              <Field label="역할">
                <select value={role} onChange={(e) => setRole(e.target.value as Staff['role'])} className={inputCls}>
                  <option value="store_owner">{STAFF_ROLE_LABEL.store_owner}</option>
                  <option value="store_manager">{STAFF_ROLE_LABEL.store_manager}</option>
                </select>
              </Field>
              <Field label="소속 지점">
                <select value={branch} onChange={(e) => setBranch(e.target.value)} className={inputCls}>
                  <option value="">선택 안 함</option>
                  {branches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ) : (
            <>
              <Field label="역할">
                <select value={role} onChange={(e) => setRole(e.target.value as Staff['role'])} className={inputCls}>
                  <option value="field_partner">{STAFF_ROLE_LABEL.field_partner}</option>
                  <option value="part_leader">{STAFF_ROLE_LABEL.part_leader}</option>
                </select>
              </Field>
              <Field label="소속 파트 (파트장 목록에서 선택)">
                <select value={part} onChange={(e) => setPart(e.target.value)} className={inputCls}>
                  <option value="">선택 안 함</option>
                  {partLeaders.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
          <Field label="등록일">
            <input value={dateText(staff.createdAt)} disabled className={`${inputCls} opacity-60`} />
          </Field>

          {err && <div className="text-[12px] text-danger">{err}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="h-9 rounded-[8px] border border-border px-3 text-[13px] font-semibold text-[#c2cde0] hover:bg-hover">
              취소
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="h-9 rounded-[8px] bg-primary px-4 text-[13px] font-bold text-white hover:brightness-110 disabled:opacity-60"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-semibold text-[#94a3b8]">{label}</span>
      {children}
    </label>
  )
}
