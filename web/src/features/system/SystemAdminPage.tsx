import { useState } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import {
  addCode,
  removeCode,
  useCodes,
  type CodeKind,
} from '../../lib/codeStore'

const GROUPS: { kind: CodeKind; title: string; desc: string }[] = [
  { kind: 'orgs', title: '소속', desc: '계약 소속 구분 (예: A, B)' },
  {
    kind: 'contractTypes',
    title: '계약구분',
    desc: 'LAS매장점주 / 직원 / LAS-On파트장 / LAS-On파트너',
  },
  {
    kind: 'statuses',
    title: '상태',
    desc: '신규 / 증액 / 양수 / 양도 / 해지 / 폐기',
  },
]

export default function SystemAdminPage() {
  const codes = useCodes()
  return (
    <AppLayout title="시스템관리 · 공통코드">
      <div className="mb-4">
        <h1 className="text-[22px] font-extrabold tracking-[-0.5px] text-text-strong">
          공통코드 관리
        </h1>
        <p className="text-[13px] text-[#94a3b8] mt-1">
          계약등록에서 사용하는 소속·계약구분·상태 항목을 추가·삭제합니다.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {GROUPS.map((g) => (
          <CodeCard
            key={g.kind}
            kind={g.kind}
            title={g.title}
            desc={g.desc}
            items={codes[g.kind]}
          />
        ))}
      </div>
    </AppLayout>
  )
}

function CodeCard({
  kind,
  title,
  desc,
  items,
}: {
  kind: CodeKind
  title: string
  desc: string
  items: string[]
}) {
  const [input, setInput] = useState('')
  const submit = () => {
    if (addCode(kind, input)) setInput('')
  }
  return (
    <div className="rounded-[14px] border border-border bg-card p-4">
      <h3 className="text-[15px] font-extrabold text-text-strong">{title}</h3>
      <p className="text-[11.5px] text-[#64748b] mt-0.5 mb-3">{desc}</p>
      <div className="flex gap-2 mb-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="새 항목 입력"
          className="h-9 flex-1 rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary"
        />
        <button
          onClick={submit}
          className="h-9 rounded-[8px] bg-primary px-3 text-[13px] font-bold text-white hover:brightness-110"
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
            <button
              onClick={() => removeCode(kind, it)}
              className="text-[12px] text-danger hover:brightness-110"
            >
              삭제
            </button>
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
