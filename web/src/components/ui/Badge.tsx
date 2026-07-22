// 시스템 공통 배지 — 연한 바탕(bg) + 짙은 동일색 텍스트(fg)
// 상태/내용/결재구분 등 모든 배지에 동일 스타일 적용

export type Tone =
  | 'green'
  | 'blue'
  | 'sky'
  | 'amber'
  | 'red'
  | 'purple'
  | 'teal'
  | 'slate'

// 다크 테마 배지 — 은은한(반투명) 동일색 바탕 + 선명한 동일색 텍스트
export const TONES: Record<Tone, { fg: string; bg: string }> = {
  green: { fg: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' },
  blue: { fg: '#60a5fa', bg: 'rgba(96, 165, 250, 0.15)' },
  sky: { fg: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' },
  amber: { fg: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  red: { fg: '#f87171', bg: 'rgba(248, 113, 113, 0.15)' },
  purple: { fg: '#a78bfa', bg: 'rgba(167, 139, 250, 0.15)' },
  teal: { fg: '#2dd4bf', bg: 'rgba(45, 212, 191, 0.15)' },
  slate: { fg: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)' },
}

export default function Badge({
  tone,
  children,
  className = '',
}: {
  tone: Tone
  children: React.ReactNode
  className?: string
}) {
  const t = TONES[tone]
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11.5px] font-bold ${className}`}
      style={{ color: t.fg, background: t.bg, border: `1px solid ${t.fg}33` }}
    >
      {children}
    </span>
  )
}

/* ── 도메인별 톤 리졸버 ─────────────────────────── */

/** 계약 상태 → 톤 */
export function statusTone(status: string): Tone {
  switch (status) {
    case '신규':
      return 'green'
    case '증액':
      return 'sky'
    case '양수':
      return 'blue'
    case '양도':
      return 'amber'
    case '해지':
      return 'red'
    case '폐기':
      return 'slate'
    default:
      return 'slate'
  }
}

/** 결재구분(카드/현금/카드현금·혼합) → 톤 */
export function methodTone(method: string): Tone {
  switch (method) {
    case '카드':
      return 'blue'
    case '현금':
      return 'green'
    case '혼합':
    case '카드현금':
      return 'purple'
    default:
      return 'slate'
  }
}

/** 매출구분(내용) → 톤 */
export function categoryTone(cat: string): Tone {
  if (cat.includes('점주보증금') || cat.includes('보증금')) return 'green'
  if (cat.includes('구독')) return 'sky'
  // 라스온현황(LasOnStatusPage)의 구분 배지와 동일한 색상 규칙 — 파트장=blue, 파트너=green과 구분되도록 파트너는 purple
  if (cat.includes('파트장')) return 'blue'
  if (cat.includes('파트너')) return 'purple'
  if (cat.includes('매장')) return 'teal'
  if (cat.includes('독서')) return 'sky'
  if (cat.includes('현금')) return 'green'
  if (cat.includes('LASBOOK') || cat.includes('교재')) return 'amber'
  return 'slate'
}

/** 직급 → 톤 (직위가 높을수록 눈에 띄는 색). 미등록 직급은 slate */
export function positionTone(position: string): Tone {
  switch (position) {
    case '예비과장':
      return 'slate'
    case '점주':
      return 'teal'
    case '과장':
      return 'blue'
    case '차장':
      return 'sky'
    case '부장':
      return 'green'
    case '이사':
      return 'purple'
    case '상무':
    case '전무':
    case '부사장':
      return 'amber'
    default:
      return 'slate'
  }
}

/**
 * 지점명 → 톤. 지점은 수십 개라 고정 매핑 대신 이름 해시로 톤을 배정한다.
 * 같은 지점은 항상 같은 색이 되고, 지점이 추가돼도 코드 수정이 필요 없다.
 */
const BRANCH_TONES: Tone[] = ['blue', 'green', 'amber', 'purple', 'teal', 'sky', 'red']
export function branchTone(branch: string): Tone {
  if (!branch) return 'slate'
  let h = 0
  for (let i = 0; i < branch.length; i++) h = (h * 31 + branch.charCodeAt(i)) >>> 0
  return BRANCH_TONES[h % BRANCH_TONES.length]
}

/** 매장선정관리 섭외 상태 → 톤 */
export function storeStatusTone(status: string): Tone {
  switch (status) {
    case '신규등록':
      return 'slate'
    case '접촉중':
      return 'sky'
    case '실무협의':
      return 'blue'
    case '실측예정':
      return 'purple'
    case '실측완료':
      return 'amber'
    case '모델링':
      return 'teal'
    case '계약완료':
      return 'green'
    case '공사':
      return 'amber'
    case '집기발주':
      return 'sky'
    case '도서불출':
      return 'blue'
    case '오픈':
      return 'green'
    default:
      return 'slate'
  }
}

/** 계약구분 → 톤. 시스템관리 공통코드로 새 구분이 추가돼도 지점명과 같은 해시 방식으로 대응한다. */
export function contractTypeTone(type: string): Tone {
  switch (type) {
    case 'LAS매장점주':
      return 'teal'
    case '직원':
      return 'slate'
    case 'LAS-On파트장':
      return 'blue'
    case 'LAS-On파트너':
      return 'purple'
    default:
      return branchTone(type)
  }
}
