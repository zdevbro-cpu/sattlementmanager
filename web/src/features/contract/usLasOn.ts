// 미국라스온 공통 규칙 — 환율 조회, 입금장부 합계, 수령통화, 지급 계산.
// 계약관리(입금장부)와 지급관리(미국라스온 탭)가 같은 계산을 쓰도록 이 파일 한 곳에 둔다.
import { useSyncExternalStore } from 'react'
import type {
  Contract,
  ContractReceipt,
  ContractSnapshot,
  ExchangeRate,
  PayoutCurrency,
  PayoutCurrencyChange,
} from '../../types/contract'
import { US_REGION } from '../../types/contract'
import {
  deleteExchangeRateApi,
  ensureExchangeRateApi,
  fetchExchangeRates,
  onSignedIn,
  upsertExchangeRateApi,
} from '../../lib/api'

export function isUsContract(s: Pick<ContractSnapshot, 'region'> | undefined | null): boolean {
  return s?.region === US_REGION
}

/** 미국라스온 전용 입력값 — 등록/오타수정 폼이 공유한다 */
export type UsFields = Required<
  Pick<
    ContractSnapshot,
    | 'region'
    | 'depositAccount'
    | 'residency'
    | 'withholdingRate'
    | 'boaBankName'
    | 'boaAccountNo'
    | 'boaRoutingNo'
    | 'boaSwiftCode'
    | 'boaAccountOwner'
    | 'boaAddress'
    | 'taxIdType'
    | 'taxIdNo'
    | 'taxNameEn'
    | 'taxNationality'
    | 'taxAddress'
    | 'exchangeRate'
    | 'exchangeRateDate'
    | 'exchangeRateSource'
  >
>

export const DEFAULT_WITHHOLDING_RATE = 3.3

export function usFieldsOf(s?: Partial<ContractSnapshot>): UsFields {
  return {
    region: s?.region === US_REGION ? US_REGION : '국내',
    depositAccount: s?.depositAccount ?? '',
    residency: s?.residency ?? '',
    withholdingRate: s?.withholdingRate ?? DEFAULT_WITHHOLDING_RATE,
    boaBankName: s?.boaBankName ?? '',
    boaAccountNo: s?.boaAccountNo ?? '',
    boaRoutingNo: s?.boaRoutingNo ?? '',
    boaSwiftCode: s?.boaSwiftCode ?? '',
    boaAccountOwner: s?.boaAccountOwner ?? '',
    boaAddress: s?.boaAddress ?? '',
    taxIdType: s?.taxIdType ?? '',
    taxIdNo: s?.taxIdNo ?? '',
    taxNameEn: s?.taxNameEn ?? '',
    taxNationality: s?.taxNationality ?? '',
    taxAddress: s?.taxAddress ?? '',
    exchangeRate: s?.exchangeRate ?? 0,
    exchangeRateDate: s?.exchangeRateDate ?? '',
    exchangeRateSource: s?.exchangeRateSource ?? '',
  }
}

/**
 * 거래일 환율 — 그날의 하나은행 최초 매매기준율. 휴일 등으로 그날 값이 없으면
 * 직전 영업일(그 이전 가장 최근 날짜) 값을 쓴다. 이전 값도 없으면 null.
 */
export function rateOn(rates: ExchangeRate[], date: string): ExchangeRate | null {
  if (!date) return null
  let best: ExchangeRate | null = null
  for (const r of rates) {
    if (r.date <= date && (!best || r.date > best.date)) best = r
  }
  return best
}

/** 완납일 + 1개월 (같은 날짜, 그 달에 없는 날이면 말일) */
export function addOneMonth(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return ''
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  const last = new Date(ny, nm, 0).getDate()
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

/** 입금장부 합계 — 달러 합계(완납 판단 참고), 원화 합계(입금일 환율 환산) */
export function receiptTotals(receipts: ContractReceipt[] | undefined): { usd: number; krw: number } {
  return (receipts || []).reduce(
    (a, r) => ({ usd: a.usd + r.usdAmount, krw: a.krw + r.krwAmount }),
    { usd: 0, krw: 0 },
  )
}

/** 지급일 시점의 수령통화 — 그 날짜 이전(포함) 마지막 변경 이력 기준. 이력이 없으면 달러 */
export function currencyOn(changes: PayoutCurrencyChange[] | undefined, date: string): PayoutCurrency {
  let best: PayoutCurrencyChange | null = null
  for (const c of changes || []) {
    if (c.effectiveDate <= date && (!best || c.effectiveDate >= best.effectiveDate)) best = c
  }
  return best?.currency ?? 'USD'
}

export interface UsPayoutCalc {
  currency: PayoutCurrency
  rate: number // 지급일 환율 (0이면 미등록)
  rateDate: string // 실제 적용한 환율 날짜 (휴일이면 직전 영업일)
  krwGross: number // 원화 환산 수당
  tax: number // 원천세 (원화, 10원 미만 절사)
  krwNet: number // 원화 실지급액
  usdNet: number // 달러 실지급액 (달러 수령 시, 반올림) — 원화 수령이면 0
}

/**
 * 미국라스온 수익금 1건 계산 — 순서: 달러 수당 → 지급일 환율로 원화 환산 → 원천세(원화, 10원 미만 절사)
 * → 원화 실지급액. 달러로 받으면 원화 실지급액을 다시 지급일 환율로 나눠 반올림한다.
 * 해외송금 수수료는 공제하지 않는다(수수료 공제 전 금액).
 */
export function calcUsPayout(
  allowanceUsd: number,
  rate: ExchangeRate | null,
  withholdingRate: number,
  currency: PayoutCurrency,
): UsPayoutCalc {
  const r = rate?.rate || 0
  if (!r) {
    return { currency, rate: 0, rateDate: '', krwGross: 0, tax: 0, krwNet: 0, usdNet: 0 }
  }
  const krwGross = Math.round(allowanceUsd * r)
  const tax = Math.floor((krwGross * (withholdingRate || 0)) / 100 / 10) * 10
  const krwNet = krwGross - tax
  const usdNet = currency === 'USD' ? Math.round(krwNet / r) : 0
  return { currency, rate: r, rateDate: rate!.date, krwGross, tax, krwNet, usdNet }
}

/** 미국라스온 계약의 원화 환산 계약금액 — 입금장부(입금일 환율) 원화 합계 */
export function usContractKrw(c: Contract): number {
  return receiptTotals(c.receipts).krw
}

// ── 환율표 스토어 (시스템관리 등록 → 계약·지급 화면 공용) ──────────────

let rates: ExchangeRate[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function reloadExchangeRates(): Promise<void> {
  return fetchExchangeRates()
    .then((list) => {
      rates = list
      emit()
    })
    .catch(() => {
      /* 서버 미응답 시 기존 값 유지 */
    })
}

onSignedIn(() => {
  reloadExchangeRates()
})

// 같은 날짜를 여러 화면이 동시에 요청해도 하나은행 조회는 1번만 나가게 한다
const inflight = new Map<string, Promise<ExchangeRate>>()

/**
 * 거래일 환율 확보 — 환율표에 있으면 그 값(수동 수정값 우선), 없으면 서버가 하나은행 1회차 매매기준율을
 * 조회해 저장한 값. force=true면 다시 조회한다. 조회 실패 시 예외 — 호출 쪽은 수동 입력으로 넘어간다.
 */
export function ensureExchangeRate(date: string, force = false): Promise<ExchangeRate> {
  const key = `${date}|${force}`
  const hit = inflight.get(key)
  if (hit) return hit
  const p = ensureExchangeRateApi(date, force)
    .then(async (r) => {
      await reloadExchangeRates()
      return r
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

export async function saveExchangeRate(date: string, rate: number): Promise<void> {
  await upsertExchangeRateApi(date, rate)
  await reloadExchangeRates()
}

export async function removeExchangeRate(date: string): Promise<void> {
  await deleteExchangeRateApi(date)
  await reloadExchangeRates()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
const getRates = () => rates

/** React 훅: 환율표 구독 (최신 날짜순) */
export function useExchangeRates(): ExchangeRate[] {
  return useSyncExternalStore(subscribe, getRates, getRates)
}
