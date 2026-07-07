// 매출 데이터 접근 계층 — Cloud SQL(PostgreSQL) 백엔드(server/salesRepo.js)를 통해 조회/저장한다.
// 매출 직접등록분(DB) + 계약관리 보증금 결재(점주보증금, 계약 데이터에서 파생) 를 하나의 목록으로 통합 조회한다.
import type { Sale, SalesFilter } from '../../types/sales'
import { listContracts } from '../contract/contractStore'
import { EMPTY_FILTER, type Contract } from '../../types/contract'
import { createSaleApi, deleteSaleApi, fetchSale, fetchSales, updateSaleApi } from '../../lib/api'
import { getContract } from '../contract/contractStore'

/** 계약(보증금 결재) → 매출(점주보증금) 변환 */
function contractToSale(c: Contract): Sale {
  const cur = c.current
  return {
    id: `CS-${c.id}`,
    date: cur.contractDate,
    category: '점주보증금',
    org: cur.org,
    businessUnit: cur.businessUnit,
    buyer: cur.contractorName,
    manager: cur.manager,
    inputterOrg: cur.org,
    inputterName: cur.manager,
    payment: cur.payment,
    documents: cur.documents,
    verified: true,
    memo: `계약 보증금 (${c.id})`,
    createdAt: cur.createdAt || cur.contractDate, // 등록일(시스템 등록시각). 없으면 계약일로 폴백
    source: 'contract',
    contractId: c.id,
  }
}

/** 계약에서 유입되는 보증금 매출 (금액>0, 폐기 제외) */
async function contractSales(): Promise<Sale[]> {
  const contracts = await listContracts(EMPTY_FILTER)
  return contracts
    .filter(
      (c) => c.current.payment.totalAmount > 0 && c.current.status !== '폐기',
    )
    .map(contractToSale)
}

/** 등록일(createdAt) 구간 필터 — 시작/종료 미입력 시 통과. createdAt 은 YYYY-MM-DD 접두 비교 */
function matchRegDate(s: Sale, filter: SalesFilter): boolean {
  const reg = (s.createdAt ?? '').slice(0, 10)
  if (filter.regStartDate && (!reg || reg < filter.regStartDate)) return false
  if (filter.regEndDate && (!reg || reg > filter.regEndDate)) return false
  return true
}

export async function listSales(filter: SalesFilter): Promise<Sale[]> {
  const [direct, fromContracts] = await Promise.all([
    fetchSales(filter),
    contractSales(),
  ])
  const buyer = filter.buyer.trim()
  const filteredContractSales = fromContracts.filter((s) => {
    if (filter.category !== '전체' && s.category !== filter.category) return false
    if (filter.businessUnit.trim() && !s.businessUnit.includes(filter.businessUnit.trim()))
      return false
    if (buyer && !s.buyer.includes(buyer)) return false
    if (filter.inputterOrg.trim() && !s.inputterOrg.includes(filter.inputterOrg.trim()))
      return false
    if (filter.inputterName.trim() && !s.inputterName.includes(filter.inputterName.trim()))
      return false
    if (filter.startDate && s.date && s.date < filter.startDate) return false
    if (filter.endDate && s.date && s.date > filter.endDate) return false
    if (!matchRegDate(s, filter)) return false
    return true
  })
  // 등록일 구간은 서버(직접등록 매출)에서 걸러지지 않으므로 클라이언트에서 함께 적용
  const filteredDirect = direct.filter((s) => matchRegDate(s, filter))
  return [...filteredDirect, ...filteredContractSales].sort((a, b) =>
    (b.date ?? '').localeCompare(a.date ?? ''),
  )
}

/** 매출 1건 조회 (계약연동분은 원본 계약에서 파생) */
export async function getSale(id: string): Promise<Sale | undefined> {
  try {
    if (id.startsWith('CS-')) {
      const contract = await getContract(id.slice(3))
      return contractToSale(contract)
    }
    return await fetchSale(id)
  } catch {
    return undefined
  }
}

export function createSale(sale: Omit<Sale, 'id' | 'source'>): Promise<Sale> {
  return createSaleApi({ ...sale, source: 'sale' })
}

/** 직접등록 매출만 수정 가능. 계약연동분은 계약관리에서 관리. */
export function updateSale(id: string, sale: Omit<Sale, 'id' | 'source'>): Promise<Sale> {
  if (id.startsWith('CS-')) return Promise.reject(new Error('계약 보증금 연동 항목입니다. 계약관리에서 관리하세요.'))
  return updateSaleApi(id, { ...sale, source: 'sale' })
}

/** 직접등록 매출만 삭제 가능. 계약연동분은 계약관리에서 관리. */
export async function deleteSale(id: string): Promise<boolean> {
  if (id.startsWith('CS-')) return false // 계약연동분 삭제 불가
  await deleteSaleApi(id)
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
