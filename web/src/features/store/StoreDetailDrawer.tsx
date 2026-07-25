import { useEffect, useState } from 'react'
import { ExternalLink, Paperclip, Pencil, X } from 'lucide-react'
import Badge, { storeStatusTone } from '../../components/ui/Badge'
import { dateText } from '../../lib/format'
import { phoneFmt } from '../../lib/format'
import { STORE_STATUSES, type Store } from '../../types/store'
import { addRecruitmentLog, getStore, updateStore, uploadPhoto } from './storeStore'
import { fetchMe, fetchPartLeaders } from '../../lib/api'
import DateTextInput from '../../components/ui/DateTextInput'
import DropZone from '../../components/ui/DropZone'
import { useAuth } from '../auth/AuthContext'

const inputCls =
  'h-9 w-full rounded-[8px] bg-input border border-border px-2.5 text-[13px] text-input-text outline-none focus:border-primary'

export default function StoreDetailDrawer({
  storeId,
  onClose,
  onChanged,
}: {
  storeId: string
  onClose: () => void
  onChanged?: () => void
}) {
  const [store, setStore] = useState<Store | null>(null)
  const [tick, setTick] = useState(0)
  const [editOpen, setEditOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [myName, setMyName] = useState<string | null>(null)
  const { user } = useAuth()

  useEffect(() => {
    let alive = true
    getStore(storeId).then((s) => {
      if (alive) setStore(s)
    })
    return () => {
      alive = false
    }
  }, [storeId, tick])

  // 파트너 계정(staff_accounts)으로 로그인한 경우만 이름을 조회한다 — 못 찾으면(=관리자 계정) 제한 없이 전체 허용
  useEffect(() => {
    let alive = true
    if (!user?.email) return
    fetchMe().then((me) => {
      if (!alive) return
      setMyName(me.isStaff ? me.name : null)
    })
    return () => {
      alive = false
    }
  }, [user?.email])

  if (!store) return null

  // 파트너 계정으로 로그인했을 때만 "이 매장의 선점담당자 또는 선점파트(파트장) 본인"으로 제한한다.
  // staff_accounts에 없는 계정(기존 관리자 로그인)은 제한 없이 변경 가능하다.
  const isStaffAccount = myName !== null
  const canChangeStatus = !isStaffAccount || myName === store.claimedStaff || myName === store.claimedPart

  const refresh = () => {
    setTick((n) => n + 1)
    onChanged?.()
  }

  const changeStatus = async (status: string) => {
    await updateStore(store.id, { ...store, status })
    refresh()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div className="h-full w-full max-w-[720px] bg-card border-l border-border overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[17px] font-extrabold text-text-strong">{store.storeName}</h2>
            <select
              value={store.status}
              onChange={(e) => changeStatus(e.target.value)}
              disabled={!canChangeStatus}
              title={canChangeStatus ? undefined : '이 매장의 선점담당자 또는 선점파트만 상태를 변경할 수 있습니다.'}
              className="h-8 rounded-[8px] bg-input border border-border px-2 text-[12.5px] text-input-text outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {STORE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <Badge tone={storeStatusTone(store.status)}>{store.status}</Badge>
            <span className="text-[12px] text-[#64748b]">#{store.id}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setLogOpen(false)
                setEditOpen((v) => !v)
              }}
              disabled={!canChangeStatus}
              title={canChangeStatus ? undefined : '이 매장의 선점담당자 또는 선점파트만 정보를 수정할 수 있습니다.'}
              className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-warning px-3 text-[13px] font-bold text-warning hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editOpen ? '수정 취소' : (<><Pencil size={13} /> 정보 수정</>)}
            </button>
            <button onClick={onClose} className="text-[#94a3b8] hover:text-white">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          {editOpen && (
            <EditForm
              store={store}
              onCancel={() => setEditOpen(false)}
              onSaved={() => {
                setEditOpen(false)
                refresh()
              }}
            />
          )}

          <section>
            <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">매장 정보</h3>
            <div className="rounded-[10px] border border-border p-3 grid grid-cols-2 gap-x-6 gap-y-2">
              <Row label="주소" value={`${store.roadAddress} ${store.detailAddress}`.trim() || '-'} />
              <Row label="전화번호" value={store.storePhone || '-'} />
              <Row label="사업자등록번호" value={store.businessRegNo || '-'} />
              <Row label="업종/업태" value={store.businessType || '-'} />
              <Row label="소속 체인/브랜드" value={store.chainBrand || '-'} />
              <Row label="층/위치" value={store.floorLocation || '-'} />
              <Row label="전체/입점가능 면적" value={`${store.totalArea || '-'} / ${store.availableArea || '-'}`} />
              <Row label="영업시간" value={store.businessHours || '-'} />
              <Row label="상권 메모" value={store.commercialNote || '-'} />
              <Row label="진행상태(실측)" value={store.progressStatus || '-'} />
              <Row label="CEO컨펌" value={store.ceoConfirm || '-'} />
              <Row label="실측(예정)일" value={store.surveyDate || '-'} />
            </div>
          </section>

          <section>
            <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">담당자 · 선점 정보</h3>
            <div className="rounded-[10px] border border-border p-3 flex flex-wrap gap-x-6 gap-y-2 text-[12.5px]">
              <RowInline label="담당자" value={store.contactName || '-'} />
              <RowInline label="직위" value={store.contactPosition || '-'} />
              <RowInline label="담당자 휴대폰" value={store.contactMobile || '-'} />
              <RowInline label="의사결정권" value={store.decisionAuthority || '-'} />
              <RowInline label="선점 파트" value={store.claimedPart || '-'} />
              <RowInline label="선점 담당자" value={store.claimedStaff || '-'} />
              <RowInline label="선점 만료일" value={dateText(store.claimExpiresAt) || '-'} />
              <RowInline label="비고" value={store.memo || '-'} />
            </div>
          </section>

          <section>
            <div className="mb-2.5 flex items-center justify-between">
              <h3 className="text-[13px] font-extrabold text-text-strong">
                섭외 접촉이력 <span className="text-[#64748b] font-semibold">({store.log.length})</span>
              </h3>
              <button
                onClick={() => setLogOpen((v) => !v)}
                className="h-8 rounded-[8px] bg-indigo px-3 text-[12.5px] font-bold text-white hover:brightness-110"
              >
                {logOpen ? '취소' : '이력 추가'}
              </button>
            </div>
            {logOpen && (
              <LogAddForm
                storeId={store.id}
                onCancel={() => setLogOpen(false)}
                onSaved={() => {
                  setLogOpen(false)
                  refresh()
                }}
              />
            )}
            <div className="mt-2 space-y-2">
              {store.log.map((l) => (
                <div key={l.id} className="rounded-[8px] border border-border p-2.5 text-[12.5px]">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-text-strong">{dateText(l.contactDate)}</span>
                    <span className="text-[#94a3b8]">{l.part} {l.staff}</span>
                    <Badge tone="slate">{l.contactMethod || '-'}</Badge>
                    <Badge tone={l.result === '관심' ? 'green' : l.result === '거절' ? 'red' : 'amber'}>{l.result || '-'}</Badge>
                  </div>
                  {l.nextAction && <div className="mt-1 text-[#94a3b8]">다음 액션: {l.nextAction}</div>}
                  {l.memo && <div className="mt-0.5 text-[#94a3b8]">{l.memo}</div>}
                </div>
              ))}
              {store.log.length === 0 && (
                <div className="rounded-[8px] border border-dashed border-border px-3 py-4 text-center text-[12px] text-[#64748b]">
                  등록된 접촉이력이 없습니다.
                </div>
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">매장 사진</h3>
            <PhotoUpload storeId={store.id} onUploaded={refresh} />
            <div className="mt-2 grid grid-cols-3 gap-2">
              {store.photos.map((p) => (
                <a
                  key={p.id}
                  href={p.driveViewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 rounded-[8px] border border-border px-2 py-1.5 text-[11.5px] text-primary hover:bg-hover"
                >
                  <Paperclip size={11} /> 사진 보기 <ExternalLink size={11} />
                </a>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[12.5px]">
      <span className="text-[#64748b]">{label}</span>
      <span className="text-[#e2e8f0]">{value}</span>
    </div>
  )
}

function RowInline({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[#64748b]">{label}</span>
      <span className="text-[#e2e8f0]">{value}</span>
    </div>
  )
}

function PhotoUpload({ storeId, onUploaded }: { storeId: string; onUploaded: () => void }) {
  const [busy, setBusy] = useState(false)
  const onFile = async (file: File) => {
    setBusy(true)
    try {
      await uploadPhoto(storeId, file)
      onUploaded()
    } finally {
      setBusy(false)
    }
  }
  return (
    <DropZone onFile={onFile} accept="image/*" hint="매장 사진">
      <div className="text-[12.5px] text-[#94a3b8]">
        {busy ? '업로드 중…' : (
          <>
            <span className="text-primary font-bold">클릭(탐색기)</span> 또는{' '}
            <span className="text-primary font-bold">드래그드롭</span>으로 사진 등록
          </>
        )}
      </div>
    </DropZone>
  )
}

function LogAddForm({
  storeId,
  onCancel,
  onSaved,
}: {
  storeId: string
  onCancel: () => void
  onSaved: () => void
}) {
  const [part, setPart] = useState('')
  const [staff, setStaff] = useState('')
  const [contactDate, setContactDate] = useState('')
  const [contactMethod, setContactMethod] = useState('방문')
  const [result, setResult] = useState('관심')
  const [nextAction, setNextAction] = useState('')
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    if (!contactDate) return setErr('접촉일을 입력하세요.')
    setSaving(true)
    setErr('')
    try {
      await addRecruitmentLog(storeId, { part, staff, contactDate, contactMethod, result, nextAction, memo })
      onSaved()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-2 rounded-[10px] border border-primary/40 bg-input/30 p-3 space-y-2.5">
      <div className="grid grid-cols-3 gap-2.5">
        <Field label="접촉 파트">
          <input value={part} onChange={(e) => setPart(e.target.value)} className={inputCls} />
        </Field>
        <Field label="담당자">
          <input value={staff} onChange={(e) => setStaff(e.target.value)} className={inputCls} />
        </Field>
        <Field label="접촉일">
          <DateTextInput value={contactDate} onChange={setContactDate} className={inputCls} />
        </Field>
        <Field label="접촉방법">
          <select value={contactMethod} onChange={(e) => setContactMethod(e.target.value)} className={inputCls}>
            <option>방문</option>
            <option>전화</option>
            <option>기타</option>
          </select>
        </Field>
        <Field label="결과">
          <select value={result} onChange={(e) => setResult(e.target.value)} className={inputCls}>
            <option>관심</option>
            <option>보류</option>
            <option>거절</option>
          </select>
        </Field>
        <Field label="다음 액션">
          <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} className={inputCls} placeholder="예: 7/25 재방문" />
        </Field>
      </div>
      <Field label="메모">
        <input value={memo} onChange={(e) => setMemo(e.target.value)} className={inputCls} />
      </Field>
      {err && <div className="text-[12px] text-danger">{err}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="h-9 rounded-[8px] border border-border px-3 text-[13px] font-semibold text-[#c2cde0] hover:bg-hover">
          취소
        </button>
        <button onClick={save} disabled={saving} className="h-9 rounded-[8px] bg-primary px-4 text-[13px] font-bold text-white hover:brightness-110 disabled:opacity-60">
          {saving ? '저장 중…' : '이력 추가'}
        </button>
      </div>
    </div>
  )
}

function EditForm({
  store,
  onCancel,
  onSaved,
}: {
  store: Store
  onCancel: () => void
  onSaved: () => void
}) {
  const [f, setF] = useState({
    storeName: store.storeName,
    storePhone: store.storePhone,
    roadAddress: store.roadAddress,
    detailAddress: store.detailAddress,
    businessRegNo: store.businessRegNo,
    businessType: store.businessType,
    chainBrand: store.chainBrand,
    totalArea: store.totalArea,
    availableArea: store.availableArea,
    floorLocation: store.floorLocation,
    businessHours: store.businessHours,
    commercialNote: store.commercialNote,
    progressStatus: store.progressStatus,
    ceoConfirm: store.ceoConfirm,
    surveyDate: store.surveyDate,
    contactName: store.contactName,
    contactPosition: store.contactPosition,
    contactMobile: store.contactMobile,
    decisionAuthority: store.decisionAuthority,
    claimedPart: store.claimedPart,
    claimedStaff: store.claimedStaff,
    claimExpiresAt: store.claimExpiresAt,
    rejectReason: store.rejectReason,
    recontactAvailableAt: store.recontactAvailableAt,
    memo: store.memo,
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [partLeaders, setPartLeaders] = useState<string[]>([])

  useEffect(() => {
    let alive = true
    fetchPartLeaders().then((names) => {
      if (alive) setPartLeaders(names)
      })
    return () => {
      alive = false
    }
  }, [])

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v })

  const save = async () => {
    if (!f.storeName.trim()) return setErr('매장명을 입력하세요.')
    setSaving(true)
    setErr('')
    try {
      await updateStore(store.id, { ...store, ...f })
      onSaved()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-[10px] border border-warning/40 bg-input/30 p-3 space-y-3">
      <div className="grid grid-cols-3 gap-2.5">
        <Field label="매장명">
          <input value={f.storeName} onChange={(e) => set('storeName', e.target.value)} className={inputCls} />
        </Field>
        <Field label="전화번호">
          <input value={f.storePhone} onChange={(e) => set('storePhone', phoneFmt(e.target.value))} className={inputCls} />
        </Field>
        <Field label="사업자등록번호">
          <input value={f.businessRegNo} onChange={(e) => set('businessRegNo', e.target.value)} className={inputCls} />
        </Field>
        <Field label="도로명주소">
          <input value={f.roadAddress} onChange={(e) => set('roadAddress', e.target.value)} className={inputCls} />
        </Field>
        <Field label="상세주소">
          <input value={f.detailAddress} onChange={(e) => set('detailAddress', e.target.value)} className={inputCls} />
        </Field>
        <Field label="업종/업태">
          <input value={f.businessType} onChange={(e) => set('businessType', e.target.value)} className={inputCls} />
        </Field>
        <Field label="소속 체인/브랜드">
          <input value={f.chainBrand} onChange={(e) => set('chainBrand', e.target.value)} className={inputCls} />
        </Field>
        <Field label="층/위치">
          <input value={f.floorLocation} onChange={(e) => set('floorLocation', e.target.value)} className={inputCls} />
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
        <Field label="담당자명">
          <input value={f.contactName} onChange={(e) => set('contactName', e.target.value)} className={inputCls} />
        </Field>
        <Field label="직위">
          <input value={f.contactPosition} onChange={(e) => set('contactPosition', e.target.value)} className={inputCls} />
        </Field>
        <Field label="담당자 휴대폰">
          <input value={f.contactMobile} onChange={(e) => set('contactMobile', phoneFmt(e.target.value))} className={inputCls} />
        </Field>
        <Field label="의사결정권">
          <input value={f.decisionAuthority} onChange={(e) => set('decisionAuthority', e.target.value)} className={inputCls} />
        </Field>
        <Field label="선점 파트">
          <select value={f.claimedPart} onChange={(e) => set('claimedPart', e.target.value)} className={inputCls}>
            <option value="">선택 안 함</option>
            {partLeaders.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="선점 담당자">
          <input value={f.claimedStaff} onChange={(e) => set('claimedStaff', e.target.value)} className={inputCls} />
        </Field>
        <Field label="선점 만료일">
          <DateTextInput value={f.claimExpiresAt} onChange={(v) => set('claimExpiresAt', v)} className={inputCls} />
        </Field>
        <Field label="거절 사유">
          <input value={f.rejectReason} onChange={(e) => set('rejectReason', e.target.value)} className={inputCls} />
        </Field>
        <Field label="재접촉 가능일">
          <DateTextInput value={f.recontactAvailableAt} onChange={(v) => set('recontactAvailableAt', v)} className={inputCls} />
        </Field>
      </div>
      <Field label="상권 메모">
        <input value={f.commercialNote} onChange={(e) => set('commercialNote', e.target.value)} className={inputCls} />
      </Field>
      <div className="grid grid-cols-3 gap-2.5">
        <Field label="진행상태(실측)">
          <input value={f.progressStatus} onChange={(e) => set('progressStatus', e.target.value)} className={inputCls} placeholder="예: 실측 완료, 협의서 전" />
        </Field>
        <Field label="CEO컨펌">
          <input value={f.ceoConfirm} onChange={(e) => set('ceoConfirm', e.target.value)} className={inputCls} placeholder="컨펌 완료 / 컨펌 전" />
        </Field>
        <Field label="실측(예정)일">
          <input value={f.surveyDate} onChange={(e) => set('surveyDate', e.target.value)} className={inputCls} />
        </Field>
      </div>
      <Field label="비고">
        <input value={f.memo} onChange={(e) => set('memo', e.target.value)} className={inputCls} />
      </Field>
      {err && <div className="text-[12px] text-danger">{err}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="h-9 rounded-[8px] border border-border px-3 text-[13px] font-semibold text-[#c2cde0] hover:bg-hover">
          취소
        </button>
        <button onClick={save} disabled={saving} className="h-9 rounded-[8px] bg-warning px-4 text-[13px] font-bold text-white hover:brightness-110 disabled:opacity-60">
          {saving ? '저장 중…' : '정보 수정 저장'}
        </button>
      </div>
    </section>
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
