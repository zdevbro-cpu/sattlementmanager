import { useEffect, useState } from 'react'
import { ChevronLeft, Copy, ExternalLink, RefreshCw, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Badge, { type Tone } from '../../components/ui/Badge'
import { dateText } from '../../lib/format'
import { fetchMyApplications, type MyApplication } from '../../lib/api'

/** 택배사별 배송조회 페이지 — 송장번호가 등록되면 링크를 걸어준다.
 *  자동 추적(크론 폴링)은 아직 없으므로, 상세 진행은 택배사 페이지에서 확인한다. */
const TRACKING_URL: Record<string, string> = {
  CJ대한통운: 'https://trace.cjlogistics.com/next/tracking.html?wblNo=',
  롯데택배: 'https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=',
  한진택배: 'https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2=',
  우체국택배: 'https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=',
  로젠택배: 'https://www.ilogen.com/web/personal/trace/',
}

function trackingUrl(carrier: string, no: string): string {
  const base = TRACKING_URL[carrier.trim()]
  return base ? base + encodeURIComponent(no) : ''
}

function statusTone(s: string): Tone {
  switch (s) {
    case '접수됨':
      return 'slate'
    case '배송지 확인 필요':
      return 'amber'
    case '발송 준비중':
      return 'sky'
    case '배송중':
      return 'purple'
    case '배송완료':
      return 'green'
    case '취소됨':
      return 'red'
    default:
      return 'slate'
  }
}

/**
 * 내 신청·배송 조회 (모바일) — 점주가 올린 교재신청과 배송 상태를 확인한다.
 * 구매자가 배송을 문의하면 여기서 확인해 알려주는 용도라, 송장번호는 복사 버튼을 둔다.
 * 점장은 자기 지점 점주가 올린 건까지 함께 보인다(범위는 서버가 정한다).
 */
export default function MobileMyApplicationsPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<MyApplication[]>([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [copied, setCopied] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    setErr('')
    fetchMyApplications(keyword.trim())
      .then((list) => {
        if (!alive) return
        setRows(list)
        setLoading(false)
      })
      .catch((e) => {
        if (!alive) return
        setErr((e as Error).message || '내역을 불러오지 못했습니다.')
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [keyword, refresh])

  const copy = async (no: string) => {
    try {
      await navigator.clipboard.writeText(no)
      setCopied(no)
      setTimeout(() => setCopied(''), 1500)
    } catch {
      /* 클립보드를 못 쓰는 환경 — 사용자가 직접 선택해 복사하면 된다 */
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0e1a] px-4 py-5">
      <div className="mb-4 flex items-center gap-2">
        <button onClick={() => navigate('/')} className="text-[#94a3b8] hover:text-white">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-[16px] font-extrabold text-text-strong">내 신청·배송 조회</h1>
        <button
          onClick={() => setRefresh((n) => n + 1)}
          className="ml-auto text-[#94a3b8] hover:text-white"
          title="새로고침"
        >
          <RefreshCw size={17} />
        </button>
      </div>

      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b]" />
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="구매자명·자녀명·연락처·접수번호"
          className="h-11 w-full rounded-[10px] bg-input border border-border pl-9 pr-3 text-[14px] text-input-text placeholder:text-[#64748b] outline-none focus:border-primary"
        />
      </div>

      {err && (
        <div className="mb-3 rounded-[10px] border border-danger/40 bg-card p-3 text-[12.5px] text-danger">
          {err}
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {rows.map((r) => {
          const url = trackingUrl(r.carrier, r.trackingNo)
          return (
            <div key={r.id} className="rounded-[12px] border border-border bg-card p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[14.5px] font-bold text-text-strong">
                    {r.buyerName || '(구매자 미입력)'}
                    {r.childName && <span className="ml-1 text-[12.5px] text-[#94a3b8]">({r.childName})</span>}
                  </div>
                  <div className="mt-0.5 text-[12px] text-[#94a3b8]">
                    {dateText(r.applyDate || r.createdAt)} · {r.id}
                  </div>
                </div>
                <Badge tone={statusTone(r.deliveryStatus)}>{r.deliveryStatus}</Badge>
              </div>

              <div className="mt-2 text-[12.5px] text-[#c2cde0]">
                {[r.book1Name, r.book2Name].filter(Boolean).join(', ') || '교재 미지정'}
              </div>
              {r.address && <div className="mt-0.5 text-[12px] text-[#94a3b8] break-all">{r.address}</div>}

              {r.trackingNo && (
                <div className="mt-2.5 flex items-center gap-2 rounded-[8px] bg-hover px-2.5 py-2">
                  <span className="text-[12px] text-[#94a3b8] shrink-0">{r.carrier || '택배'}</span>
                  <span className="text-[13px] font-semibold text-text-strong tabular truncate">{r.trackingNo}</span>
                  <button
                    onClick={() => copy(r.trackingNo)}
                    className="ml-auto shrink-0 text-[#94a3b8] hover:text-white"
                    title="송장번호 복사"
                  >
                    <Copy size={15} />
                  </button>
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-primary hover:brightness-125"
                      title="택배사에서 조회"
                    >
                      <ExternalLink size={15} />
                    </a>
                  )}
                </div>
              )}
              {copied === r.trackingNo && r.trackingNo && (
                <div className="mt-1 text-[11.5px] text-success">송장번호를 복사했습니다.</div>
              )}
            </div>
          )
        })}

        {rows.length === 0 && (
          <div className="rounded-[12px] border border-border bg-card px-4 py-12 text-center text-[13px] text-[#64748b]">
            {loading ? '불러오는 중…' : keyword ? '검색 결과가 없습니다.' : '신청 내역이 없습니다.'}
          </div>
        )}
      </div>
    </div>
  )
}
