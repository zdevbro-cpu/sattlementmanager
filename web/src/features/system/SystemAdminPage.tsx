import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import {
  addCode,
  removeCode,
  useCodes,
  type CodeKind,
} from '../../lib/codeStore'
import { addBank, removeBank, useBanks } from '../appointment/bankStore'
import { addBranch, removeBranch, useBranches } from '../appointment/branchStore'
import {
  addDocType,
  removeDocType,
  useDocTypes,
} from '../appointment/docTypeStore'
import {
  USER_ROLES,
  addUser,
  updateUser,
  useUsers,
  type UserRole,
} from './userStore'
import {
  addSalesCategory,
  removeSalesCategory,
  useSalesCategories,
} from '../sales/salesCategoryStore'
import {
  addReportEmail,
  parseEmails,
  removeReportEmail,
  useReportEmails,
} from '../sales/reportStore'
import {
  addPosition,
  removePosition,
  updatePositionField,
  updatePositionSalary,
  usePositionSalaries,
} from '../appointment/positionSalaryStore'
import {
  updateFeeRate,
  useSettlementSettings,
} from './settlementSettingsStore'
import StaffManagePage from '../store/StaffManagePage'

const GROUPS: { kind: CodeKind; title: string; desc: string }[] = [
  { kind: 'orgs', title: '소속', desc: '계약 소속 구분 (예: A, B)' },
  {
    kind: 'contractTypes',
    title: '계약구분',
    desc: 'LAS매장점주 / 직원 / LAS-On파트장 / LAS-On파트너',
  },
  {
    kind: 'statuses',
    title: '계약상태',
    desc: '신규 / 증액 / 양수 / 양도 / 해지 / 폐기',
  },
  {
    kind: 'businessUnits',
    title: '사업부',
    desc: '매출등록 사업부 드롭다운 (예: 교육사업부, LAS-On)',
  },
  {
    kind: 'appointmentStatuses',
    title: '임용계약 상태',
    desc: '정상 / 휴직 / 해지',
  },
]

type Tab = 'codes' | 'users' | 'partners'

export default function SystemAdminPage() {
  const [tab, setTab] = useState<Tab>('codes')
  return (
    <AppLayout title="시스템관리">
      <div className="mb-4">
        <h1 className="text-[22px] font-extrabold tracking-[-0.5px] text-text-strong">
          시스템관리
        </h1>
      </div>

      <div className="flex gap-1 mb-5 border-b border-border">
        <TabButton active={tab === 'codes'} onClick={() => setTab('codes')}>
          공통코드관리
        </TabButton>
        <TabButton active={tab === 'users'} onClick={() => setTab('users')}>
          사용자관리
        </TabButton>
        <TabButton active={tab === 'partners'} onClick={() => setTab('partners')}>
          파트너 계정관리
        </TabButton>
      </div>

      {tab === 'codes' ? <CommonCodeAdmin /> : tab === 'users' ? <UserAdmin /> : <StaffManagePage />}
    </AppLayout>
  )
}

function TabButton({
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
      className={[
        'px-4 py-2 text-[14px] font-bold border-b-2 -mb-px transition-colors',
        active
          ? 'border-primary text-text-strong'
          : 'border-transparent text-[#94a3b8] hover:text-[#e2e8f0]',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function CommonCodeAdmin() {
  const codes = useCodes()
  return (
    <div>
      <p className="text-[13px] text-[#94a3b8] mb-4">
        계약등록에서 사용하는 소속·계약구분·상태, 은행/기관, 제출서류 종류와
        매출관리(일일보고 수신 이메일·카드결제 분류)를 관리합니다.
      </p>
      <div className="grid grid-cols-5 gap-4">
        {GROUPS.map((g) => (
          <CodeCard
            key={g.kind}
            kind={g.kind}
            title={g.title}
            items={codes[g.kind]}
          />
        ))}
        <BranchCard />
        <BankCard />
        <DocTypeCard />
        <ReportEmailCard />
        <SalesCategoryCard />
        <PositionSalaryCard />
        <SettlementFeeCard />
        {Array.from({ length: Math.max(0, 10 - GROUPS.length - 6) }).map(
          (_, i) => (
            <EmptySlot key={`empty-${i}`} />
          ),
        )}
      </div>
    </div>
  )
}

function ReportEmailCard() {
  const emails = parseEmails(useReportEmails())
  const [newEmail, setNewEmail] = useState('')
  const [err, setErr] = useState('')

  const add = () => {
    if (!addReportEmail(newEmail)) {
      setErr('유효한 이메일이 아니거나 이미 등록된 주소입니다.')
      return
    }
    setNewEmail('')
    setErr('')
  }

  return (
    <div className="rounded-[14px] border border-border bg-card p-4">
      <h3 className="text-[15px] font-extrabold text-text-strong mb-3">
        일일보고 이메일
      </h3>
      <div className="flex gap-2 mb-3">
        <input
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="새 이메일 입력"
          className="h-9 flex-1 min-w-0 rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary"
        />
        <button
          onClick={add}
          className="h-9 shrink-0 whitespace-nowrap rounded-[8px] bg-primary px-3 text-[13px] font-bold text-white hover:brightness-110"
        >
          추가
        </button>
      </div>
      {err && <div className="mb-2 text-[11.5px] text-danger">{err}</div>}
      <ul className="space-y-1.5 max-h-[280px] overflow-y-auto">
        {emails.map((e) => (
          <li
            key={e}
            className="flex items-center justify-between gap-2 rounded-[8px] border border-border px-3 py-1.5 text-[13px]"
          >
            <span className="flex-1 min-w-0 truncate text-[#c2cde0]">{e}</span>
            <DeleteBtn onClick={() => removeReportEmail(e)} />
          </li>
        ))}
        {emails.length === 0 && (
          <li className="text-center text-[12px] text-[#64748b] py-3">
            등록된 이메일이 없습니다.
          </li>
        )}
      </ul>
    </div>
  )
}

function SalesCategoryCard() {
  const categories = useSalesCategories()
  const [newCat, setNewCat] = useState('')

  const add = () => {
    if (addSalesCategory(newCat, 10)) setNewCat('')
  }

  return (
    <div className="rounded-[14px] border border-border bg-card p-4">
      <h3 className="text-[15px] font-extrabold text-text-strong mb-3">
        카드결제 구분
      </h3>
      <div className="flex gap-2 mb-3">
        <input
          value={newCat}
          onChange={(e) => setNewCat(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="새 분류 입력"
          className="h-9 flex-1 min-w-0 rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary"
        />
        <button
          onClick={add}
          className="h-9 shrink-0 whitespace-nowrap rounded-[8px] bg-primary px-3 text-[13px] font-bold text-white hover:brightness-110"
        >
          추가
        </button>
      </div>
      <ul className="space-y-1.5 max-h-[280px] overflow-y-auto">
        {categories.map((c) => (
          <li
            key={c.name}
            className="flex items-center justify-between rounded-[8px] border border-border px-3 py-1.5 text-[13px]"
          >
            <span className="text-[#c2cde0]">{c.name}</span>
            <DeleteBtn onClick={() => removeSalesCategory(c.name)} />
          </li>
        ))}
        {categories.length === 0 && (
          <li className="text-center text-[12px] text-[#64748b] py-3">
            등록된 분류가 없습니다.
          </li>
        )}
      </ul>
    </div>
  )
}

/** 직급표 숫자 입력 셀 (천단위 콤마) */
function NumCell({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value ? value.toLocaleString('ko-KR') : ''}
      placeholder="0"
      onChange={(e) => onChange(Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
      className="h-8 w-24 rounded-[7px] bg-input border border-border px-1.5 text-right text-[12.5px] text-input-text outline-none focus:border-primary tabular"
    />
  )
}

function PositionSalaryCard() {
  const rows = usePositionSalaries()
  const [newPosition, setNewPosition] = useState('')
  const [newBasic, setNewBasic] = useState(0)
  const [err, setErr] = useState('')

  const add = () => {
    if (!addPosition(newPosition, newBasic)) {
      setErr('직급명을 입력하거나, 이미 있는 직급이 아닌지 확인하세요.')
      return
    }
    setNewPosition('')
    setNewBasic(0)
    setErr('')
  }

  return (
    <div className="rounded-[14px] border border-border bg-card p-4">
      <h3 className="text-[15px] font-extrabold text-text-strong mb-3">
        직급별 기본급여
      </h3>
      <div className="flex gap-2 mb-3">
        <input
          value={newPosition}
          onChange={(e) => setNewPosition(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="신규 직급명"
          className="h-9 flex-1 min-w-0 rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary"
        />
        <input
          type="text"
          inputMode="numeric"
          value={newBasic ? newBasic.toLocaleString('ko-KR') : ''}
          onChange={(e) => setNewBasic(Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="연봉"
          className="h-9 w-24 rounded-[8px] bg-input border border-border px-2 text-right text-[13px] text-input-text outline-none focus:border-primary tabular"
        />
        <button
          onClick={add}
          className="h-9 shrink-0 whitespace-nowrap rounded-[8px] bg-primary px-3 text-[13px] font-bold text-white hover:brightness-110"
        >
          추가
        </button>
      </div>
      {err && <div className="mb-2 text-[11.5px] text-danger">{err}</div>}
      <div className="max-h-[280px] overflow-auto rounded-[8px] border border-border">
        <table className="w-full min-w-[720px] text-[12.5px]">
          <thead>
            <tr className="text-[11.5px] text-[#94a3b8] border-b border-border">
              <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">직급</th>
              <th className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">연봉</th>
              <th className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">근로기본급여</th>
              <th className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">국민연금</th>
              <th className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">건강.요양</th>
              <th className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">고용보험</th>
              <th className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">소득세</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.position} className="border-b border-border last:border-0">
                <td className="px-2 py-1.5 whitespace-nowrap text-[#c2cde0]">{r.position}</td>
                <td className="px-2 py-1.5 text-right">
                  <NumCell value={r.basic} onChange={(n) => updatePositionSalary(r.position, n)} />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <NumCell value={r.laborBasic} onChange={(n) => updatePositionField(r.position, { laborBasic: n })} />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <NumCell value={r.pension} onChange={(n) => updatePositionField(r.position, { pension: n })} />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <NumCell value={r.healthCare} onChange={(n) => updatePositionField(r.position, { healthCare: n })} />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <NumCell value={r.employment} onChange={(n) => updatePositionField(r.position, { employment: n })} />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <NumCell value={r.incomeTax} onChange={(n) => updatePositionField(r.position, { incomeTax: n })} />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <DeleteBtn onClick={() => removePosition(r.position)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-[#64748b]">
        근로기본급여와 공제항목(국민연금·건강.요양·고용보험·소득세)은 <b>월 정액</b>입니다.
        60세 생일 이후에는 국민연금이 공제되지 않습니다.
      </p>
    </div>
  )
}

function SettlementFeeCard() {
  const { feeRate } = useSettlementSettings()
  return (
    <div className="rounded-[14px] border border-border bg-card p-4">
      <h3 className="text-[15px] font-extrabold text-text-strong mb-3">
        정산 수수료율
      </h3>
      <p className="text-[12px] text-[#94a3b8] mb-3">
        대시보드 정산 파이프라인의 수수료 차감·정산금액 계산에 사용됩니다.
      </p>
      <div className="flex items-center gap-2 rounded-[8px] border border-border px-3 py-1.5">
        <span className="flex-1 text-[13px] text-[#c2cde0]">매출 대비 수수료율</span>
        <input
          type="text"
          inputMode="decimal"
          value={feeRate}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/[^\d.]/g, '')) || 0
            updateFeeRate(n)
          }}
          className="h-8 w-16 rounded-[7px] bg-input border border-border px-2 text-right text-[13px] text-input-text outline-none focus:border-primary tabular"
        />
        <span className="text-[13px] text-[#94a3b8]">%</span>
      </div>
    </div>
  )
}

function UserAdmin() {
  const users = useUsers()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('운영자')
  const [err, setErr] = useState('')

  const submit = () => {
    if (!email.trim()) return setErr('이메일을 입력하세요.')
    if (!addUser({ name: '', email, role }))
      return setErr('이미 등록된 이메일입니다.')
    setEmail('')
    setRole('운영자')
    setErr('')
  }
  const resetPw = (mail: string) => {
    if (!confirm(`${mail} 사용자의 비밀번호를 초기화할까요?`)) return
    alert('비밀번호가 초기화되었습니다. (임시 비밀번호 발급)')
  }

  return (
    <div className="rounded-[14px] border border-border bg-card p-4">
      <h3 className="text-[15px] font-extrabold text-text-strong mb-3">
        사용자권한관리
      </h3>

      <div className="grid grid-cols-[1.6fr_1fr_auto] gap-3 items-end">
        <UserField label="이메일(로그인ID)">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="user@domain.com"
            className={userInputCls}
          />
        </UserField>
        <UserField label="권한">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className={userInputCls}
          >
            {USER_ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </UserField>
        <button
          onClick={submit}
          className="h-9 shrink-0 whitespace-nowrap rounded-[8px] bg-primary px-4 text-[13px] font-bold text-white hover:brightness-110"
        >
          사용자 추가
        </button>
      </div>
      {err && <div className="mt-2 text-[12px] text-danger">{err}</div>}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="text-left text-[12.5px] text-[#94a3b8] border-y border-border">
              <th className="px-3 py-2 font-semibold">이메일(로그인ID)</th>
              <th className="px-3 py-2 font-semibold">권한</th>
              <th className="px-3 py-2 font-semibold text-center">상태</th>
              <th className="px-3 py-2 font-semibold text-center">관리</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border hover:bg-hover">
                <td className="px-3 py-2 whitespace-nowrap text-[#c2cde0]">
                  {u.email}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-[#c2cde0]">
                  {u.role}
                </td>
                <td className="px-3 py-2 text-center whitespace-nowrap">
                  <span
                    className={[
                      'inline-flex rounded-[7px] px-2 py-0.5 text-[11.5px] font-bold',
                      u.active
                        ? 'bg-success/15 text-success'
                        : 'bg-input text-[#94a3b8]',
                    ].join(' ')}
                  >
                    {u.active ? '활성' : '비활성'}
                  </span>
                </td>
                <td className="px-3 py-2 text-center whitespace-nowrap">
                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      onClick={() => updateUser(u.id, { active: !u.active })}
                      className="h-7 rounded-[7px] border border-border px-2.5 text-[12px] font-semibold text-[#c2cde0] hover:bg-hover"
                    >
                      {u.active ? '비활성 전환' : '활성 전환'}
                    </button>
                    <button
                      onClick={() => resetPw(u.email)}
                      className="h-7 rounded-[7px] border border-border px-2.5 text-[12px] font-semibold text-[#c2cde0] hover:bg-hover"
                    >
                      비번초기화
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center text-[#64748b]">
                  등록된 사용자가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const userInputCls =
  'h-9 w-full rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary'

function UserField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-semibold text-[#94a3b8]">
        {label}
      </span>
      {children}
    </label>
  )
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="삭제"
      className="inline-flex items-center justify-center text-danger hover:brightness-125"
    >
      <Trash2 size={15} />
    </button>
  )
}

function EmptySlot() {
  return (
    <div className="rounded-[14px] border border-dashed border-border/60 min-h-[180px] flex items-center justify-center text-center text-[12px] text-[#3f5983] px-3">
      추가되는 코드 관리 영역
    </div>
  )
}

function DocTypeCard() {
  const types = useDocTypes()
  const [input, setInput] = useState('')
  const submit = () => {
    if (addDocType(input)) setInput('')
  }
  return (
    <div className="rounded-[14px] border border-border bg-card p-4">
      <h3 className="text-[15px] font-extrabold text-text-strong mb-3">제출서류</h3>
      <div className="flex gap-2 mb-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="새 서류종류 입력"
          className="h-9 flex-1 min-w-0 rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary"
        />
        <button
          onClick={submit}
          className="h-9 shrink-0 whitespace-nowrap rounded-[8px] bg-primary px-3 text-[13px] font-bold text-white hover:brightness-110"
        >
          추가
        </button>
      </div>
      <ul className="space-y-1.5 max-h-[280px] overflow-y-auto">
        {types.map((t) => (
          <li
            key={t}
            className="flex items-center justify-between rounded-[8px] border border-border px-3 py-1.5 text-[13px]"
          >
            <span className="text-[#c2cde0]">{t}</span>
            <DeleteBtn onClick={() => removeDocType(t)} />
          </li>
        ))}
        {types.length === 0 && (
          <li className="text-center text-[12px] text-[#64748b] py-3">
            등록된 서류종류가 없습니다.
          </li>
        )}
      </ul>
    </div>
  )
}

/** 지점명 — 임용계약 등록·수정과 조직관리 검색필터가 이 목록을 쓴다 (Cloud SQL 저장) */
function BranchCard() {
  const branches = useBranches()
  const [input, setInput] = useState('')
  const [err, setErr] = useState('')
  const submit = () => {
    if (!addBranch(input)) {
      setErr('지점명을 입력하거나, 이미 있는 지점이 아닌지 확인하세요.')
      return
    }
    setInput('')
    setErr('')
  }
  return (
    <div className="rounded-[14px] border border-border bg-card p-4">
      <h3 className="text-[15px] font-extrabold text-text-strong mb-3">지점명</h3>
      <div className="flex gap-2 mb-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="새 지점 입력 (예: 강남점)"
          className="h-9 flex-1 min-w-0 rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary"
        />
        <button
          onClick={submit}
          className="h-9 shrink-0 whitespace-nowrap rounded-[8px] bg-primary px-3 text-[13px] font-bold text-white hover:brightness-110"
        >
          추가
        </button>
      </div>
      {err && <div className="mb-2 text-[11.5px] text-danger">{err}</div>}
      <ul className="space-y-1.5 max-h-[280px] overflow-y-auto">
        {branches.map((b) => (
          <li
            key={b}
            className="flex items-center justify-between rounded-[8px] border border-border px-3 py-1.5 text-[13px]"
          >
            <span className="text-[#c2cde0]">{b}</span>
            <DeleteBtn onClick={() => removeBranch(b)} />
          </li>
        ))}
        {branches.length === 0 && (
          <li className="text-center text-[12px] text-[#64748b] py-3">
            등록된 지점이 없습니다.
          </li>
        )}
      </ul>
    </div>
  )
}

function BankCard() {
  const banks = useBanks()
  const [input, setInput] = useState('')
  const submit = () => {
    if (addBank(input)) setInput('')
  }
  return (
    <div className="rounded-[14px] border border-border bg-card p-4">
      <h3 className="text-[15px] font-extrabold text-text-strong mb-3">은행/기관</h3>
      <div className="flex gap-2 mb-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="새 기관 입력"
          className="h-9 flex-1 min-w-0 rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary"
        />
        <button
          onClick={submit}
          className="h-9 shrink-0 whitespace-nowrap rounded-[8px] bg-primary px-3 text-[13px] font-bold text-white hover:brightness-110"
        >
          추가
        </button>
      </div>
      <ul className="space-y-1.5 max-h-[280px] overflow-y-auto">
        {banks.map((b) => (
          <li
            key={b}
            className="flex items-center justify-between rounded-[8px] border border-border px-3 py-1.5 text-[13px]"
          >
            <span className="text-[#c2cde0]">{b}</span>
            <DeleteBtn onClick={() => removeBank(b)} />
          </li>
        ))}
        {banks.length === 0 && (
          <li className="text-center text-[12px] text-[#64748b] py-3">
            등록된 기관이 없습니다.
          </li>
        )}
      </ul>
    </div>
  )
}

function CodeCard({
  kind,
  title,
  items,
}: {
  kind: CodeKind
  title: string
  items: string[]
}) {
  const [input, setInput] = useState('')
  const submit = () => {
    if (addCode(kind, input)) setInput('')
  }
  return (
    <div className="rounded-[14px] border border-border bg-card p-4">
      <h3 className="text-[15px] font-extrabold text-text-strong mb-3">{title}</h3>
      <div className="flex gap-2 mb-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="새 항목 입력"
          className="h-9 flex-1 min-w-0 rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary"
        />
        <button
          onClick={submit}
          className="h-9 shrink-0 whitespace-nowrap rounded-[8px] bg-primary px-3 text-[13px] font-bold text-white hover:brightness-110"
        >
          추가
        </button>
      </div>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li
            key={it}
            className="flex items-center justify-between rounded-[8px] border border-border px-3 py-1.5 text-[13px]"
          >
            <span className="text-[#c2cde0]">{it}</span>
            <DeleteBtn onClick={() => removeCode(kind, it)} />
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-center text-[12px] text-[#64748b] py-3">
            항목이 없습니다.
          </li>
        )}
      </ul>
    </div>
  )
}
