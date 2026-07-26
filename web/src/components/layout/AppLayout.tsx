import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import type { ComponentType } from 'react'
import type { ReactNode } from 'react'
import {
  BarChart3,
  BookOpen,
  Building2,
  Calculator,
  FileText,
  LayoutDashboard,
  Landmark,
  Receipt,
  Settings,
  Truck,
  Users,
  Wallet,
} from 'lucide-react'
import { useAuth } from '../../features/auth/AuthContext'
import { todayLabel } from '../../lib/format'

/** 모바일 기기(휴대폰) 여부 — User-Agent 기준. 데스크톱 브라우저는 창 크기와 무관하게 항상 데스크톱으로 판정된다. */
function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent)
}

interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ size?: number }>
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
      { to: '/dashboard', label: '대시보드', icon: LayoutDashboard, enabled: true },
      { to: '/contracts', label: '계약관리', icon: FileText, enabled: true },
      { to: '/sales', label: '매출관리', icon: Receipt, enabled: true },
      { to: '/base', label: '임용관리', icon: Users, enabled: true },
      { to: '/textbook', label: '교재구매관리', icon: BookOpen, enabled: true },
      { to: '/delivery', label: '배송관리', icon: Truck, enabled: true },
      { to: '/stores', label: '매장섭외관리', icon: Building2, enabled: true },
    ],
  },
  {
    title: '정산 & 회계',
    items: [
      { to: '/payment', label: '지급관리', icon: Wallet, enabled: true },
      { to: '/settlement', label: '정산센터', icon: Calculator },
      { to: '/accounting', label: '회계관리', icon: Landmark },
    ],
  },
  {
    title: '인사이트',
    items: [
      { to: '/system', label: '시스템관리', icon: Settings, enabled: true },
      { to: '/stats', label: '통계', icon: BarChart3 },
    ],
  },
]

const BREADCRUMB: Record<string, string> = {
  '/dashboard': '운영',
  '/base': '운영',
  '/stores': '운영',
  '/delivery': '운영',
  '/textbook': '운영',
  '/contracts': '계약관리',
  '/sales': '매출관리',
  '/settlement': '정산센터',
  '/payment': '지급관리',
  '/accounting': '회계관리',
  '/stats': '통계',
  '/system': '시스템관리',
}

export default function AppLayout({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  const loc = useLocation()
  const navigate = useNavigate()
  const crumb = BREADCRUMB[loc.pathname] ?? '운영'
  const { user, signOut } = useAuth()
  const email = user?.email ?? ''
  const mobile = isMobileDevice()

  return (
    <div className="flex min-h-screen w-full">
      {/* ── 사이드바 (모바일에선 숨김 — 대시보드 현황을 전체폭으로) ── */}
      <aside className={`sticky top-0 h-screen w-[236px] shrink-0 bg-sidebar flex-col ${mobile ? 'hidden' : 'flex'}`}>
        <div className="flex items-center gap-2.5 px-4 py-4">
          <img
            src="/logo.png"
            alt="Settlement Manager"
            className="h-[34px] w-[34px] rounded-[9px] object-cover"
          />
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
                  <span className="flex w-4 shrink-0 items-center justify-center">
                    <it.icon size={16} />
                  </span>
                  <span>{it.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-nav-active px-3 py-3 flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-[#1d3a63] text-[#8fb0e0] flex items-center justify-center text-xs font-bold">
            {email.slice(0, 1).toUpperCase() || '?'}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[12.5px] font-bold text-[#e2e8f0]">{email}</div>
            <div className="text-[10.5px] text-[#5f7ba6]">시스템관리자</div>
          </div>
          <button
            onClick={() => signOut()}
            title="로그아웃"
            className="shrink-0 rounded-[7px] px-2 py-1 text-[11px] font-semibold text-[#9fb3d1] hover:bg-nav-hover hover:text-white"
          >
            로그아웃
          </button>
        </div>
      </aside>

      {/* ── 메인 ─────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className={`sticky top-0 z-20 h-[60px] bg-sidebar border-b border-border-top flex items-center justify-between ${mobile ? 'px-4' : 'px-7'}`}>
          <div className="flex items-center gap-2">
            {mobile && (
              <button onClick={() => navigate('/')} title="홈으로" className="mr-1 shrink-0">
                <img src="/logo.png" alt="홈으로" className="h-7 w-7 rounded-[7px] object-cover" />
              </button>
            )}
            <span className="text-xs text-[#94a3b8]">{crumb}</span>
            <span className="text-[#cbd5e1]">/</span>
            <span className="text-base font-extrabold text-[#e2e8f0]">
              {title}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {!mobile && (
              <>
                <input
                  placeholder="계약자·매출 검색"
                  className="h-9 w-[230px] rounded-[9px] bg-input border border-border px-3 text-[13px] text-input-text placeholder:text-[#64748b] outline-none focus:border-primary"
                />
                <span className="h-6 w-px bg-border" />
              </>
            )}
            {mobile ? (
              <button
                onClick={() => signOut()}
                className="text-[11px] font-semibold text-[#9fb3d1] hover:text-white"
              >
                로그아웃
              </button>
            ) : (
              <span className="text-xs text-[#94a3b8]">{todayLabel()}</span>
            )}
          </div>
        </header>

        <main className={`flex-1 overflow-y-auto pt-6 pb-12 ${mobile ? 'px-4' : 'px-7'}`}>{children}</main>
      </div>
    </div>
  )
}
