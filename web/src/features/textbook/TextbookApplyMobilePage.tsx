import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DropZone from '../../components/ui/DropZone'
import DateTextInput from '../../components/ui/DateTextInput'
import { ocrImage, uploadReceiptImage, type TextbookOcrResult } from '../../lib/api'
import { phoneFmt } from '../../lib/format'
import { createApplication } from './textbookStore'
import { useAuth } from '../auth/AuthContext'
import PaymentEditor, { emptyPayment } from '../contract/PaymentEditor'
import type { PaymentInfo } from '../../types/contract'
import { AlertTriangle, Camera, CheckCircle2, ChevronLeft } from 'lucide-react'
import { useCodes } from '../../lib/codeStore'

const inputCls =
  'h-11 w-full rounded-[8px] bg-input border border-border px-3 text-[14px] text-input-text outline-none focus:border-primary'

/** 교재구매·회원가입 신청 — 모바일 신청자모드 (docs/교재구매 신청화면_모바일_신청자모드.png 준용) */
export default function TextbookApplyMobilePage() {
  const codes = useCodes()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()

  const [applyDate, setApplyDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [buyerName, setBuyerName] = useState('')
  const [childName, setChildName] = useState('')
  const [childBirthdate, setChildBirthdate] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [deliveryMemo, setDeliveryMemo] = useState('')
  const [book1Name, setBook1Name] = useState('')
  const [book2Name, setBook2Name] = useState('')
  const [subscriptionType, setSubscriptionType] = useState('')
  const [managementType, setManagementType] = useState('')
  const [payment, setPayment] = useState<PaymentInfo>(emptyPayment())

  const [preview, setPreview] = useState('')
  const [driveFileId, setDriveFileId] = useState('')
  const [driveViewUrl, setDriveViewUrl] = useState('')
  const [ocrBusy, setOcrBusy] = useState(false)
  const [driveErr, setDriveErr] = useState('')

  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [doneMsg, setDoneMsg] = useState('')

  const onPhoto = async (file: File) => {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    setOcrBusy(true)
    setErr('')
    setDriveErr('')
    try {
      const [r, up] = await Promise.all([
        ocrImage(file, 'textbook_application') as Promise<TextbookOcrResult>,
        uploadReceiptImage(file).catch((e) => {
          setDriveErr((e as Error).message || 'Drive 저장 실패')
          return null
        }),
      ])
      if (r.applyDate) setApplyDate(r.applyDate)
      if (r.buyerName) setBuyerName(r.buyerName)
      if (r.childName) setChildName(r.childName)
      if (r.childBirthdate) setChildBirthdate(r.childBirthdate)
      if (r.phone) setPhone(r.phone)
      if (r.address) setAddress(r.address)
      if (r.deliveryMemo) setDeliveryMemo(r.deliveryMemo)
      if (r.book1Name) setBook1Name(r.book1Name)
      if (r.book2Name) setBook2Name(r.book2Name)
      // OCR 이 읽은 상품명은 공통코드에 있는 값일 때만 반영한다 —
      // 목록에 없는 값을 넣으면 select 가 빈 채로 보여 담당자가 왜 안 들어갔는지 알 수 없다.
      if (r.subscriptionType && codes.subscriptionProducts.includes(r.subscriptionType))
        setSubscriptionType(r.subscriptionType)
      if (r.managementType && codes.subscriptionProducts.includes(r.managementType))
        setManagementType(r.managementType)
      if (up) {
        setDriveFileId(up.driveFileId)
        setDriveViewUrl(up.driveViewUrl)
      }
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setOcrBusy(false)
    }
  }

  const reset = () => {
    setBuyerName('')
    setChildName('')
    setChildBirthdate('')
    setPhone('')
    setAddress('')
    setDeliveryMemo('')
    setBook1Name('')
    setBook2Name('')
    setSubscriptionType('')
    setManagementType('')
    setPayment(emptyPayment())
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return ''
    })
    setDriveFileId('')
    setDriveViewUrl('')
  }

  const submit = async () => {
    if (!buyerName.trim()) return setErr('구매자 성명을 입력하세요.')
    setSaving(true)
    setErr('')
    setDoneMsg('')
    try {
      await createApplication({
        applyDate,
        buyerName: buyerName.trim(),
        childName,
        childBirthdate,
        phone,
        address,
        deliveryMemo,
        book1Name,
        book2Name,
        subscriptionType,
        managementType,
        sellerName: user?.email ?? '',
        sellerPhone: '',
        drivePhotoFileId: driveFileId,
        drivePhotoViewUrl: driveViewUrl,
        drivePdfFileId: '',
        drivePdfViewUrl: '',
        payment: payment.totalAmount > 0 ? payment : undefined,
      })
      setDoneMsg(`${buyerName.trim()} 신청 접수 완료`)
      reset()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] px-4 py-5">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => navigate('/')} className="inline-flex items-center gap-0.5 text-[12px] text-[#94a3b8] hover:text-white">
          <ChevronLeft size={14} /> 처음으로
        </button>
        <div className="flex items-center gap-2">
          {/* 점주/점장은 첫 화면 메뉴가 없어 여기서만 조회 화면으로 갈 수 있다 */}
          <button
            onClick={() => navigate('/my-applications')}
            className="text-[11px] font-semibold text-primary hover:brightness-125"
          >
            내역 조회
          </button>
          <span className="max-w-[120px] truncate text-[11px] text-[#64748b]">{user?.email}</span>
          <button onClick={() => signOut()} className="text-[11px] font-semibold text-[#94a3b8] hover:text-white">
            로그아웃
          </button>
        </div>
      </div>

      <div className="mb-4 text-center">
        <h1 className="text-[18px] font-extrabold text-text-strong">교재구매, 회원가입 신청서</h1>
        <p className="mt-0.5 text-[12px] text-[#94a3b8]">에이멘에이 주식회사</p>
      </div>

      <div className="space-y-4">
        {/* 수기 신청서 촬영 */}
        <section className="rounded-[14px] border border-border bg-card p-4">
          {!preview ? (
            <DropZone onFile={onPhoto} accept="image/*" capture="environment">
              <div className="py-4 text-center">
                <div className="mb-1 flex justify-center text-primary"><Camera size={26} /></div>
                <div className="text-[13.5px] font-bold text-text-strong">수기 신청서 사진 촬영/업로드</div>
                <div className="mt-1 text-[11.5px] text-[#94a3b8]">종이 신청서를 촬영하여 자동완성 하세요</div>
              </div>
            </DropZone>
          ) : (
            <div className="relative">
              <img src={preview} alt="신청서 미리보기" className="max-h-56 w-full rounded-[8px] border border-border object-contain" />
              {ocrBusy && (
                <div className="absolute inset-0 flex items-center justify-center rounded-[8px] bg-black/60 text-[13px] font-semibold text-white">
                  분석 중…
                </div>
              )}
              <button
                type="button"
                onClick={reset}
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-danger text-[12px] font-bold text-white"
              >
                ×
              </button>
            </div>
          )}
          {driveErr && (
            <div className="mt-1.5 flex items-center gap-1 text-[11px] text-warning"><AlertTriangle size={11} /> 이미지 Drive 저장 실패 (정보입력은 정상): {driveErr}</div>
          )}
        </section>

        {/* 01. 기본 정보 */}
        <section className="rounded-[14px] border border-border bg-card p-4">
          <h3 className="mb-2.5 text-[13px] font-extrabold text-primary">01. 기본 정보 (구매자 및 자녀)</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="신청 날짜">
                <DateTextInput value={applyDate} onChange={setApplyDate} className={inputCls} />
              </Field>
              <Field label="구매자 성명">
                <input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="구매자명" className={inputCls} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="자녀 성명">
                <input value={childName} onChange={(e) => setChildName(e.target.value)} placeholder="홍길동" className={inputCls} />
              </Field>
              <Field label="자녀생년월일">
                <DateTextInput value={childBirthdate} onChange={setChildBirthdate} placeholder="yymmdd" className={inputCls} />
              </Field>
            </div>
            <Field label="전화번호">
              <input value={phone} onChange={(e) => setPhone(phoneFmt(e.target.value))} placeholder="010-XXXX-XXXX" className={inputCls} inputMode="numeric" />
            </Field>
            <Field label="배송지 (주소)">
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="도로명 주소를 입력하세요" className={inputCls} />
            </Field>
            <Field label="배송메모">
              <input value={deliveryMemo} onChange={(e) => setDeliveryMemo(e.target.value)} placeholder="예: 문 앞 보관" className={inputCls} />
            </Field>
          </div>
        </section>

        {/* 02. 교재 구입 및 회원 구독 신청 */}
        <section className="rounded-[14px] border border-border bg-card p-4">
          <h3 className="mb-2.5 text-[13px] font-extrabold text-primary">02. 교재 구입 및 회원 구독 신청</h3>
          <div className="space-y-3">
            <Field label="교재구입 1">
              <input value={book1Name} onChange={(e) => setBook1Name(e.target.value)} placeholder="교재명 1" className={inputCls} />
            </Field>
            <Field label="교재구입 2">
              <input value={book2Name} onChange={(e) => setBook2Name(e.target.value)} placeholder="교재명 2" className={inputCls} />
            </Field>
            {/* 자유 입력이면 어떤 값이 정기발송 대상인지 코드가 판단할 수 없다 — 공통코드에서 고른다 */}
            <Field label="구독회원 구분">
              <select value={subscriptionType} onChange={(e) => setSubscriptionType(e.target.value)} className={inputCls}>
                <option value="">해당 없음</option>
                {codes.subscriptionProducts.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </Field>
            <Field label="관리회원 구분">
              <select value={managementType} onChange={(e) => setManagementType(e.target.value)} className={inputCls}>
                <option value="">해당 없음</option>
                {codes.subscriptionProducts.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        {/* 03. 결제 정보 */}
        <section className="rounded-[14px] border border-border bg-card p-4">
          <h3 className="mb-2.5 text-[13px] font-extrabold text-primary">03. 결제 정보 (선택)</h3>
          <PaymentEditor value={payment} onChange={setPayment} variant="mobile" />
        </section>

        {err && <div className="text-[13px] text-danger">{err}</div>}
        {doneMsg && <div className="flex items-center gap-1 text-[13px] font-bold text-success"><CheckCircle2 size={14} /> {doneMsg}</div>}

        <button
          onClick={submit}
          disabled={saving}
          className="h-12 w-full rounded-[10px] bg-primary text-[15px] font-bold text-white hover:brightness-110 disabled:opacity-60"
        >
          {saving ? '접수 중…' : '접수하기'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-semibold text-[#94a3b8]">{label}</span>
      {children}
    </label>
  )
}
