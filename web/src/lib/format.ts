/** 숫자 → 통화(원) 표기 */
export function won(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '-'
  return n.toLocaleString('ko-KR') + '원'
}

/** 숫자 → 천단위 콤마 (단위 없음) */
export function comma(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '-'
  return n.toLocaleString('ko-KR')
}

/** 날짜 문자열 정규화 표시 (없으면 '-') */
export function dateText(s: string | null | undefined): string {
  if (!s) return '-'
  return s
}

/** YYYY-MM-DD 문자열 파싱 → Date (비교용). 실패 시 null */
export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * 수동입력 중인 숫자열을 표시용으로 정리한다 (완성 전 미리보기).
 * 6자리(yymmdd) 완성 시 formatYyMmDd에서 "20" prefix를 붙여 최종 ISO로 변환한다.
 */
export function previewYyMmDd(digits: string): string {
  if (digits.length > 4) return `${digits.slice(0, 2)}${digits.slice(2, 4)}-${digits.slice(4)}`
  return digits
}

/** yymmdd(6자리) → "20"+yy-mm-dd (예: 260705 → 2026-07-05). 6자리 미만이면 null */
export function formatYyMmDd(digits: string): string | null {
  if (digits.length !== 6) return null
  const yy = digits.slice(0, 2)
  const mm = digits.slice(2, 4)
  const dd = digits.slice(4, 6)
  return `20${yy}-${mm}-${dd}`
}
