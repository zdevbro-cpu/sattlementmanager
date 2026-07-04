import { useState } from 'react'
import type {
  CardInstallment,
  CashInstallment,
  PaymentInfo,
  PaymentMethod,
} from '../../types/contract'
import { comma } from '../../lib/format'
import { ocrImage, type CardOcrResult, type CashOcrResult } from '../../lib/api'
import DropZone from '../../components/ui/DropZone'

const SPLIT_OPTS = [2, 3, 4, 5, 6] // 분할은 2회부터

/** 결재구분 모드 */
export type PayMode =
  | '카드'
  | '현금'
  | '카드+현금'
  | '카드분할'
  | '현금분할'
  | '카드+현금분할'

const PAY_MODES: PayMode[] = [
  '카드',
  '현금',
  '카드+현금',
  '카드분할',
  '현금분할',
  '카드+현금분할',
]

/** 현재 결재정보 → 모드 추론 (계약상세 재현용) */
function deriveMode(v: PaymentInfo): PayMode {
  const card = v.cardInstallments.length
  const cash = v.cashInstallments.length
  if (card > 0 && cash > 0) return card > 1 || cash > 1 ? '카드+현금분할' : '카드+현금'
  if (card > 0) return card > 1 ? '카드분할' : '카드'
  if (cash > 0) return cash > 1 ? '현금분할' : '현금'
  return '카드'
}

function emptyCard(seq: number): CardInstallment {
  return {
    seq,
    amount: 0,
    issuer: '',
    cardNumber: '',
    approvalNo: '',
    terminalNo: '',
    serialNo: '',
    transactionDate: '',
  }
}

function emptyCash(seq: number): CashInstallment {
  return {
    seq,
    amount: 0,
    approvalNo: '',
    transactionDate: '',
    identifierType: '',
    identifierNo: '',
    merchantName: '',
    merchantBizNo: '',
    bank: '',
    depositor: '',
  }
}

/** 금액이 입력된 결재수단으로 결재구분 라벨 산출 (0원 회차는 미사용으로 간주) */
export function deriveMethod(p: PaymentInfo): PaymentMethod {
  const card = p.cardInstallments.some((i) => (i.amount || 0) > 0)
  const cash = p.cashInstallments.some((i) => (i.amount || 0) > 0)
  if (card && cash) return '혼합'
  if (card) return '카드'
  if (cash) return '현금'
  return '없음'
}

const inputCls =
  'h-8 w-full rounded-[6px] bg-input border border-border px-2 text-[12.5px] text-input-text outline-none focus:border-primary'
const selCls =
  'h-9 rounded-[8px] bg-input border border-border px-2 text-[13px] text-input-text outline-none focus:border-primary'

/**
 * 결재정보 편집기 (스펙 개정판).
 * - 결재구분 6모드: 카드 / 현금 / 카드+현금 / 카드분할 / 현금분할 / (카드+현금)분할
 * - 분할 모드는 횟수(2~6) 선택 → 횟수만큼 입력창 생성
 * - 회차별 이미지 등록(드래그드롭/탐색기) → OCR 정보추출 → 폼 자동채움·수정
 */
export default function PaymentEditor({
  value,
  onChange,
}: {
  value: PaymentInfo
  onChange: (v: PaymentInfo) => void
}) {
  const [mode, setMode] = useState<PayMode>(() => deriveMode(value))

  const commit = (v: PaymentInfo) => {
    const total =
      v.cardInstallments.reduce((a, b) => a + (b.amount || 0), 0) +
      v.cashInstallments.reduce((a, b) => a + (b.amount || 0), 0)
    onChange({ ...v, totalAmount: total, method: deriveMethod(v) })
  }

  const buildCounts = (nCard: number, nCash: number) => {
    const card: CardInstallment[] = []
    for (let i = 0; i < nCard; i++)
      card.push(value.cardInstallments[i] ?? emptyCard(i + 1))
    const cash: CashInstallment[] = []
    for (let i = 0; i < nCash; i++)
      cash.push(value.cashInstallments[i] ?? emptyCash(i + 1))
    commit({ ...value, cardInstallments: card, cashInstallments: cash })
  }

  const changeMode = (m: PayMode) => {
    setMode(m)
    const curCard = value.cardInstallments.length
    const curCash = value.cashInstallments.length
    switch (m) {
      case '카드':
        return buildCounts(1, 0)
      case '현금':
        return buildCounts(0, 1)
      case '카드+현금':
        return buildCounts(1, 1)
      case '카드분할':
        return buildCounts(Math.max(2, curCard), 0)
      case '현금분할':
        return buildCounts(0, Math.max(2, curCash))
      case '카드+현금분할':
        return buildCounts(Math.max(2, curCard), Math.max(2, curCash))
    }
  }

  const setCardCount = (n: number) => buildCounts(n, value.cashInstallments.length)
  const setCashCount = (n: number) => buildCounts(value.cardInstallments.length, n)

  const showCard = mode !== '현금' && mode !== '현금분할'
  const showCash = mode !== '카드' && mode !== '카드분할'
  const cardSplit = mode === '카드분할' || mode === '카드+현금분할'
  const cashSplit = mode === '현금분할' || mode === '카드+현금분할'

  const total =
    value.cardInstallments.reduce((a, b) => a + (b.amount || 0), 0) +
    value.cashInstallments.reduce((a, b) => a + (b.amount || 0), 0)

  return (
    <div className="space-y-4">
      {/* 결재구분 모드 선택 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-text-strong">결재구분</span>
          <select
            value={mode}
            onChange={(e) => changeMode(e.target.value as PayMode)}
            className={selCls}
          >
            {PAY_MODES.map((m) => (
              <option key={m} value={m}>
                {m === '카드+현금분할' ? '(카드+현금)분할' : m}
              </option>
            ))}
          </select>
          {cardSplit && (
            <label className="flex items-center gap-1 text-[12px] text-warning">
              카드
              <select
                value={value.cardInstallments.length}
                onChange={(e) => setCardCount(Number(e.target.value))}
                className={selCls}
              >
                {SPLIT_OPTS.map((n) => (
                  <option key={n} value={n}>
                    {n}회
                  </option>
                ))}
              </select>
            </label>
          )}
          {cashSplit && (
            <label className="flex items-center gap-1 text-[12px] text-success">
              현금
              <select
                value={value.cashInstallments.length}
                onChange={(e) => setCashCount(Number(e.target.value))}
                className={selCls}
              >
                {SPLIT_OPTS.map((n) => (
                  <option key={n} value={n}>
                    {n}회
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <span className="text-[13px] text-[#94a3b8]">
          합계 <b className="text-text-strong tabular">{comma(total)}</b>원
        </span>
      </div>

      {/* 카드 */}
      {showCard && (
        <section className="rounded-[10px] border border-border p-3">
          <div className="mb-2.5 text-[13px] font-bold text-warning">
            카드 {cardSplit ? `분할결재 (${value.cardInstallments.length}회)` : '결재'}
          </div>
          <div className="space-y-2">
            {value.cardInstallments.map((it, i) => (
              <CardRow
                key={i}
                item={it}
                onChange={(patch) =>
                  commit({
                    ...value,
                    cardInstallments: value.cardInstallments.map((x, idx) =>
                      idx === i ? { ...x, ...patch } : x,
                    ),
                  })
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* 현금 */}
      {showCash && (
        <section className="rounded-[10px] border border-border p-3">
          <div className="mb-2.5 text-[13px] font-bold text-success">
            현금 {cashSplit ? `분할입금 (${value.cashInstallments.length}회)` : '입금'}
          </div>
          <div className="space-y-2">
            {value.cashInstallments.map((it, i) => (
              <CashRow
                key={i}
                item={it}
                onChange={(patch) =>
                  commit({
                    ...value,
                    cashInstallments: value.cashInstallments.map((x, idx) =>
                      idx === i ? { ...x, ...patch } : x,
                    ),
                  })
                }
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/* ── 카드 회차 ─────────────────────────── */
function CardRow({
  item,
  onChange,
}: {
  item: CardInstallment
  onChange: (p: Partial<CardInstallment>) => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const onFile = async (file: File) => {
    onChange({ imageName: file.name })
    setBusy(true)
    setErr('')
    try {
      const r = (await ocrImage(file, 'sales')) as CardOcrResult
      onChange({
        imageName: file.name,
        amount: r.amount ? Number(r.amount.replace(/[^\d]/g, '')) : item.amount,
        issuer: r.issuer ?? item.issuer,
        cardNumber: r.cardNumber ?? item.cardNumber,
        approvalNo: r.approvalNo ?? item.approvalNo,
        terminalNo: r.terminalNo ?? item.terminalNo,
        serialNo: r.serialNo ?? item.serialNo,
        transactionDate: r.transactionDate ?? item.transactionDate,
      })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-[8px] border border-border bg-input/30 p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-bold text-warning">
          카드 {item.seq}회차
        </span>
        {item.imageName && (
          <span className="text-[11px] text-[#64748b]">📎 {item.imageName}</span>
        )}
      </div>
      <div className="grid grid-cols-[1fr_200px] gap-2.5">
        <div className="grid grid-cols-4 gap-1.5">
          <NumCell label="금액" value={item.amount} onChange={(amount) => onChange({ amount })} />
          <TextCell label="카드사" value={item.issuer} onChange={(issuer) => onChange({ issuer })} />
          <TextCell label="카드번호" value={item.cardNumber} onChange={(cardNumber) => onChange({ cardNumber })} />
          <TextCell label="승인번호" value={item.approvalNo} onChange={(approvalNo) => onChange({ approvalNo })} />
          <TextCell label="단말기번호" value={item.terminalNo} onChange={(terminalNo) => onChange({ terminalNo })} />
          <TextCell label="일련번호" value={item.serialNo} onChange={(serialNo) => onChange({ serialNo })} />
          <TextCell label="거래일" value={item.transactionDate} onChange={(transactionDate) => onChange({ transactionDate })} type="date" />
        </div>
        <div>
          <span className="mb-0.5 block text-[10.5px] text-[#64748b]">
            카드결재 이미지
          </span>
          <DropZone onFile={onFile} accept="image/*" capture="environment" compact
            hint={busy ? '인식중…' : 'OCR 자동추출'}>
            <div className="text-[11.5px] text-[#94a3b8]">
              {busy ? '인식중…' : '📷 이미지 드래그드롭 / 탐색기'}
            </div>
          </DropZone>
          {err && <div className="mt-1 text-[11px] text-danger">{err}</div>}
        </div>
      </div>
    </div>
  )
}

/* ── 현금 회차 ─────────────────────────── */
function CashRow({
  item,
  onChange,
}: {
  item: CashInstallment
  onChange: (p: Partial<CashInstallment>) => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const onFile = async (file: File) => {
    onChange({ imageName: file.name })
    setBusy(true)
    setErr('')
    try {
      const r = (await ocrImage(file, 'cash_receipt')) as CashOcrResult
      onChange({
        imageName: file.name,
        amount: r.amount ? Number(r.amount.replace(/[^\d]/g, '')) : item.amount,
        approvalNo: r.approvalNo ?? item.approvalNo,
        transactionDate: r.transactionDate ?? item.transactionDate,
        identifierType: r.identifierType ?? item.identifierType,
        identifierNo: r.identifierNo ?? item.identifierNo,
        merchantName: r.merchantName ?? item.merchantName,
        merchantBizNo: r.merchantBizNo ?? item.merchantBizNo,
      })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-[8px] border border-border bg-input/30 p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-bold text-success">
          현금 {item.seq}회차
        </span>
        {item.imageName && (
          <span className="text-[11px] text-[#64748b]">📎 {item.imageName}</span>
        )}
      </div>
      <div className="grid grid-cols-[1fr_200px] gap-2.5">
        <div className="grid grid-cols-4 gap-1.5">
          <NumCell label="금액" value={item.amount} onChange={(amount) => onChange({ amount })} />
          <TextCell label="은행" value={item.bank ?? ''} onChange={(bank) => onChange({ bank })} />
          <TextCell label="입금자" value={item.depositor ?? ''} onChange={(depositor) => onChange({ depositor })} />
          <TextCell label="승인번호" value={item.approvalNo} onChange={(approvalNo) => onChange({ approvalNo })} />
          <TextCell label="거래일" value={item.transactionDate} onChange={(transactionDate) => onChange({ transactionDate })} type="date" />
          <TextCell label="식별수단" value={item.identifierType} onChange={(identifierType) => onChange({ identifierType })} />
          <TextCell label="식별번호" value={item.identifierNo} onChange={(identifierNo) => onChange({ identifierNo })} />
          <TextCell label="가맹점" value={item.merchantName} onChange={(merchantName) => onChange({ merchantName })} />
        </div>
        <div>
          <span className="mb-0.5 block text-[10.5px] text-[#64748b]">
            현금입금 이미지
          </span>
          <DropZone onFile={onFile} accept="image/*" capture="environment" compact
            hint={busy ? '인식중…' : 'OCR 자동추출'}>
            <div className="text-[11.5px] text-[#94a3b8]">
              {busy ? '인식중…' : '📷 이미지 드래그드롭 / 탐색기'}
            </div>
          </DropZone>
          {err && <div className="mt-1 text-[11px] text-danger">{err}</div>}
        </div>
      </div>
    </div>
  )
}

/* ── 셀 ─────────────────────────── */
function TextCell({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10.5px] text-[#64748b]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </label>
  )
}

function NumCell({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10.5px] text-[#64748b]">{label}</span>
      <input
        inputMode="numeric"
        value={value ? String(value) : ''}
        onChange={(e) => onChange(Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
        className={`${inputCls} text-right tabular`}
      />
    </label>
  )
}

/** 초기 결재정보 — 기본 결재구분 '카드'(단건 1회). 결재구분 드롭다운으로 변경 */
export function emptyPayment(): PaymentInfo {
  return {
    method: '카드',
    totalAmount: 0,
    cardInstallments: [emptyCard(1)],
    cashInstallments: [],
  }
}
