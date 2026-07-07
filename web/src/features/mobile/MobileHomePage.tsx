import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

/** 모바일 접속 시 첫 화면 — 결재/교재신청 중 사용할 기능을 선택한다. */
export default function MobileHomePage() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0e1a] px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="Settlement Manager" className="h-9 w-9 rounded-[9px] object-cover" />
          <div className="leading-tight">
            <div className="text-[14px] font-extrabold text-text-strong">Settlement</div>
            <div className="text-[9.5px] font-semibold tracking-[1.5px] text-[#5f7ba6]">MANAGER</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="max-w-[110px] truncate text-[11px] text-[#64748b]">{user?.email}</span>
          <button onClick={() => signOut()} className="text-[11px] font-semibold text-[#94a3b8] hover:text-white">
            로그아웃
          </button>
        </div>
      </div>

      <p className="mb-3 text-[13px] font-semibold text-[#94a3b8]">사용할 기능을 선택하세요</p>

      <div className="flex flex-col gap-3">
        <MenuCard
          glyph="₩"
          title="결재"
          sub="카드/현금 매출 등록 (카메라 촬영 → OCR 자동추출)"
          tint="#fff1e0"
          fg="#f59e0b"
          onClick={() => navigate('/mobile-sales')}
        />
        <MenuCard
          glyph="📝"
          title="교재신청"
          sub="교재구매, 회원가입 신청서 접수 (수기신청서 촬영 → 자동입력)"
          tint="#e2f7ec"
          fg="#16a34a"
          onClick={() => navigate('/textbook-apply')}
        />
      </div>
    </div>
  )
}

function MenuCard({
  glyph,
  title,
  sub,
  tint,
  fg,
  onClick,
}: {
  glyph: string
  title: string
  sub: string
  tint: string
  fg: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-[14px] border border-border bg-card p-4 text-left transition-colors active:bg-hover"
    >
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] text-lg font-black"
        style={{ background: tint, color: fg }}
      >
        {glyph}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-bold text-text-strong">{title}</div>
        <div className="mt-0.5 text-[11.5px] text-[#94a3b8]">{sub}</div>
      </div>
      <div className="shrink-0 text-[#5f7ba6]">›</div>
    </button>
  )
}
