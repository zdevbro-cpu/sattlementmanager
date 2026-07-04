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
