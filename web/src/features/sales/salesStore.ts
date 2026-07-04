// 매출 데이터 접근 계층.
// 매출 직접등록분 + 계약관리 보증금 결재(점주보증금) 를 하나의 테이블로 통합 조회한다.
import { MOCK_SALES } from '../../data/mockSales'
import type { Sale, SalesFilter } from '../../types/sales'
import { parseDate } from '../../lib/format'
import { listContracts } from '../contract/contractStore'
import { EMPTY_FILTER, type Contract } from '../../types/contract'

let store: Sale[] = [...MOCK_SALES]
let seq = store.length

/** 계약(보증금 결재) → 매출(점주보증금) 변환 */
function contractToSale(c: Contract): Sale {
  const cur = c.current
  return {
    id: `CS-${c.id}`,
    date: cur.contractDate,
    category: '점주보증금',
    businessUnit: cur.org,
    buyer: cur.contractorName,
    manager: cur.manager,
    inputterOrg: cur.org,
    inputterName: cur.manager,
    payment: cur.payment,
    documents: cur.documents,
    verified: true,
    memo: `계약 보증금 (${c.id})`,
    createdAt: cur.contractDate,
    source: 'contract',
    contractId: c.id,
  }
}

/** 계약에서 유입되는 보증금 매출 (금액>0, 폐기 제외) */
function contractSales(): Sale[] {
  return listContracts(EMPTY_FILTER)
    .filter(
      (c) => c.current.payment.totalAmount > 0 && c.current.status !== '폐기',
    )
    .map(contractToSale)
}

/** 통합 매출 원본 (직접등록 + 계약연동) */
function allSales(): Sale[] {
  return [...store, ...contractSales()]
}

export function listSales(filter: SalesFilter): Sale[] {
  const start = parseDate(filter.startDate)
  const end = parseDate(filter.endDate)
  const buyer = filter.buyer.trim()
  const bu = filter.businessUnit.trim()
  const inOrg = filter.inputterOrg.trim()
  const inName = filter.inputterName.trim()

  return allSales()
    .filter((s) => {
      if (filter.category !== '전체' && s.category !== filter.category)
        return false
      if (bu && !s.businessUnit.includes(bu)) return false
      if (buyer && !s.buyer.includes(buyer)) return false
      if (inOrg && !s.inputterOrg.includes(inOrg)) return false
      if (inName && !s.inputterName.includes(inName)) return false
      const d = parseDate(s.date)
      if (start && d && d < start) return false
      if (end && d && d > end) return false
      return true
    })
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}

export function getSale(id: string): Sale | undefined {
  return allSales().find((s) => s.id === id)
}

export function createSale(sale: Omit<Sale, 'id' | 'source'>): Sale {
  seq += 1
  const created: Sale = {
    ...sale,
    id: `S${String(seq).padStart(3, '0')}`,
    source: 'sale',
  }
  store = [created, ...store]
  return created
}

/** 직접등록 매출만 삭제 가능. 계약연동분은 계약관리에서 관리. */
export function deleteSale(id: string): boolean {
  const target = store.find((s) => s.id === id)
  if (!target) return false // 계약연동분 등 삭제 불가
  store = store.filter((s) => s.id !== id)
  return true
}

/** 요약 집계 */
export function summarizeSales(list: Sale[]) {
  const cardTotal = list
    .filter((s) => s.payment.method === '카드' || s.payment.method === '혼합')
    .reduce(
      (a, s) => a + s.payment.cardInstallments.reduce((x, c) => x + c.amount, 0),
      0,
    )
  const cashTotal = list
    .filter((s) => s.payment.method === '현금' || s.payment.method === '혼합')
    .reduce(
      (a, s) => a + s.payment.cashInstallments.reduce((x, c) => x + c.amount, 0),
      0,
    )
  const splitCount = list.filter(
    (s) =>
      s.payment.cardInstallments.length > 1 ||
      s.payment.cashInstallments.length > 1,
  ).length
  const unverified = list.filter((s) => !s.verified).length
  return { total: list.length, cardTotal, cashTotal, splitCount, unverified }
}
