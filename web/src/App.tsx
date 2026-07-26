import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import ContractListPage from './features/contract/ContractListPage'
import SalesListPage from './features/sales/SalesListPage'
import AppointmentListPage from './features/appointment/AppointmentListPage'
import PaymentListPage from './features/payment/PaymentListPage'
import SystemAdminPage from './features/system/SystemAdminPage'
import MobileSalesRegisterPage from './features/sales/MobileSalesRegisterPage'
import MobileEvidenceUploadPage from './features/contract/MobileEvidenceUploadPage'
import StoreListPage from './features/store/StoreListPage'
import MobileStoreListPage from './features/store/MobileStoreListPage'
import { fetchMe, type MeInfo } from './lib/api'
import StaffRequestPage from './features/store/StaffRequestPage'
import OwnerRequestPage from './features/store/OwnerRequestPage'
import DashboardPage from './features/dashboard/DashboardPage'
import { AuthProvider, useAuth } from './features/auth/AuthContext'
import LoginPage from './features/auth/LoginPage'
import TextbookApplyPage from './features/textbook/TextbookApplyPage'
import TextbookApplyMobilePage from './features/textbook/TextbookApplyMobilePage'
import MobileHomePage from './features/mobile/MobileHomePage'

function Placeholder({ title }: { title: string }) {
  return (
    <AppLayout title={title}>
      <div className="rounded-[14px] border border-border bg-card p-8 text-center text-[#94a3b8]">
        {title} 화면은 준비 중입니다.
      </div>
    </AppLayout>
  )
}

/** 모바일 기기(휴대폰) 여부 — User-Agent 기준. 데스크톱 브라우저 창 크기와는 무관하게 판단한다. */
function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent)
}

function AuthedApp() {
  const { user } = useAuth()
  // 본인 역할(roles) — 서버(/api/me)가 staff_accounts 기준으로 확정해 준다.
  // 예전처럼 전체 계정 목록을 받아 판정하지 않는다(타인 이메일 노출 방지).
  const [me, setMe] = useState<MeInfo | null>(null)

  useEffect(() => {
    let alive = true
    if (!user?.email) {
      setMe(null)
      return
    }
    fetchMe()
      .then((info) => {
        if (alive) setMe(info)
      })
      .catch(() => {
        // 조회 실패 시 권한을 넓히지 않는다 — 가장 좁은 범위로 취급
        if (alive)
          setMe({ email: user.email ?? '', name: '', roles: [], isStaff: true, part: '', branch: '', canRegisterStore: false })
      })
    return () => {
      alive = false
    }
  }, [user?.email])

  const roles = me?.roles ?? []
  const has = (...r: string[]) => roles.some((x) => r.includes(x))
  const isAdmin = has('admin')
  const isFieldStaff = has('part_leader', 'field_partner') // 섭외 조직
  const isStoreUser = has('store_owner', 'store_manager') // 매장 운영

  if (isMobileDevice()) {
    if (me === null) {
      return <div className="flex min-h-screen items-center justify-center bg-[#0a0e1a]" />
    }
    // 점주/점장 — 교재신청만 사용한다(매장섭외관리 접근 불가)
    if (isStoreUser && !isAdmin && !isFieldStaff) {
      return (
        <Routes>
          <Route path="/textbook-apply" element={<TextbookApplyMobilePage />} />
          <Route path="*" element={<Navigate to="/textbook-apply" replace />} />
        </Routes>
      )
    }
    // 섭외 조직(파트장/파트너) — 매장섭외관리 외 다른 메뉴(결재/증빙등록/교재신청)에 접근할 수 없다.
    if (isFieldStaff && !isAdmin) {
      return (
        <Routes>
          <Route path="/mobile-stores" element={<MobileStoreListPage />} />
          <Route path="*" element={<Navigate to="/mobile-stores" replace />} />
        </Routes>
      )
    }
    // 관리자 계정 — 기존 주소 그대로 접속 시 결재/교재신청 중 선택하는 첫 화면을 보여주고,
    // 각 기능은 별도 경로에서 담당 화면으로 연결한다.
    return (
      <Routes>
        <Route path="/mobile-sales" element={<MobileSalesRegisterPage />} />
        <Route path="/mobile-evidence" element={<MobileEvidenceUploadPage />} />
        <Route path="/mobile-stores" element={<MobileStoreListPage />} />
        <Route path="/textbook-apply" element={<TextbookApplyMobilePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="*" element={<MobileHomePage />} />
      </Routes>
    )
  }

  if (me === null) {
    return <div className="flex min-h-screen items-center justify-center bg-[#0a0e1a]" />
  }

  // 점주/점장 — 데스크톱에서도 교재신청만 사용한다
  if (isStoreUser && !isAdmin && !isFieldStaff) {
    return (
      <Routes>
        <Route path="/textbook-apply" element={<TextbookApplyPage />} />
        <Route path="*" element={<Navigate to="/textbook-apply" replace />} />
      </Routes>
    )
  }

  if (isFieldStaff && !isAdmin) {
    // 섭외 조직은 데스크톱에서도 매장섭외관리 외 다른 메뉴에 접근할 수 없다.
    return (
      <Routes>
        <Route path="/stores" element={<StoreListPage />} />
        <Route path="*" element={<Navigate to="/stores" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/mobile-sales" element={<MobileSalesRegisterPage />} />
      <Route path="/textbook-apply" element={<TextbookApplyPage />} />
      <Route path="/contracts" element={<ContractListPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/base" element={<AppointmentListPage />} />
      <Route path="/stores" element={<StoreListPage />} />
      <Route path="/sales" element={<SalesListPage />} />
      <Route path="/settlement" element={<Placeholder title="정산 계산" />} />
      <Route path="/payment" element={<PaymentListPage />} />
      <Route path="/accounting" element={<Placeholder title="전표 관리" />} />
      <Route path="/stats" element={<Placeholder title="매출 통계" />} />
      <Route path="/system" element={<SystemAdminPage />} />
      <Route path="*" element={<Navigate to="/contracts" replace />} />
    </Routes>
  )
}

function Gate() {
  const { user, loading } = useAuth()
  const location = useLocation()
  // 가입 요청 페이지는 로그인 없이 접근 가능해야 한다 (인증 검사보다 먼저 처리).
  // 섭외 조직과 매장 운영은 별도 운영이라 신청 폼이 나뉜다.
  if (location.pathname === '/staff-request') return <StaffRequestPage />   // 파트너·파트장
  if (location.pathname === '/owner-request') return <OwnerRequestPage />   // 점주·점장
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#0a0e1a]" />
  }
  if (!user) return <LoginPage />
  return <AuthedApp />
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
