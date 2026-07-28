import { useEffect, useMemo, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import { STORE_PHOTO_KINDS, type Store } from '../../types/store'

/**
 * 매장 지도 — 구축된 라스온 매장을 전국 지도에 표시한다.
 * 지도 SDK는 네이버 지도 v3. 스크립트를 동적으로 주입하고 중복 로드를 막는다.
 * 좌표는 서버가 주소를 지오코딩해 채운 값(store.lat/lng)을 그대로 쓴다.
 */

// 지도 SDK 타입은 전역 window 에만 존재한다
declare global {
  interface Window {
    naver?: any
  }
}

/** 진행 단계 구분 — 도서불출부터를 '구축완료'로 본다 */
const BUILDING_STATUSES = ['계약완료', '공사', '집기발주']
const DONE_STATUSES = ['도서불출', '오픈']

type Phase = '섭외중' | '구축중' | '구축완료'

function phaseOf(status: string): Phase {
  if (DONE_STATUSES.includes(status)) return '구축완료'
  if (BUILDING_STATUSES.includes(status)) return '구축중'
  return '섭외중'
}

// 진행도를 신호등처럼 단계적으로 읽히게 한다 (빨강 → 주황 → 초록).
// 값은 시스템 공통 색(danger/warning/success)과 동일하게 맞춘다.
const PHASE_COLOR: Record<Phase, string> = {
  섭외중: '#ef4444', // 빨강
  구축중: '#f59e0b', // 주황
  구축완료: '#16a34a', // 초록
}

/** 매장이 없을 때의 기본 중심 */
const KOREA_CENTER = { lat: 36.5, lng: 127.8 }
/**
 * 기본 확대 레벨 — 시/군/구가 구분되어 보이는 수준.
 * 전국 레벨(7)로 열면 마커가 뭉쳐 보여 어느 지역인지 읽히지 않는다.
 */
const DEFAULT_ZOOM = 12

/** 터치 기기 여부 — hover 가 없어 마커를 탭으로 열어야 한다 */
const isTouch =
  typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches

function markerIcon(color: string) {
  return {
    content: `<div style="position:relative;width:22px;height:32px;filter:drop-shadow(0 3px 4px rgba(0,0,0,.35))">
      <svg width="22" height="32" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 7.69 12 24 12 24s12-16.31 12-24c0-6.63-5.37-12-12-12Z" fill="${color}"/>
        <circle cx="12" cy="12" r="4.5" fill="#fff"/>
      </svg>
    </div>`,
    size: new window.naver.maps.Size(22, 32),
    anchor: new window.naver.maps.Point(11, 32),
  }
}

function esc(v: string): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 호버 카드 — 파트너·구축 장소·주소 + 사진 4분류 링크 */
function infoHtml(s: Store): string {
  const phase = phaseOf(s.status)
  // 분류별 사진 링크. 여러 장이면 장수를 함께 표기하고 첫 장으로 연결한다.
  // 분류 이전에 등록된 사진은 kind 가 비어 있어 '건물외관'으로 본다(서버 기본값과 동일).
  const photoLink = (kind: string) => {
    const list = s.photos.filter((x) => (x.kind || '건물외관') === kind)
    if (list.length === 0) return ''
    const label = list.length > 1 ? `${kind} ${list.length}` : kind
    return `<a href="${esc(list[0].driveViewUrl)}" target="_blank" rel="noreferrer"
      style="display:inline-block;margin:0 5px 5px 0;padding:3px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:11px;color:#2563eb;text-decoration:none">${esc(label)}</a>`
  }
  const links = STORE_PHOTO_KINDS.map(photoLink).filter(Boolean).join('')
  const address = [s.roadAddress, s.detailAddress].filter(Boolean).join(' ')

  return `<div style="padding:12px 14px;min-width:230px;max-width:300px;font-family:'Malgun Gothic',sans-serif">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
      <span style="display:inline-block;padding:1px 7px;border-radius:999px;font-size:10.5px;font-weight:700;color:#fff;background:${PHASE_COLOR[phase]}">${phase}</span>
      <span style="font-size:11px;color:#64748b">${esc(s.status)}</span>
    </div>
    <div style="font-size:14.5px;font-weight:700;color:#1e293b;margin-bottom:4px">${esc(s.storeName)}</div>
    <div style="font-size:12px;color:#475569;line-height:1.45">${esc(address || '-')}</div>
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:11.5px;color:#64748b">
      담당 파트너 · ${esc(s.claimedStaff || '-')}${s.claimedPart ? ` (${esc(s.claimedPart)}파트)` : ''}
    </div>
    ${links ? `<div style="margin-top:8px">${links}</div>` : ''}
  </div>`
}

export default function StoreMapView({
  stores,
  compact = false,
}: {
  stores: Store[]
  /** 모바일 — 필터를 세로로 쌓고 지도 높이를 화면에 맞춘다 */
  compact?: boolean
}) {
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const infoRef = useRef<any>(null)
  // 최초 1회만 기본 레벨로 맞춘다 — 이후 필터 변경은 결과에 맞춰 확대/축소한다
  const didInitialFit = useRef(false)
  const [loaded, setLoaded] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [sido, setSido] = useState('전체')
  const [sigungu, setSigungu] = useState('전체')
  const [phase, setPhase] = useState<'전체' | Phase>('전체')

  // 좌표가 있는 매장만 지도에 올릴 수 있다
  const mappable = useMemo(
    () => stores.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng)),
    [stores],
  )

  const sidoList = useMemo(
    () => Array.from(new Set(mappable.map((s) => s.sido).filter(Boolean))).sort() as string[],
    [mappable],
  )
  const sigunguList = useMemo(() => {
    const pool = sido === '전체' ? mappable : mappable.filter((s) => s.sido === sido)
    return Array.from(new Set(pool.map((s) => s.sigungu).filter(Boolean))).sort() as string[]
  }, [mappable, sido])

  // 지역만 적용한 집합 — 단계별 건수는 이 기준으로 센다.
  // 단계 필터까지 반영하면 선택한 단계 외에는 항상 0으로 보여 현황 파악이 안 된다.
  const regionFiltered = useMemo(
    () =>
      mappable.filter((s) => {
        if (sido !== '전체' && s.sido !== sido) return false
        if (sigungu !== '전체' && s.sigungu !== sigungu) return false
        return true
      }),
    [mappable, sido, sigungu],
  )

  /** 선택 지역의 단계별 건수 (구축완료 → 구축중 → 섭외중 순으로 보여준다) */
  const phaseCounts = useMemo(() => {
    const c: Record<Phase, number> = { 섭외중: 0, 구축중: 0, 구축완료: 0 }
    regionFiltered.forEach((s) => {
      c[phaseOf(s.status)] += 1
    })
    return c
  }, [regionFiltered])

  const visible = useMemo(
    () => regionFiltered.filter((s) => phase === '전체' || phaseOf(s.status) === phase),
    [regionFiltered, phase],
  )

  // 지도 SDK 로드 + 초기화
  useEffect(() => {
    const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID
    if (!clientId) {
      setLoadErr('네이버 지도 Client ID가 설정되지 않았습니다. (VITE_NAVER_MAP_CLIENT_ID)')
      return
    }

    const init = () => {
      if (!mapEl.current || !window.naver?.maps || mapRef.current) return
      mapRef.current = new window.naver.maps.Map(mapEl.current, {
        center: new window.naver.maps.LatLng(KOREA_CENTER.lat, KOREA_CENTER.lng),
        zoom: DEFAULT_ZOOM,
        scaleControl: false,
        logoControl: false,
        mapDataControl: false,
        zoomControl: true,
        zoomControlOptions: { position: window.naver.maps.Position.TOP_RIGHT },
      })
      setLoaded(true)
    }

    if (window.naver?.maps) {
      init()
      return
    }

    const scriptId = 'naver-map-script'
    let script = document.getElementById(scriptId) as HTMLScriptElement | null
    if (!script) {
      script = document.createElement('script')
      script.id = scriptId
      script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}`
      script.async = true
      script.onerror = () => setLoadErr('네이버 지도 스크립트를 불러오지 못했습니다. 콘솔에 도메인이 등록되어 있는지 확인하세요.')
      document.head.appendChild(script)
    }
    script.addEventListener('load', init)
    return () => script?.removeEventListener('load', init)
  }, [])

  // 마커 갱신 — 필터가 바뀌면 다시 그린다
  useEffect(() => {
    if (!loaded || !mapRef.current) return
    const maps = window.naver.maps

    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current = []
    infoRef.current?.close()

    const bounds = new maps.LatLngBounds()
    visible.forEach((s) => {
      const pos = new maps.LatLng(s.lat as number, s.lng as number)
      const marker = new maps.Marker({
        position: pos,
        map: mapRef.current,
        icon: markerIcon(PHASE_COLOR[phaseOf(s.status)]),
        clickable: true,
      })

      const openInfo = () => {
        infoRef.current?.close()
        const info = new maps.InfoWindow({
          content: infoHtml(s),
          maxWidth: 320,
          backgroundColor: '#fff',
          borderColor: '#cbd5e1',
          borderWidth: 1,
          anchorSize: new maps.Size(10, 10),
          anchorColor: '#fff',
          pixelOffset: new maps.Point(0, -4),
        })
        info.open(mapRef.current, marker)
        infoRef.current = info
      }

      // 데스크톱은 호버로 열고 벗어나면 닫는다.
      // 터치 기기는 hover 가 없어 탭(click)으로도 열어야 한다 — 열어둔 카드는
      // 지도 빈 곳을 탭하면 닫히므로 mouseout 을 걸지 않는다.
      maps.Event.addListener(marker, 'click', openInfo)
      if (!isTouch) {
        maps.Event.addListener(marker, 'mouseover', openInfo)
        maps.Event.addListener(marker, 'mouseout', () => infoRef.current?.close())
      }

      bounds.extend(pos)
      markersRef.current.push(marker)
    })

    if (visible.length === 0) {
      mapRef.current.setCenter(new maps.LatLng(KOREA_CENTER.lat, KOREA_CENTER.lng))
      mapRef.current.setZoom(DEFAULT_ZOOM)
      return
    }
    if (visible.length === 1) {
      mapRef.current.setCenter(new maps.LatLng(visible[0].lat as number, visible[0].lng as number))
      mapRef.current.setZoom(15)
      return
    }

    // 처음 열 때는 매장이 몰려 있는 중심을 시/군/구 레벨로 보여준다.
    // 전체를 fitBounds 하면 전국 레벨까지 축소돼 어느 지역인지 읽히지 않는다.
    // 사용자가 지역·단계를 고른 뒤에는 그 결과가 모두 보이도록 fitBounds 한다.
    if (!didInitialFit.current) {
      didInitialFit.current = true
      mapRef.current.setCenter(bounds.getCenter())
      mapRef.current.setZoom(DEFAULT_ZOOM)
      return
    }
    mapRef.current.fitBounds(bounds)
  }, [loaded, visible])

  const selectCls =
    'h-[38px] rounded-[8px] bg-input border border-border px-3 text-[13px] text-input-text outline-none focus:border-primary'
  const noGeo = stores.length - mappable.length

  return (
    <div>
      <div className={`rounded-[14px] border border-border bg-card mb-3 ${compact ? 'p-3' : 'p-4 mb-4'}`}>
        <div className={compact ? 'grid grid-cols-3 gap-2' : 'flex flex-wrap items-end gap-3'}>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-[#94a3b8]">시/도</span>
            <select
              value={sido}
              onChange={(e) => {
                setSido(e.target.value)
                setSigungu('전체') // 시/도가 바뀌면 하위 선택을 초기화한다
              }}
              className={selectCls}
            >
              <option value="전체">전체</option>
              {sidoList.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-[#94a3b8]">시/군/구</span>
            <select value={sigungu} onChange={(e) => setSigungu(e.target.value)} className={selectCls}>
              <option value="전체">전체</option>
              {sigunguList.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-[#94a3b8]">진행 단계</span>
            <select value={phase} onChange={(e) => setPhase(e.target.value as typeof phase)} className={selectCls}>
              <option value="전체">전체</option>
              <option value="섭외중">섭외중</option>
              <option value="구축중">구축중</option>
              <option value="구축완료">구축완료</option>
            </select>
          </label>

          {/* 선택 지역의 단계별 건수 — 단계 필터와 무관하게 지역 전체 현황을 보여준다 */}
          <div className={`flex items-center gap-2 text-[12px] ${compact ? 'col-span-3 mt-1 flex-wrap' : 'ml-auto'}`}>
            {(['구축완료', '구축중', '섭외중'] as Phase[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPhase(phase === p ? '전체' : p)}
                title={`${p}만 보기 (다시 누르면 전체)`}
                className={`inline-flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1 transition-colors ${
                  phase === p ? 'border-primary bg-hover text-text-strong' : 'border-border text-[#94a3b8] hover:bg-hover'
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: PHASE_COLOR[p] }} />
                {p}
                <b className="text-[#c2cde0]">{phaseCounts[p]}</b>
              </button>
            ))}
          </div>
        </div>
        {noGeo > 0 && (
          <div className="mt-2 text-[11.5px] text-[#64748b]">
            ⓘ 주소로 좌표를 확인하지 못한 매장 {noGeo}건은 지도에 표시되지 않습니다. 매장 상세에서 도로명 주소를 정확히 입력하면 자동으로 반영됩니다.
          </div>
        )}
      </div>

      {loadErr ? (
        <div className="rounded-[14px] border border-danger/40 bg-card p-6 text-center text-[13px] text-danger">
          {loadErr}
        </div>
      ) : (
        <div className="rounded-[14px] border border-border bg-card overflow-hidden">
          <div
            ref={mapEl}
            style={{
              width: '100%',
              height: compact ? 'calc(100vh - 280px)' : 'calc(100vh - 380px)',
              minHeight: compact ? 380 : 460,
            }}
          />
          {!loaded && (
            <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-[#64748b]">
              <MapPin size={15} /> 지도를 불러오는 중…
            </div>
          )}
        </div>
      )}
    </div>
  )
}
