// 주소 → 좌표·행정구역 변환 (네이버 클라우드 플랫폼 Geocoding API)
//
// 키는 서버에만 둔다 — branchfinder 는 브라우저에서 직접 호출하며 Client Secret 이
// 번들에 노출됐는데, 여기서는 서버가 대신 호출해 그 문제를 없앤다.
//
// 한국 주소는 그대로 넣으면 실패가 잦다(층·동·호·점포명·시도 약칭 등).
// branchfinder services/geocoding.ts 의 주소 정규화·변형 생성 로직을 이식해,
// 후보를 여러 개 만들어 순서대로 시도한다.
const GEOCODE_URL = 'https://maps.apigw.ntruss.com/map-geocode/v2/geocode'

/** 시도 약칭 → 정식 명칭 */
const REGION_EXPANSIONS = {
  서울: '서울특별시',
  부산: '부산광역시',
  대구: '대구광역시',
  인천: '인천광역시',
  광주: '광주광역시',
  대전: '대전광역시',
  울산: '울산광역시',
  세종: '세종특별자치시',
  경기: '경기도',
  강원: '강원특별자치도',
  충북: '충청북도',
  충남: '충청남도',
  전북: '전북특별자치도',
  전남: '전라남도',
  경북: '경상북도',
  경남: '경상남도',
  제주: '제주특별자치도',
}

const STORE_PATTERN =
  /(롯데마트|홈플러스|이마트|코스트코|트레이더스|백화점|롯데몰|신세계|현대백화점|갤러리아|AK플라자|메가마트|빅마트|하이마트)/g
const FLOOR_PATTERN = /(지하|지상)?\s*\d+\s*층|B\s*\d+\s*층|B\s*\d+/g
const UNIT_PATTERN = /\s*\d+\s*(동|호)\s*/g

function normalizeAddress(input) {
  if (!input) return ''
  return String(input)
    .replace(/사구/g, '서구') // 실데이터 오타 보정
    .replace(/인천시/g, '인천광역시')
    .replace(/\([^)]*\)/g, ' ') // 괄호 안 부가설명 제거
    .replace(/[，,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 지오코딩 성공률을 높이기 위한 주소 후보 목록 (앞쪽이 원본에 가깝다) */
function buildAddressVariants(input, storeName) {
  const variants = new Set()
  const base = normalizeAddress(input)
  const push = (v) => {
    const t = normalizeAddress(v)
    if (t) variants.add(t)
  }

  push(input)
  push(base)

  const noUnit = base.replace(UNIT_PATTERN, ' ')
  push(noUnit)
  const noStore = base.replace(STORE_PATTERN, ' ')
  const noFloor = base.replace(FLOOR_PATTERN, ' ')
  push(noStore)
  push(noFloor)
  push(noStore.replace(FLOOR_PATTERN, ' '))
  push(noUnit.replace(STORE_PATTERN, ' ').replace(FLOOR_PATTERN, ' '))

  // 시도 약칭 → 정식 명칭
  const regionKey = Object.keys(REGION_EXPANSIONS).find((k) => base.startsWith(`${k} `))
  if (regionKey) push(base.replace(`${regionKey} `, `${REGION_EXPANSIONS[regionKey]} `))

  // 도로명 + 건물번호까지만 (상세주소가 방해할 때)
  const roadMatch = base.match(/(.+?(로|길|대로)\s*\d+(?:-\d+)?)/)
  if (roadMatch) push(roadMatch[1])

  if (storeName) push(`${base.split(' ')[0]} ${storeName}`)

  return Array.from(variants)
}

/** 네이버 응답의 addressElements 에서 시도/시군구를 뽑는다 (주소 문자열 파싱보다 정확) */
function pickRegion(address) {
  const el = address.addressElements || []
  const find = (type) => {
    const hit = el.find((e) => (e.types || []).includes(type))
    return (hit && (hit.longName || hit.shortName)) || ''
  }
  return {
    sido: find('SIDO'),
    // 시/군/구 — 광역시의 '구'와 도의 '시/군'이 각각 여기에 담긴다
    sigungu: find('SIGUGUN') || find('SIGUNGU'),
  }
}

function creds() {
  const id = (process.env.NAVER_MAP_CLIENT_ID || '').trim()
  const secret = (process.env.NAVER_MAP_CLIENT_SECRET || '').trim()
  return { id, secret, ok: !!(id && secret) }
}

async function requestGeocode(query) {
  const { id, secret } = creds()
  const url = `${GEOCODE_URL}?query=${encodeURIComponent(query)}`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'x-ncp-apigw-api-key-id': id,
      'x-ncp-apigw-api-key': secret,
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    // 210 = 서비스 미신청/권한없음 — 콘솔에서 Geocoding 활성화가 필요하다
    if (body.includes('"210"') || /permission/i.test(body)) {
      throw new Error('네이버 Geocoding 서비스 권한이 없습니다. 콘솔에서 해당 Application에 Geocoding 이용 신청이 되어 있는지 확인하세요.')
    }
    throw new Error(`지오코딩 요청 실패 (${res.status}) ${body.slice(0, 200)}`)
  }

  const data = await res.json()
  if (!data.addresses || data.addresses.length === 0) return null
  const a = data.addresses[0]
  const lat = parseFloat(a.y)
  const lng = parseFloat(a.x)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng, ...pickRegion(a) }
}

/**
 * 주소 → { lat, lng, sido, sigungu }. 실패하면 null.
 * 후보 주소를 순서대로 시도하고, 하나라도 성공하면 그 결과를 쓴다.
 */
async function geocodeAddress(address, storeName) {
  if (!creds().ok) throw new Error('NAVER_MAP_CLIENT_ID / NAVER_MAP_CLIENT_SECRET 이 설정되지 않았습니다.')
  if (!String(address || '').trim()) return null

  for (const q of buildAddressVariants(address, storeName)) {
    const hit = await requestGeocode(q)
    if (hit) return hit
  }
  return null
}

module.exports = { geocodeAddress, buildAddressVariants, normalizeAddress }
