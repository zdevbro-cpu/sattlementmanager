import AppLayout from '../../components/layout/AppLayout'
import TextbookAdminPage from './TextbookAdminPage'

/**
 * 교재구매관리 — 사이드바 독립 메뉴.
 * 대장 본체는 TextbookAdminPage 가 그대로 담당하고, 여기서는 레이아웃만 감싼다
 * (매출관리 탭 안에 있던 것을 분리했다).
 */
export default function TextbookPage() {
  return (
    <AppLayout title="교재구매관리">
      <div className="mb-4">
        <h1 className="text-[22px] font-extrabold tracking-[-0.5px] text-text-strong">교재구매관리</h1>
        <p className="text-[13px] text-[#94a3b8] mt-1">
          교재구매 신청을 접수·조회하고, 구독·관리회원의 정기발송을 관리합니다.
        </p>
      </div>
      <TextbookAdminPage />
    </AppLayout>
  )
}
