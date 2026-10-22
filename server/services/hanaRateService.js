// 하나은행 고시환율 조회 — 지정일의 1회차(최초) USD 매매기준율.
//
// 하나은행은 공식 환율 API가 없어 홈페이지 '환율조회' 화면이 쓰는 요청을 서버가 대신 보낸다.
// 화면 구조가 바뀌거나 접근이 막히면 실패할 수 있으므로, 호출하는 쪽은 실패 시 수동 입력으로 넘어가야 한다.
// 필요한 날짜만 그때그때 1건씩 조회하고 결과는 환율표(exchange_rates)에 저장해 다시 묻지 않는다.
//
// 휴일·주말 날짜를 넣으면 하나은행이 직전 영업일 고시분을 돌려준다(고시일을 함께 반환).
const RATE_URL = 'https://www.kebhana.com/cms/rate/wpfxd651_01i_01.do'
const REFERER = 'https://www.kebhana.com/cms/rate/index.do?contentUrl=/cms/rate/wpfxd651_01i.do'

const num = (s) => Number(String(s).replace(/[^\d.]/g, ''))

/**
 * @param {string} dateIso YYYY-MM-DD
 * @returns {Promise<{ rate: number, noticeDate: string, noticedAt: string }>}
 */
async function fetchHanaFirstUsdRate(dateIso) {
  const ymd = String(dateIso || '').replace(/-/g, '')
  if (!/^\d{8}$/.test(ymd)) throw new Error('날짜 형식이 올바르지 않습니다.')

  const body = new URLSearchParams({
    ajax: 'true',
    curCd: '',
    tmpInqStrDt: '',
    pbldDvCd: '1', // 회차별 고시
    pbldSqn: '',
    hid_key_data: '',
    inqStrDt: ymd,
    inqKindCd: '1', // 1회차(최초)
    hid_enc_data: '',
    requestTarget: 'searchContentDiv',
  })
  const res = await fetch(RATE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: REFERER,
      'User-Agent': 'Mozilla/5.0',
    },
    body,
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`하나은행 환율 조회 실패 (${res.status})`)
  const html = await res.text()

  // USD 행 — 셀 순서: 통화 | 현찰 사실때 | Spread | 현찰 파실때 | Spread | 송금 보낼때 | 받을때 | T/C 사실때 | 매매기준율 | …
  const row = html.split(/<tr[\s>]/i).find((r) => /goFluctuation\('USD'/.test(r))
  if (!row) throw new Error('하나은행 응답에서 USD 환율을 찾지 못했습니다.')
  const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1].replace(/<[^>]+>/g, '').trim())
  const cashBuy = num(cells[1])
  const cashSell = num(cells[3])
  const rate = num(cells[8])
  // 매매기준율은 현찰 파실때 ~ 사실때 사이에 있어야 한다 — 화면 구조가 바뀌어 다른 칸을 읽는 것을 막는다
  if (!(rate > 0) || !(rate > cashSell && rate < cashBuy)) {
    throw new Error('하나은행 응답 형식이 바뀌어 매매기준율을 읽지 못했습니다.')
  }

  const fx = row.match(/goFluctuation\('USD','(\d{8})'\)/)
  const noticeYmd = fx ? fx[1] : ymd
  const noticeDate = `${noticeYmd.slice(0, 4)}-${noticeYmd.slice(4, 6)}-${noticeYmd.slice(6, 8)}`
  const t = html.match(/(\d{2})시(\d{2})분(\d{2})초\s*<\/strong>\s*<strong>\(1회차\)/)
  const noticedAt = t ? `${noticeDate} ${t[1]}:${t[2]}:${t[3]}` : noticeDate

  return { rate, noticeDate, noticedAt }
}

module.exports = { fetchHanaFirstUsdRate }
