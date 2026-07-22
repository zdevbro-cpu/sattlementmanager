import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, MapPin, Search, Store as StoreIcon } from 'lucide-react'
import Badge, { storeStatusTone } from '../../components/ui/Badge'
import { dateText } from '../../lib/format'
import { useAuth } from '../auth/AuthContext'
import { EMPTY_STORE_FILTER, type Store } from '../../types/store'
import { getStore, listStores } from './storeStore'

const inputCls =
  'h-11 w-full rounded-[8px] bg-input border border-border pl-9 pr-3 text-[14px] text-input-text outline-none focus:border-primary'

/** 모바일 매장섭외관리 — 조회 전용(목록 검색 + 상세 확인). 등록/수정은 데스크톱에서만 가능. */
export default function MobileStoreListPage() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [rows, setRows] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<Store | null>(null)

  useEffect(() => {
    listStores(EMPTY_STORE_FILTER).then((list) => {
      setRows(list)
      setLoading(false)
    })
  }, [])

  const openDetail = (id: string) => {
    getStore(id).then(setDetail)
  }

  const q = query.trim()
  const filtered = q
    ? rows.filter(
        (s) =>
          s.storeName.includes(q) ||
          s.contactName.includes(q) ||
          s.claimedStaff.includes(q) ||
          s.claimedPart.includes(q),
      )
    : rows

  if (detail) return <MobileStoreDetail store={detail} onClose={() => setDetail(null)} />

  return (
    <div className="min-h-screen bg-[#0a0e1a] px-4 py-5">
      <div className="mb-3">
        <button onClick={() => navigate('/')} className="inline-flex items-center gap-0.5 text-[12px] text-[#94a3b8] hover:text-white">
          <ChevronLeft size={14} /> 처음으로
        </button>
      </div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-1.5 text-[18px] font-extrabold text-text-strong">
          <StoreIcon size={18} /> 매장섭외관리
        </h1>
        <div className="flex items-center gap-2">
          <span className="max-w-[140px] truncate text-[11px] text-[#64748b]">{user?.email}</span>
          <button onClick={() => signOut()} className="text-[11px] font-semibold text-[#94a3b8] hover:text-white">
            로그아웃
          </button>
        </div>
      </div>

      <div className="relative mb-3">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="매장명 / 담당자 / 선점파트·담당자 검색"
          className={inputCls}
        />
      </div>

      <div className="mb-2 text-[12.5px] text-[#94a3b8]">
        총 <span className="font-bold text-text-strong">{filtered.length}</span>건
      </div>

      <div className="space-y-2">
        {filtered.map((s) => (
          <button
            key={s.id}
            onClick={() => openDetail(s.id)}
            className="flex w-full flex-col rounded-[12px] border border-border bg-card p-3.5 text-left active:bg-hover"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[14.5px] font-bold text-text-strong">{s.storeName}</span>
              <Badge tone={storeStatusTone(s.status)}>{s.status}</Badge>
            </div>
            <div className="mt-1 flex items-center gap-1 text-[11.5px] text-[#94a3b8]">
              <MapPin size={11} className="shrink-0" />
              <span className="truncate">{s.roadAddress || '-'}</span>
            </div>
            <div className="mt-1 text-[11.5px] text-[#94a3b8]">
              선점파트 {s.claimedPart || '-'} · 선점담당 {s.claimedStaff || '-'}
            </div>
          </button>
        ))}
        {!loading && filtered.length === 0 && (
          <div className="rounded-[12px] border border-dashed border-border px-3 py-10 text-center text-[12.5px] text-[#64748b]">
            {q ? '검색된 매장이 없습니다.' : '등록된 매장이 없습니다.'}
          </div>
        )}
      </div>
    </div>
  )
}

function MobileStoreDetail({ store, onClose }: { store: Store; onClose: () => void }) {
  return (
    <div className="min-h-screen bg-[#0a0e1a] px-4 py-5">
      <div className="mb-3">
        <button onClick={onClose} className="inline-flex items-center gap-0.5 text-[12px] text-[#94a3b8] hover:text-white">
          <ChevronLeft size={14} /> 목록으로
        </button>
      </div>
      <div className="mb-4 flex items-center gap-2">
        <h1 className="text-[17px] font-extrabold text-text-strong">{store.storeName}</h1>
        <Badge tone={storeStatusTone(store.status)}>{store.status}</Badge>
      </div>

      <div className="space-y-4">
        <section className="rounded-[12px] border border-border bg-card p-3.5">
          <h3 className="mb-2 text-[12.5px] font-extrabold text-text-strong">매장 정보</h3>
          <div className="space-y-1.5 text-[13px]">
            <MRow label="주소" value={`${store.roadAddress} ${store.detailAddress}`.trim() || '-'} />
            <MRow label="전화번호" value={store.storePhone || '-'} />
            <MRow label="사업자등록번호" value={store.businessRegNo || '-'} />
            <MRow label="업종/업태" value={store.businessType || '-'} />
            <MRow label="진행상태(실측)" value={store.progressStatus || '-'} />
            <MRow label="CEO컨펌" value={store.ceoConfirm || '-'} />
            <MRow label="실측(예정)일" value={store.surveyDate || '-'} />
          </div>
        </section>

        <section className="rounded-[12px] border border-border bg-card p-3.5">
          <h3 className="mb-2 text-[12.5px] font-extrabold text-text-strong">담당자 · 선점 정보</h3>
          <div className="space-y-1.5 text-[13px]">
            <MRow label="담당자" value={store.contactName || '-'} />
            <MRow label="담당자 휴대폰" value={store.contactMobile || '-'} />
            <MRow label="선점 파트" value={store.claimedPart || '-'} />
            <MRow label="선점 담당자" value={store.claimedStaff || '-'} />
            <MRow label="선점 만료일" value={dateText(store.claimExpiresAt) || '-'} />
            <MRow label="비고" value={store.memo || '-'} />
          </div>
        </section>

        <section className="rounded-[12px] border border-border bg-card p-3.5">
          <h3 className="mb-2 text-[12.5px] font-extrabold text-text-strong">
            섭외 접촉이력 ({store.log.length})
          </h3>
          <div className="space-y-2">
            {store.log.map((l) => (
              <div key={l.id} className="rounded-[8px] border border-border p-2.5 text-[12.5px]">
                <div className="flex flex-wrap items-center gap-1.5">
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

        {store.photos.length > 0 && (
          <section className="rounded-[12px] border border-border bg-card p-3.5">
            <h3 className="mb-2 text-[12.5px] font-extrabold text-text-strong">매장 사진</h3>
            <div className="grid grid-cols-3 gap-2">
              {store.photos.map((p) => (
                <a
                  key={p.id}
                  href={p.driveViewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-[8px] border border-border px-2 py-1.5 text-center text-[11px] text-primary hover:bg-hover"
                >
                  사진 보기
                </a>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function MRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 text-[#64748b]">{label}</span>
      <span className="truncate text-right text-[#e2e8f0]">{value}</span>
    </div>
  )
}
