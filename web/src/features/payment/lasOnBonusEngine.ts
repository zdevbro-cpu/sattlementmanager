// LAS-On 수당지급(유치보너스) 계산 — 순수 계산 모듈.
// 유치자가 LAS-On파트장/파트너로 등록된 사람인 신규 계약을 찾아, 그 계약의 보증금(=수당기준금액)의
// 15%를 보너스로, 3.3% 원천징수 후 실지급액을 계산한다. 수령인은 계약자 본인이 아니라 LAS-On
// 등록 시 별도로 입력한 수당 수령인이다.
import type { Contract, ContractSnapshot } from '../../types/contract'

export const BONUS_RATE = 0.15
export const BONUS_WITHHOLDING = 0.033

export interface LasOnBonusRow {
  no: number
  depositDate: string
  /** 계약 등록일(createdAt) — 등록구간 필터용 */
  createdAt: string
  contractorName: string
  recruiter: string
  /** 유치자(수령인)의 소속 파트장 계약 id — 파트장 검색 시 산하 파트너까지 묶기 위한 키.
   *  유치자가 파트장이면 자기 계약 id, 파트너면 그 파트너의 소속 파트장 id. */
  leaderId: string
  /** 소속 파트장 계약자명 — 파트장 검색 표시·매칭용 */
  leaderName: string
  depositTotal: number
  cashAmount: number
  cardAmount: number
  cardIssuer: string
  approvalNo: string
  baseAmount: number
  recipientName: string
  bonusRate: number
  bonusAmount: number
  tax: number
  netAmount: number
  bankName: string
  accountNo: string
  accountOwner: string
  residentNo: string
  memo: string
  bold?: boolean
}

interface Leg {
  method: '카드' | '현금'
  amount: number
  issuer: string
  approvalNo: string
}

/** 계약 1건의 결재정보를 회차(카드/현금) 단위로 펼침. 분할결제 시 회차마다 1건씩 반환 */
function toLegs(s: ContractSnapshot): Leg[] {
  const legs: Leg[] = [
    ...(s.payment.cardInstallments || []).map((c) => ({
      method: '카드' as const,
      amount: c.amount,
      issuer: c.issuer || '',
      approvalNo: c.approvalNo || '',
    })),
    ...(s.payment.cashInstallments || []).map((c) => ({
      method: '현금' as const,
      amount: c.amount,
      issuer: c.bank || '',
      approvalNo: c.depositor || '',
    })),
  ]
  if (legs.length > 0) return legs
  return [
    {
      method: s.payment.method === '현금' ? '현금' : '카드',
      amount: s.payment.totalAmount,
      issuer: '',
      approvalNo: '',
    },
  ]
}

interface Recipient {
  snapshot: ContractSnapshot
  contractId: string
  /** 소속 파트장 계약 id (파트장 본인이면 자기 id) */
  leaderId: string
  /** 소속 파트장 계약자명 (파트장 본인이면 자기 이름) */
  leaderName: string
}

/** 계약자명 → LAS-On 수당 수령인 정보 맵 (LAS-On파트장/파트너 계약의 현재 스냅샷 기준) */
function buildRecipientMap(contracts: Contract[]): Map<string, Recipient> {
  // id → 계약 (파트장 체인 추적용)
  const byId = new Map<string, Contract>()
  contracts.forEach((c) => byId.set(c.id, c))

  // 파트너 → 소속 파트장을 parentContractId 로 거슬러 올라가 최상위 파트장을 찾는다.
  const leaderOf = (c: Contract): { id: string; name: string } => {
    let node = c
    const seen = new Set<string>()
    while (
      node.current.contractType === 'LAS-On파트너' &&
      node.current.parentContractId &&
      byId.has(node.current.parentContractId) &&
      !seen.has(node.id)
    ) {
      seen.add(node.id)
      node = byId.get(node.current.parentContractId)!
    }
    return { id: node.id, name: node.current.contractorName }
  }

  const map = new Map<string, Recipient>()
  for (const c of contracts) {
    const cur = c.current
    if (cur.contractType === 'LAS-On파트장' || cur.contractType === 'LAS-On파트너') {
      const leader = leaderOf(c)
      map.set(cur.contractorName, {
        snapshot: cur,
        contractId: c.id,
        leaderId: leader.id,
        leaderName: leader.name,
      })
    }
  }
  return map
}

/**
 * 유치보너스 대상 계약 → 출력행 계획.
 * 대상: status='신규', 유치자가 LAS-On파트장/파트너 계약자명과 일치, 임시저장 아님,
 *       입금일(계약일) 다음날 이후(= 오늘이 계약일보다 늦음)에만 노출.
 * 분할결제는 합계행(굵게) + 회차행으로 펼치며, 번호·입금일·신규계약자·유치자·수령인·계좌정보는
 * 회차행도 공란 없이 합계행과 동일하게 채운다. 보증금 합계·수당기준금액·보너스금액·세금·실지급액은
 * 그 행 자신의 금액 기준으로 각각 계산한다 — 합계행은 전체 보증금, 회차행은 그 회차 결제액.
 */
export function buildLasOnBonusRows(contracts: Contract[], today: string): LasOnBonusRow[] {
  const recipients = buildRecipientMap(contracts)
  const rows: LasOnBonusRow[] = []
  let no = 0

  for (const c of contracts) {
    const cur = c.current
    if (cur.status !== '신규' || cur.isDraft) continue
    if (!cur.recruiter) continue
    const recipient = recipients.get(cur.recruiter)
    if (!recipient) continue
    if (!(cur.contractDate < today)) continue // 입금일 다음날부터 노출

    const legs = toLegs(cur)
    const depositTotal = cur.deposit
    const cashTotal = legs.filter((l) => l.method === '현금').reduce((a, l) => a + l.amount, 0)
    const cardTotal = legs.filter((l) => l.method === '카드').reduce((a, l) => a + l.amount, 0)
    no++
    // 수당기준금액은 양식상 단일 컬럼(보증금과 항상 동일한 값) — 그 행의 보증금 합계를 그대로 쓴다.

    // 보너스/세금/실지급액은 그 행의 수당기준금액(=보증금)을 기준으로 계산한다.
    // 합계행은 전체 보증금 기준, 회차행은 그 회차 결제액 기준으로 각각 산정한다.
    const financeOf = (baseAmount: number) => {
      const bonusAmount = Math.round(baseAmount * BONUS_RATE)
      const tax = Math.round(bonusAmount * BONUS_WITHHOLDING)
      return { bonusAmount, tax, netAmount: bonusAmount - tax }
    }

    const rs = recipient.snapshot
    const common = {
      no,
      depositDate: cur.contractDate,
      createdAt: (cur.createdAt || '').slice(0, 10),
      contractorName: cur.contractorName,
      recruiter: cur.recruiter,
      leaderId: recipient.leaderId,
      leaderName: recipient.leaderName,
      recipientName: rs.recipientName || '',
      bonusRate: BONUS_RATE * 100,
      bankName: rs.recipientBankName || '',
      accountNo: rs.recipientAccountNo || '',
      accountOwner: rs.recipientAccountOwner || '',
      residentNo: rs.recipientResidentNo || '',
      memo: cur.memo || '',
    }

    if (legs.length <= 1) {
      const only = legs[0]
      rows.push({
        ...common,
        depositTotal,
        baseAmount: depositTotal,
        cashAmount: only?.method === '현금' ? only.amount : 0,
        cardAmount: only?.method === '카드' ? only.amount : 0,
        cardIssuer: only?.method === '카드' ? only.issuer : '',
        approvalNo: only?.approvalNo || '',
        ...financeOf(depositTotal),
      })
      continue
    }

    rows.push({
      ...common,
      depositTotal,
      baseAmount: depositTotal,
      cashAmount: cashTotal,
      cardAmount: cardTotal,
      cardIssuer: '',
      approvalNo: '',
      bold: true,
      ...financeOf(depositTotal),
    })
    legs.forEach((leg) => {
      rows.push({
        ...common,
        depositTotal: leg.amount, // 회차행은 보증금 합계도 그 회차의 결제액만 표시
        baseAmount: leg.amount,
        cashAmount: leg.method === '현금' ? leg.amount : 0,
        cardAmount: leg.method === '카드' ? leg.amount : 0,
        cardIssuer: leg.method === '카드' ? leg.issuer : '',
        approvalNo: leg.approvalNo,
        ...financeOf(leg.amount),
      })
    })
  }
  return rows
}
