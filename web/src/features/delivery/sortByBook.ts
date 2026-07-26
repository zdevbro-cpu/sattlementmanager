import type { Shipment } from '../../types/delivery'

/**
 * 교재별 정렬 — 같은 교재끼리 모아 준다.
 *
 * 창고에서 책을 집을 때(피킹) 같은 교재가 흩어져 있으면 매번 다른 선반을 오가야 한다.
 * 엑셀·송장인쇄·송장 일괄입력이 모두 같은 순서로 나와야 작업이 한 방향으로 흐른다.
 *
 * 교재1 → 교재2 → 수령인 순으로 정렬하고, 교재가 비어 있는 건은 뒤로 보낸다
 * (집을 물건이 정해지지 않은 건이라 마지막에 확인하는 편이 낫다).
 */
export function sortByBook(list: Shipment[]): Shipment[] {
  const key = (s: Shipment) => `${s.book1Name || ''}|${s.book2Name || ''}`
  const isEmpty = (s: Shipment) => !s.book1Name && !s.book2Name
  return [...list].sort((a, b) => {
    const ea = isEmpty(a)
    const eb = isEmpty(b)
    if (ea !== eb) return ea ? 1 : -1
    const c = key(a).localeCompare(key(b), 'ko')
    if (c !== 0) return c
    return (a.recipientName || '').localeCompare(b.recipientName || '', 'ko')
  })
}
