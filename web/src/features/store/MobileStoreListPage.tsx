import { useEffect, useState } from 'react'
import InstallPrompt from '../../components/ui/InstallPrompt'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, MapPin, Search, Store as StoreIcon } from 'lucide-react'
import Badge, { dDayTone, storeStatusTone } from '../../components/ui/Badge'
import { dateText } from '../../lib/format'
import { useAuth } from '../auth/AuthContext'
import {
  EMPTY_STORE_FILTER,
  RELEASED_FILTER_VALUE,
  STORE_PHOTO_KINDS,
  STORE_STATUSES,
  type Store,
} from '../../types/store'
import { fetchPartLeaders } from '../../lib/api'
import { getStore, listStores } from './storeStore'
import StoreMapView from './StoreMapView'
import { useCodes } from '../../lib/codeStore'

const inputCls =
  'h-11 w-full rounded-[8px] bg-input border border-border pl-9 pr-3 text-[14px] text-input-text outline-none focus:border-primary'
/** 검색창 아래 2x2 필터 공통 스타일 (검색창과 달리 좌측 아이콘 여백이 없다) */
const filterCls =
  'h-11 w-full rounded-[8px] bg-input border border-border px-3 text-[14px] text-input-text outline-none focus:border-primary'

/** 오늘 날짜(KST, YYYY-MM-DD) — 서버의 상태변경일 계산과 동일한 기준(KST 달력일)을 쓴다 */
function todayIsoKst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

/**
 * 선점 만료일까지 남은 일수 (음수=이미 지남) — 없으면 null.
 * 시각(시/분)은 무시하고 순수 날짜 차이로만 계산해야 등록 당일에 정확히 D-7이 된다.
 */
function dDay(dateStr: string): number | null {
  if (!dateStr) return null
  const [y1, m1, d1] = todayIsoKst().split('-').map(Number)
  const [y2, m2, d2] = dateStr.split('-').map(Number)
  const today = Date.UTC(y1, m1 - 1, d1)
  const target = Date.UTC(y2, m2 - 1, d2)
  return Math.round((target - today) / (24 * 3600 * 1000))
}

/** 모바일 매장섭외관리 — 조회 전용(목록 검색 + 상세 확인). 등록/수정은 데스크톱에서만 가능. */
export default function MobileStoreListPage() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [rows, setRows] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('전체')
  const [claimedPart, setClaimedPart] = useState('')
  const [claimedStaff, setClaimedStaff] = useState('')
  const [businessUnit, setBusinessUnit] = useState('')
  const [partLeaders, setPartLeaders] = useState<string[]>([])
  const [detail, setDetail] = useState<Store | null>(null)
  const [view, setView] = useState<'list' | 'map'>('list')
  const codes = useCodes()

  useEffect(() => {
    listStores(EMPTY_STORE_FILTER).then((list) => {
      setRows(list)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    fetchPartLeaders().then(setPartLeaders)
  }, [])

  const openDetail = (id: string) => {
    getStore(id).then(setDetail)
  }

  const q = query.trim()
  const filtered = rows.filter((s) => {
    if (q && !(s.storeName.includes(q) || s.contactName.includes(q) || s.claimedStaff.includes(q) || s.claimedPart.includes(q)))
      return false
    if (status === RELEASED_FILTER_VALUE) {
      if (s.claimedPart || s.claimedStaff) return false
    } else if (status !== '전체' && s.status !== status) {
      return false
    }
    if (claimedPart && s.claimedPart !== claimedPart) return false
    if (claimedStaff.trim() && !s.claimedStaff.includes(claimedStaff.trim())) return false
    // 사업부는 매장 자체 값으로 거른다 — 계정 조회(/api/staff)는 관리자 전용이라 파트너 화면에선 쓸 수 없다
    if (businessUnit && (s.businessUnit || 'LASON(본사)') !== businessUnit) return false
    return true
  })

  if (detail) return <MobileStoreDetail store={detail} onClose={() => setDetail(null)} />

  return (
    <div className="min-h-screen bg-[#0a0e1a] px-4 py-5">
      {/* 홈 화면에 추가 안내 — 파트너가 매번 주소를 치지 않게 하는 것이 목적이라 진입 화면 맨 위에 둔다 */}
      <InstallPrompt />
      <div className="mb-3">
        <button onClick={() => navigate('/')} className="inline-flex items-center gap-0.5 text-[12px] text-[#94a3b8] hover:text-white">
          <ChevronLeft size={14} /> 처음으로
        </button>
      </div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-1.5 text-[18px] font-extrabold text-text-strong">
          <StoreIcon size={18} /> 매장진행관리
        </h1>
        <div className="flex items-center gap-2">
          <span className="max-w-[140px] truncate text-[11px] text-[#64748b]">{user?.email}</span>
          <button onClick={() => signOut()} className="text-[11px] font-semibold text-[#94a3b8] hover:text-white">
            로그아웃
          </button>
        </div>
      </div>

      {/* 목록 / 지도 전환 — 지도는 조회 전용이라 검색·필터는 지도 안에서 따로 제공한다 */}
      <div className="mb-3 flex gap-1 border-b border-border">
        {(['list', 'map'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-2 text-[14px] font-bold border-b-2 -mb-px ${
              view === v ? 'border-primary text-text-strong' : 'border-transparent text-[#94a3b8]'
            }`}
          >
            {v === 'list' ? '목록' : '지도'}
          </button>
        ))}
      </div>

      {view === 'map' && <StoreMapView stores={rows} compact />}

      {view === 'list' && (
      <>
      <div className="relative mb-2">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="매장명 / 담당자 / 선점파트·담당자 검색"
          className={inputCls}
        />
      </div>

      {/* 사업부 · 선점파트 · 선점담당자 · 상태 순으로 2x2 배치 */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <select
          value={businessUnit}
          onChange={(e) => setBusinessUnit(e.target.value)}
          className={filterCls}
        >
          <option value="">사업부 전체</option>
          {codes.businessUnits.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select
          value={claimedPart}
          onChange={(e) => setClaimedPart(e.target.value)}
          className={filterCls}
        >
          <option value="">선점 파트 전체</option>
          {partLeaders.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <input
          value={claimedStaff}
          onChange={(e) => setClaimedStaff(e.target.value)}
          placeholder="선점 담당자명"
          className={filterCls}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={filterCls}>
          <option value="전체">상태 전체</option>
          {STORE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          <option value={RELEASED_FILTER_VALUE}>{RELEASED_FILTER_VALUE}</option>
        </select>
      </div>

      <div className="mb-2 text-[12.5px] text-[#94a3b8]">
        총 <span className="font-bold text-text-strong">{filtered.length}</span>건
      </div>

      <div className="space-y-2">
        {filtered.map((s) => {
          const d = dDay(s.claimExpiresAt)
          return (
            <button
              key={s.id}
              onClick={() => openDetail(s.id)}
              className="flex w-full flex-col rounded-[12px] border border-border bg-card p-3.5 text-left active:bg-hover"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[14.5px] font-bold text-text-strong">{s.storeName}</span>
                <div className="flex shrink-0 items-center gap-1.5">
                  {!s.claimedPart && !s.claimedStaff ? (
                    <Badge tone="red">선점해지</Badge>
                  ) : (
                    <Badge tone={storeStatusTone(s.status)}>{s.status}</Badge>
                  )}
                </div>
              </div>
              <div className="mt-1 flex items-center gap-1 text-[11.5px] text-[#94a3b8]">
                <MapPin size={11} className="shrink-0" />
                <span className="truncate">{s.roadAddress || '-'}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11.5px] text-[#94a3b8]">
                <span>선점파트 {s.claimedPart || '-'} · 선점담당 {s.claimedStaff || '-'}</span>
                {d !== null && (
                  <Badge tone={dDayTone(d)} className="shrink-0">
                    {d >= 0 ? `D-${d}` : `만료 D+${-d}`}
                  </Badge>
                )}
              </div>
            </button>
          )
        })}
        {!loading && filtered.length === 0 && (
          <div className="rounded-[12px] border border-dashed border-border px-3 py-10 text-center text-[12.5px] text-[#64748b]">
            {q ? '검색된 매장이 없습니다.' : '등록된 매장이 없습니다.'}
          </div>
        )}
      </div>
      </>
      )}
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
            <div className="space-y-2.5">
              {STORE_PHOTO_KINDS.map((kind) => {
                // 분류 이전에 등록된 사진은 kind 가 비어 있어 '건물외관'으로 본다(서버 기본값과 동일)
                const kindPhotos = store.photos.filter((p) => (p.kind || '건물외관') === kind)
                if (kindPhotos.length === 0) return null
                return (
                  <div key={kind}>
                    <div className="mb-1 text-[11.5px] font-semibold text-[#94a3b8]">{kind}</div>
                    <div className="grid grid-cols-3 gap-2">
                      {kindPhotos.map((p) => (
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
                  </div>
                )
              })}
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
