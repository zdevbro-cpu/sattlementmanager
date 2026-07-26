import { useEffect, useState } from 'react'
import { AlertTriangle, Paperclip, X } from 'lucide-react'
import { STORE_STATUSES, type Store } from '../../types/store'
import { createStore, findDuplicates, uploadPhoto } from './storeStore'
import { listStaff } from './staffStore'
import { phoneFmt } from '../../lib/format'
import { EMPTY_FILTER } from '../../types/contract'
import { listContracts } from '../contract/contractStore'
import { useAuth } from '../auth/AuthContext'
import DateTextInput from '../../components/ui/DateTextInput'
import DropZone from '../../components/ui/DropZone'
import { useCodes } from '../../lib/codeStore'

const inputCls =
  'h-8 w-full rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary'

interface FormState {
  storeName: string
  status: string
  roadAddress: string
  detailAddress: string
  storePhone: string
  businessRegNo: string
  businessType: string
  chainBrand: string
  totalArea: string
  availableArea: string
  floorLocation: string
  businessHours: string
  commercialNote: string
  contactName: string
  contactPosition: string
  contactMobile: string
  decisionAuthority: string
  businessUnit: string
  claimedPart: string
  claimedStaff: string
  surveyDate: string
  memo: string
}

const EMPTY_FORM: FormState = {
  storeName: '',
  status: '신규등록',
  roadAddress: '',
  detailAddress: '',
  storePhone: '',
  businessRegNo: '',
  businessType: '',
  chainBrand: '',
  totalArea: '',
  availableArea: '',
  floorLocation: '',
  businessHours: '',
  commercialNote: '',
  contactName: '',
  contactPosition: '',
  contactMobile: '',
  decisionAuthority: '',
  businessUnit: '',
  claimedPart: '',
  claimedStaff: '',
  surveyDate: '',
  memo: '',
}

/**
 * 매장 등록 모달 — LAS-On_Store_Manager.md 요구사항서 4.1/5절 대응.
 * 필수 3항목(매장명/주소/전화번호)만으로 등록 가능하며, 저장 전 사업자번호·전화번호·매장명
 * 기준으로 중복 후보를 검색해 "○○파트 △△가 접촉 중" 형태로 경고만 하고 차단하지는 않는다.
 */
export default function StoreRegisterModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [f, setF] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [dupCandidates, setDupCandidates] = useState<Store[] | null>(null)
  const [checking, setChecking] = useState(false)
  const [partLeaders, setPartLeaders] = useState<string[]>([])
  const [staffInfoByName, setStaffInfoByName] = useState<Record<string, { phone: string; businessUnit: string }>>({})
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const { user } = useAuth()
  const codes = useCodes()

  useEffect(() => {
    let alive = true
    listContracts(EMPTY_FILTER).then((list) => {
      if (alive) {
        setPartLeaders(
          list
            .filter((c) => c.current.contractType === 'LAS-On파트장' && c.current.status !== '폐기')
            .map((c) => c.current.contractorName),
        )
      }
    })
    return () => {
      alive = false
    }
  }, [])

  // 선점 담당자·선점 파트는 로그인한 사용자의 파트너 계정 기본정보로 자동 채우되, 수동으로도 변경할 수 있다
  useEffect(() => {
    let alive = true
    listStaff().then((list) => {
      if (!alive) return
      const map: Record<string, { phone: string; businessUnit: string }> = {}
      list.forEach((s) => {
        if (s.name) map[s.name] = { phone: s.phone, businessUnit: s.businessUnit }
      })
      setStaffInfoByName(map)

      if (!user?.email) return
      const me = list.find((s) => s.email === user.email)
      // 매칭되는 파트너 계정이 없으면(관리자 로그인 등) 이메일로 채우지 않고 공란으로 두어 직접 입력하게 한다
      setF((prev) => ({
        ...prev,
        claimedStaff: prev.claimedStaff || me?.name || '',
        claimedPart: prev.claimedPart || me?.part || '',
        businessUnit: prev.businessUnit || me?.businessUnit || '',
      }))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email])

  const claimedStaffInfo = staffInfoByName[f.claimedStaff]

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF({ ...f, [k]: v })

  const doCreate = async () => {
    setSaving(true)
    setErr('')
    try {
      const created = await createStore({
        storeName: f.storeName.trim(),
        status: f.status,
        roadAddress: f.roadAddress.trim(),
        detailAddress: f.detailAddress.trim(),
        storePhone: f.storePhone,
        businessRegNo: f.businessRegNo,
        businessType: f.businessType,
        chainBrand: f.chainBrand,
        totalArea: f.totalArea,
        availableArea: f.availableArea,
        floorLocation: f.floorLocation,
        businessHours: f.businessHours,
        commercialNote: f.commercialNote,
        contactName: f.contactName,
        contactPosition: f.contactPosition,
        contactMobile: f.contactMobile,
        decisionAuthority: f.decisionAuthority,
        businessUnit: f.businessUnit,
        claimedPart: f.claimedPart,
        claimedStaff: f.claimedStaff,
        surveyDate: f.surveyDate,
        memo: f.memo,
      })
      // 등록 시점엔 매장 id가 없어 로컬에 담아뒀던 사진을, 매장 생성 직후 순서대로 업로드해 Drive·목록과 연계한다
      for (const file of photoFiles) {
        await uploadPhoto(created.id, file)
      }
      onCreated()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const submit = async () => {
    if (!f.storeName.trim()) return setErr('매장명을 입력하세요.')
    if (!f.roadAddress.trim()) return setErr('주소를 입력하세요.')
    if (!f.storePhone.trim()) return setErr('매장 전화번호를 입력하세요.')
    if (!f.claimedStaff.trim()) return setErr('선점 담당자를 입력하세요.')
    if (!f.claimedPart.trim()) return setErr('선점 파트를 선택하세요.')
    setErr('')
    setChecking(true)
    try {
      const candidates = await findDuplicates({
        bizNo: f.businessRegNo,
        phone: f.storePhone,
        name: f.storeName.trim(),
      })
      if (candidates.length > 0) {
        setDupCandidates(candidates)
        return
      }
      await doCreate()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-6 overflow-y-auto">
      <div className="w-full max-w-[860px] rounded-[14px] border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-[17px] font-extrabold text-text-strong">매장 등록</h2>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-3 max-h-[74vh] overflow-y-auto">
          <section>
            <h3 className="mb-1.5 text-[13px] font-extrabold text-text-strong">
              1. 매장 기본정보
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <Field label="매장명 *">
                <input value={f.storeName} onChange={(e) => set('storeName', e.target.value)} className={inputCls} />
              </Field>
              <Field label="도로명주소 *">
                <input value={f.roadAddress} onChange={(e) => set('roadAddress', e.target.value)} className={inputCls} />
              </Field>
              <Field label="상세주소">
                <input value={f.detailAddress} onChange={(e) => set('detailAddress', e.target.value)} className={inputCls} />
              </Field>
              <Field label="매장 전화번호 *">
                <input value={f.storePhone} onChange={(e) => set('storePhone', phoneFmt(e.target.value))} className={inputCls} placeholder="02-1234-5678" />
              </Field>
              <Field label="사업자등록번호">
                <input value={f.businessRegNo} onChange={(e) => set('businessRegNo', e.target.value)} className={inputCls} placeholder="실무협의 단계부터 필수" />
              </Field>
              <Field label="업종/업태">
                <input value={f.businessType} onChange={(e) => set('businessType', e.target.value)} className={inputCls} placeholder="예: 마트, 서점, 카페" />
              </Field>
              <Field label="체인/브랜드 명">
                <input value={f.chainBrand} onChange={(e) => set('chainBrand', e.target.value)} className={inputCls} />
              </Field>
              <Field label="상태">
                <select value={f.status} onChange={(e) => set('status', e.target.value)} className={inputCls}>
                  {STORE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          <section>
            <h3 className="mb-1.5 text-[13px] font-extrabold text-text-strong">2. 공간 · 상권</h3>
            <div className="grid grid-cols-3 gap-2">
              <Field label="층/위치">
                <input value={f.floorLocation} onChange={(e) => set('floorLocation', e.target.value)} className={inputCls} placeholder="예: 1층 입구" />
              </Field>
              <Field label="영업시간">
                <input value={f.businessHours} onChange={(e) => set('businessHours', e.target.value)} className={inputCls} />
              </Field>
              <Field label="전체 면적">
                <input value={f.totalArea} onChange={(e) => set('totalArea', e.target.value)} className={inputCls} />
              </Field>
              <Field label="입점 가능 면적">
                <input value={f.availableArea} onChange={(e) => set('availableArea', e.target.value)} className={inputCls} />
              </Field>
            </div>
            <div className="mt-2">
              <Field label="상권 특성 메모">
                <input value={f.commercialNote} onChange={(e) => set('commercialNote', e.target.value)} className={inputCls} placeholder="유동인구, 상권 특성 등" />
              </Field>
            </div>
          </section>

          <section>
            <h3 className="mb-1.5 text-[13px] font-extrabold text-text-strong">3. 매장 담당자 (의사결정 라인)</h3>
            <div className="grid grid-cols-3 gap-2">
              <Field label="담당자명">
                <input value={f.contactName} onChange={(e) => set('contactName', e.target.value)} className={inputCls} />
              </Field>
              <Field label="직위">
                <input value={f.contactPosition} onChange={(e) => set('contactPosition', e.target.value)} className={inputCls} placeholder="점주/점장/본사담당" />
              </Field>
              <Field label="휴대폰">
                <input value={f.contactMobile} onChange={(e) => set('contactMobile', phoneFmt(e.target.value))} className={inputCls} />
              </Field>
              <Field label="의사결정권">
                <input value={f.decisionAuthority} onChange={(e) => set('decisionAuthority', e.target.value)} className={inputCls} placeholder="점주 직접 / 체인 본사 승인 필요" />
              </Field>
            </div>
          </section>

          <section>
            <h3 className="mb-1.5 text-[13px] font-extrabold text-text-strong">4. 선점 관리</h3>
            <div className="grid grid-cols-3 gap-2">
              <Field label="사업부">
                <select value={f.businessUnit} onChange={(e) => set('businessUnit', e.target.value)} className={inputCls}>
                  <option value="">선택 안 함</option>
                  {codes.businessUnits.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="선점 파트 *">
                <select value={f.claimedPart} onChange={(e) => set('claimedPart', e.target.value)} className={inputCls}>
                  <option value="">선택 안 함</option>
                  {partLeaders.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="선점 담당자 *">
                <input
                  value={f.claimedStaff}
                  onChange={(e) => set('claimedStaff', e.target.value)}
                  className={inputCls}
                  placeholder="로그인 계정 기준 자동 입력 (수정 가능)"
                />
              </Field>
              <Field label="전화번호">
                <input value={claimedStaffInfo?.phone || ''} disabled className={inputCls} placeholder="선점 담당자 계정 기준 자동 표시" />
              </Field>
              <Field label="조사일">
                <DateTextInput value={f.surveyDate} onChange={(v) => set('surveyDate', v)} className={inputCls} />
              </Field>
            </div>
            <div className="mt-2">
              <Field label="비고">
                <input value={f.memo} onChange={(e) => set('memo', e.target.value)} className={inputCls} />
              </Field>
            </div>
          </section>

          <section>
            <h3 className="mb-1.5 text-[13px] font-extrabold text-text-strong">5. 매장 사진</h3>
            <DropZone
              onFile={(file) => setPhotoFiles((prev) => [...prev, file])}
              accept="image/*"
              hint="매장 외관/내부/입점 예정 위치 등 — 등록 시 Drive에 저장되어 목록과 연계됩니다"
            >
              <div className="text-[12.5px] text-[#94a3b8]">
                <span className="text-primary font-bold">클릭(탐색기)</span> 또는{' '}
                <span className="text-primary font-bold">드래그드롭</span>으로 사진 추가 (여러 장 가능)
              </div>
            </DropZone>
            {photoFiles.length > 0 && (
              <ul className="mt-2 space-y-1">
                {photoFiles.map((file, i) => (
                  <li
                    key={`${file.name}-${i}`}
                    className="flex items-center justify-between rounded-[8px] border border-border px-3 py-1.5 text-[12.5px]"
                  >
                    <span className="inline-flex items-center gap-1.5 text-[#c2cde0]">
                      <Paperclip size={12} /> {file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPhotoFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-[11.5px] text-danger hover:underline"
                    >
                      제거
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {err && <div className="text-[13px] text-danger">{err}</div>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="h-10 rounded-[10px] border border-border px-4 text-sm font-semibold text-[#c2cde0] hover:bg-hover">
            취소
          </button>
          <button
            onClick={submit}
            disabled={saving || checking}
            className="h-10 rounded-[10px] bg-primary px-5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-60"
          >
            {checking ? '중복 확인 중…' : saving ? '저장 중…' : '매장 등록'}
          </button>
        </div>
      </div>

      {dupCandidates && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="w-full max-w-[520px] rounded-[14px] border border-border bg-card p-5 shadow-xl">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle size={18} className="text-warning" />
              <h3 className="text-[15px] font-extrabold text-text-strong">유사 매장이 이미 있습니다</h3>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {dupCandidates.map((c) => (
                <div key={c.id} className="rounded-[8px] border border-border p-2.5 text-[12.5px]">
                  <div className="font-bold text-text-strong">{c.storeName} <span className="font-normal text-[#94a3b8]">#{c.id}</span></div>
                  <div className="text-[#94a3b8]">
                    {c.claimedPart ? `${c.claimedPart}파트 ${c.claimedStaff}` : '미선점'} · 상태: {c.status}
                    {c.log[0] && ` · 최종접촉 ${c.log[0].contactDate}`}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[12px] text-[#94a3b8]">
              동일 매장이면 등록을 취소하고 기존 매장에서 섭외이력을 추가하세요. 실제로 다른 매장이면 그대로 등록을 계속할 수 있습니다.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDupCandidates(null)}
                className="h-9 rounded-[8px] border border-border px-4 text-sm font-semibold text-[#c2cde0] hover:bg-hover"
              >
                취소
              </button>
              <button
                onClick={() => {
                  setDupCandidates(null)
                  doCreate()
                }}
                disabled={saving}
                className="h-9 rounded-[8px] bg-primary px-4 text-sm font-bold text-white hover:brightness-110 disabled:opacity-60"
              >
                {saving ? '저장 중…' : '그래도 신규 등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11.5px] font-semibold text-[#94a3b8]">{label}</span>
      {children}
    </label>
  )
}
