import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import ContractListPage from './features/contract/ContractListPage'
import SalesListPage from './features/sales/SalesListPage'
import AppointmentListPage from './features/appointment/AppointmentListPage'
import PaymentListPage from './features/payment/PaymentListPage'
import SystemAdminPage from './features/system/SystemAdminPage'
import MobileSalesRegisterPage from './features/sales/MobileSalesRegisterPage'
import MobileEvidenceUploadPage from './features/contract/MobileEvidenceUploadPage'
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
  if (isMobileDevice()) {
    // 모바일 접속 — 기존 주소 그대로 접속 시 결재/교재신청 중 선택하는 첫 화면을 보여주고,
    // 각 기능은 별도 경로에서 담당 화면으로 연결한다.
    return (
      <Routes>
        <Route path="/mobile-sales" element={<MobileSalesRegisterPage />} />
        <Route path="/mobile-evidence" element={<MobileEvidenceUploadPage />} />
        <Route path="/textbook-apply" element={<TextbookApplyMobilePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="*" element={<MobileHomePage />} />
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
