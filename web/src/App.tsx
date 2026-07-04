import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import ContractListPage from './features/contract/ContractListPage'
import SalesListPage from './features/sales/SalesListPage'
import AppointmentListPage from './features/appointment/AppointmentListPage'
import PaymentListPage from './features/payment/PaymentListPage'
import SystemAdminPage from './features/system/SystemAdminPage'

function Placeholder({ title }: { title: string }) {
  return (
    <AppLayout title={title}>
      <div className="rounded-[14px] border border-border bg-card p-8 text-center text-[#94a3b8]">
        {title} 화면은 준비 중입니다.
      </div>
    </AppLayout>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/contracts" replace />} />
      <Route path="/contracts" element={<ContractListPage />} />
      <Route path="/dashboard" element={<Placeholder title="대시보드" />} />
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
