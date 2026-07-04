import { NavLink, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'

interface NavItem {
  to: string
  label: string
  glyph: string
  enabled?: boolean
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: '운영',
    items: [
      { to: '/dashboard', label: '대시보드', glyph: '▦' },
      { to: '/base', label: '조직관리', glyph: '◱', enabled: true },
      { to: '/contracts', label: '계약관리', glyph: '▤', enabled: true },
      { to: '/sales', label: '매출관리', glyph: '▧', enabled: true },
    ],
  },
  {
    title: '정산 & 회계',
    items: [
      { to: '/settlement', label: '정산센터', glyph: '∑' },
      { to: '/payment', label: '지급관리', glyph: '₩', enabled: true },
      { to: '/accounting', label: '회계관리', glyph: '▥' },
    ],
  },
  {
    title: '인사이트',
    items: [
      { to: '/stats', label: '통계', glyph: '◔' },
      { to: '/system', label: '시스템관리', glyph: '⚙', enabled: true },
    ],
  },
]

const BREADCRUMB: Record<string, string> = {
  '/dashboard': '운영',
  '/base': '운영',
  '/contracts': '계약관리',
  '/sales': '매출관리',
  '/settlement': '정산센터',
  '/payment': '지급관리',
  '/accounting': '회계관리',
  '/stats': '통계',
  '/system': '시스템관리',
}

function todayLabel(): string {
  // 디자인 스펙 기준 고정 표기 (실제 앱에선 현재 날짜)
  return '2026-07-04 (금)'
}

export default function AppLayout({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  const loc = useLocation()
  const crumb = BREADCRUMB[loc.pathname] ?? '운영'

  return (
    <div className="flex min-h-screen w-full">
      {/* ── 사이드바 ─────────────────────────── */}
      <aside className="sticky top-0 h-screen w-[236px] shrink-0 bg-sidebar flex flex-col">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <div className="h-[34px] w-[34px] rounded-[9px] bg-gradient-to-br from-teal to-sky flex items-center justify-center">
            <span className="text-white text-lg font-black">S</span>
          </div>
          <div className="leading-tight">
            <div className="text-white font-extrabold text-[15px]">
              Settlement
            </div>
            <div className="text-[10.5px] font-semibold tracking-[1.5px] text-[#5f7ba6]">
              MANAGER
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 pb-4">
          {NAV_GROUPS.map((g) => (
            <div key={g.title} className="mt-4">
              <div className="px-3 pb-1.5 text-[10.5px] font-bold tracking-[1px] text-[#3f5983] uppercase">
                {g.title}
              </div>
              {g.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.enabled ? it.to : loc.pathname}
                  onClick={(e) => {
                    if (!it.enabled) e.preventDefault()
                  }}
                  className={({ isActive }) =>
                    [
                      'flex items-center gap-2.5 rounded-[9px] px-3 py-[9px] text-[13.5px] font-bold border-l-[3px] transition-colors',
                      isActive && it.enabled
                        ? 'text-white bg-nav-active border-accent'
                        : 'text-[#9fb3d1] border-transparent hover:bg-nav-hover hover:text-[#e2e8f0]',
                      !it.enabled && 'opacity-50 cursor-not-allowed',
                    ]
                      .filter(Boolean)
                      .join(' ')
                  }
                >
                  <span className="w-4 text-center">{it.glyph}</span>
                  <span>{it.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-nav-active px-3 py-3 flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-[#1d3a63] text-[#8fb0e0] flex items-center justify-center text-xs font-bold">
            A
          </div>
          <div className="leading-tight">
            <div className="text-[12.5px] font-bold text-[#e2e8f0]">
              admin@las.com
            </div>
            <div className="text-[10.5px] text-[#5f7ba6]">시스템관리자</div>
          </div>
        </div>
      </aside>

      {/* ── 메인 ─────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 h-[60px] bg-sidebar border-b border-border-top flex items-center justify-between px-7">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#94a3b8]">{crumb}</span>
            <span className="text-[#cbd5e1]">/</span>
            <span className="text-base font-extrabold text-[#e2e8f0]">
              {title}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              placeholder="계약자·매출 검색"
              className="h-9 w-[230px] rounded-[9px] bg-input border border-border px-3 text-[13px] text-input-text placeholder:text-[#64748b] outline-none focus:border-primary"
            />
            <button className="relative h-9 w-9 rounded-[9px] hover:bg-hover text-[#94a3b8]">
              🔔
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-danger ring-2 ring-sidebar" />
            </button>
            <span className="h-6 w-px bg-border" />
            <span className="text-xs text-[#94a3b8]">{todayLabel()}</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-7 pt-6 pb-12">{children}</main>
      </div>
    </div>
  )
}
