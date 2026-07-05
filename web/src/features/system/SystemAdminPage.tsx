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
  updatePositionSalary,
  usePositionSalaries,
} from '../appointment/positionSalaryStore'

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
]

type Tab = 'codes' | 'users'

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
      </div>

      {tab === 'codes' ? <CommonCodeAdmin /> : <UserAdmin />}
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
        <BankCard />
        <DocTypeCard />
        <ReportEmailCard />
        <SalesCategoryCard />
        <PositionSalaryCard />
        {Array.from({ length: Math.max(0, 10 - GROUPS.length - 5) }).map(
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

function PositionSalaryCard() {
  const rows = usePositionSalaries()
  return (
    <div className="rounded-[14px] border border-border bg-card p-4">
      <h3 className="text-[15px] font-extrabold text-text-strong mb-3">
        직급별 기본급여
      </h3>
      <ul className="space-y-1.5 max-h-[280px] overflow-y-auto">
        {rows.map((r) => (
          <li
            key={r.position}
            className="flex items-center justify-between gap-2 rounded-[8px] border border-border px-3 py-1.5 text-[13px]"
          >
            <span className="text-[#c2cde0]">{r.position}</span>
            <input
              type="text"
              inputMode="numeric"
              value={r.basic.toLocaleString('ko-KR')}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/[^\d]/g, '')) || 0
                updatePositionSalary(r.position, n)
              }}
              className="h-8 w-28 rounded-[7px] bg-input border border-border px-2 text-right text-[13px] text-input-text outline-none focus:border-primary tabular"
            />
          </li>
        ))}
      </ul>
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
