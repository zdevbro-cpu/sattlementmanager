import { useState } from 'react'
import { ExternalLink, Paperclip, Trash2 } from 'lucide-react'
import type { Contract, DepositAccount, PayoutCurrency } from '../../types/contract'
import { DEPOSIT_ACCOUNTS } from '../../types/contract'
import {
  addPayoutCurrencyApi,
  addReceiptApi,
  deletePayoutCurrencyApi,
  deleteReceiptApi,
  uploadToDrive,
} from '../../lib/api'
import { comma, dateText, todayIso, usd, won } from '../../lib/format'
import DateTextInput from '../../components/ui/DateTextInput'
import { correctHistory } from './contractStore'
import { addOneMonth, receiptTotals } from './usLasOn'
import RateInput, { type RateValue } from './RateInput'

const inputCls =
  'h-9 w-full rounded-[8px] bg-input border border-border px-2.5 text-[13px] text-input-text outline-none focus:border-primary'

/**
 * 계약상세 — 미국라스온 입금장부 · 완납 처리 · 수령통화 이력.
 * 입금은 날짜 간격을 두고 1건씩 기록하고(입금일 환율 적용), 완납 여부는 사업부 담당자가 판정해 완납일을 넣는다.
 * 완납 처리 시 수당지급기준일 = 완납일 + 1개월, 매월 지급일 = 그 날짜로 맞춘다.
 */
export default function UsLedgerPanel({
  contract,
  onChanged,
}: {
  contract: Contract
  onChanged: () => void
}) {
  const cur = contract.current
  const receipts = contract.receipts || []
  const totals = receiptTotals(receipts)
  const balance = cur.deposit - totals.usd

  // ── 입금 추가 폼 ──
  const [date, setDate] = useState(todayIso())
  const [account, setAccount] = useState<DepositAccount>(cur.depositAccount || '한국원화')
  const [amount, setAmount] = useState(0)
  const [memo, setMemo] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  // 입금일 환율 — 입금일을 넣으면 하나은행 1회차 매매기준율로 자동 채움, 직접 수정 가능
  const [rate, setRate] = useState<RateValue>({ rate: 0, date: '', source: '' })
  // 한 계약은 한 계좌로 완납 — 계약에 입금계좌가 지정돼 있으면 그 계좌로 고정한다
  const accountLocked = !!cur.depositAccount
  const krwAmount = account === '한국원화' ? amount : rate.rate ? Math.round(amount * rate.rate) : 0
  const usdAmount = account === 'BOA달러' ? amount : rate.rate ? Math.round(amount / rate.rate) : 0

  const addReceipt = async () => {
    if (!date) return setErr('입금일을 입력하세요.')
    if (!(amount > 0)) return setErr('입금 금액을 입력하세요.')
    if (!(rate.rate > 0)) return setErr('입금일 환율을 입력하세요.')
    setSaving(true)
    setErr('')
    try {
      let link: { driveFileId?: string; driveViewUrl?: string } = {}
      if (file) {
        try {
          link = await uploadToDrive(contract.id, file, '입금증빙', cur.historyId, '현금입금증')
        } catch {
          /* 증빙 업로드 실패해도 입금 기록은 남긴다 */
        }
      }
      await addReceiptApi(contract.id, {
        receiptDate: date,
        account,
        exchangeRate: rate.rate,
        rateSource: rate.source || 'auto',
        krwAmount,
        usdAmount,
        memo,
        ...link,
      })
      setAmount(0)
      setMemo('')
      setFile(null)
      onChanged()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const removeReceipt = async (id: string) => {
    if (!confirm('이 입금 기록을 삭제할까요?')) return
    await deleteReceiptApi(contract.id, id)
    onChanged()
  }

  // ── 완납 처리 ──
  const lastReceiptDate = receipts.length ? receipts[receipts.length - 1].receiptDate : ''
  const [paidDate, setPaidDate] = useState(cur.fullyPaidDate || lastReceiptDate || todayIso())
  const markPaid = async () => {
    if (!paidDate) return setErr('완납일을 입력하세요.')
    const msg =
      balance === 0
        ? `${paidDate} 완납 처리할까요?`
        : `입금합계가 약정금액과 ${balance > 0 ? `${usd(balance)} 부족` : `${usd(-balance)} 초과`}합니다. 그래도 ${paidDate} 완납 처리할까요?`
    if (!confirm(msg)) return
    // 매월 지급일은 완납일의 '일'을 그대로 쓴다 — 1/31 완납이면 첫 지급은 2/28, 이후 3/31·4/30…(말일 보정)
    await correctHistory(contract.id, cur.historyId, {
      ...cur,
      fullyPaidDate: paidDate,
      firstAllowancePayDate: addOneMonth(paidDate),
      allowancePayDay: Number(paidDate.slice(8, 10)),
    })
    onChanged()
  }
  const cancelPaid = async () => {
    if (!confirm('완납 처리를 취소할까요? 수당지급기준일도 함께 비워집니다.')) return
    await correctHistory(contract.id, cur.historyId, { ...cur, fullyPaidDate: '', firstAllowancePayDate: '' })
    onChanged()
  }

  // ── 수령통화 ──
  const changes = contract.payoutCurrencyChanges || []
  const [ccDate, setCcDate] = useState(todayIso())
  const [ccCurrency, setCcCurrency] = useState<PayoutCurrency>('USD')
  const addChange = async () => {
    if (!ccDate) return setErr('적용일을 입력하세요.')
    await addPayoutCurrencyApi(contract.id, ccDate, ccCurrency)
    onChanged()
  }
  const removeChange = async (id: string) => {
    if (!confirm('이 수령통화 이력을 삭제할까요?')) return
    await deletePayoutCurrencyApi(contract.id, id)
    onChanged()
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">
          입금장부 (미국라스온){' '}
          <span className="text-[#64748b] font-semibold">
            · 입금 {usd(totals.usd)} ({won(totals.krw)}) / 약정 {usd(cur.deposit)} ·{' '}
            {balance === 0 ? '잔액 없음' : balance > 0 ? `잔액 ${usd(balance)}` : `초과 ${usd(-balance)}`}
          </span>
        </h3>

        {receipts.length === 0 ? (
          <div className="rounded-[8px] border border-dashed border-border px-3 py-4 text-center text-[12px] text-[#64748b]">
            등록된 입금이 없습니다.
          </div>
        ) : (
          <div className="rounded-[10px] border border-border overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[#94a3b8] border-b border-border">
                  {['입금일', '계좌', '원화', '환율', '달러', '메모', '증빙', ''].map((h, i) => (
                    <th key={i} className={`px-2.5 py-1.5 font-semibold whitespace-nowrap ${i >= 2 && i <= 4 ? 'text-right' : 'text-left'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {receipts.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-2.5 py-1.5 tabular whitespace-nowrap">{dateText(r.receiptDate)}</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap">{r.account}</td>
                    <td className="px-2.5 py-1.5 tabular text-right whitespace-nowrap">{comma(r.krwAmount)}</td>
                    <td className="px-2.5 py-1.5 tabular text-right whitespace-nowrap">
                      {r.exchangeRate.toFixed(2)}
                      {r.rateSource === 'manual' && <span className="ml-1 text-warning">(수정)</span>}
                    </td>
                    <td className="px-2.5 py-1.5 tabular text-right whitespace-nowrap font-bold text-text-strong">{usd(r.usdAmount)}</td>
                    <td className="px-2.5 py-1.5 text-[#94a3b8]">{r.memo || '-'}</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap">
                      {r.driveViewUrl ? (
                        <a href={r.driveViewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-primary">
                          보기 <ExternalLink size={11} />
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-2.5 py-1.5 text-right">
                      <button onClick={() => removeReceipt(r.id)} title="삭제" className="text-danger hover:brightness-125">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 입금 추가 */}
        <div className="mt-2.5 rounded-[10px] border border-primary/40 bg-input/30 p-3 space-y-2.5">
          <div className="grid grid-cols-5 gap-2.5">
            <Field label="입금일">
              <DateTextInput value={date} onChange={setDate} className={inputCls} />
            </Field>
            <Field label="입금일 환율 (원/달러)">
              <RateInput baseDate={date} value={rate} onChange={setRate} inputCls={inputCls} />
            </Field>
            <Field label="입금계좌">
              <select
                value={account}
                onChange={(e) => setAccount(e.target.value as DepositAccount)}
                className={inputCls}
                disabled={accountLocked}
              >
                {DEPOSIT_ACCOUNTS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </Field>
            <Field label={account === '한국원화' ? '입금액(원)' : '입금액($)'}>
              <input
                inputMode="numeric"
                value={amount ? amount.toLocaleString('ko-KR') : ''}
                onChange={(e) => setAmount(Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
                className={`${inputCls} text-right tabular`}
                placeholder="0"
              />
            </Field>
            <Field label="메모">
              <input value={memo} onChange={(e) => setMemo(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <div className="flex items-center justify-between gap-3 text-[12px]">
            <span className="text-[#94a3b8]">
              {rate.rate > 0
                ? `적용환율 ${rate.rate.toFixed(2)}원${rate.source === 'auto' && rate.date !== date ? ' (직전 영업일 고시)' : ''} → ${
                    account === '한국원화' ? `${usd(usdAmount)} 환산` : `${won(krwAmount)} 환산`
                  }`
                : '입금일을 입력하면 환율이 자동으로 채워집니다.'}
            </span>
            <div className="flex items-center gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-[8px] border border-border px-3 font-semibold text-[#c2cde0] hover:bg-hover">
                <Paperclip size={13} /> {file ? file.name : '증빙 첨부'}
                <input
                  type="file"
                  accept=".pdf,image/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <button
                onClick={addReceipt}
                disabled={saving}
                className="h-9 rounded-[8px] bg-primary px-4 text-[13px] font-bold text-white hover:brightness-110 disabled:opacity-60"
              >
                {saving ? '저장 중…' : '입금 추가'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 완납 처리 */}
      <section>
        <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">완납 처리</h3>
        <div className="rounded-[10px] border border-border p-3 flex items-end justify-between gap-3">
          {cur.fullyPaidDate ? (
            <div className="text-[12.5px] space-y-0.5">
              <div>
                <span className="text-[#64748b]">완납일 </span>
                <b className="text-text-strong tabular">{cur.fullyPaidDate}</b>
              </div>
              <div>
                <span className="text-[#64748b]">첫 지급일(완납 + 1개월) </span>
                <b className="text-text-strong tabular">{dateText(cur.firstAllowancePayDate)}</b>
                <span className="text-[#64748b]"> · 매월 {cur.allowancePayDay}일</span>
              </div>
            </div>
          ) : (
            <div className="w-[180px]">
              <Field label="완납일 (담당자 판정)">
                <DateTextInput value={paidDate} onChange={setPaidDate} className={inputCls} />
              </Field>
            </div>
          )}
          {cur.fullyPaidDate ? (
            <button onClick={cancelPaid} className="h-9 rounded-[8px] border border-border px-3 text-[13px] font-semibold text-[#c2cde0] hover:bg-hover">
              완납 취소
            </button>
          ) : (
            <button onClick={markPaid} className="h-9 rounded-[8px] bg-success px-4 text-[13px] font-bold text-white hover:brightness-110">
              완납 처리
            </button>
          )}
        </div>
      </section>

      {/* 수령통화 이력 */}
      <section>
        <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">
          수령통화 이력 <span className="text-[#64748b] font-semibold">(적용일 이후 지급분부터 반영)</span>
        </h3>
        <div className="rounded-[10px] border border-border p-3 space-y-2">
          {changes.length === 0 ? (
            <div className="text-[12px] text-[#64748b]">등록된 이력이 없습니다 (기본: 달러).</div>
          ) : (
            changes.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-[12.5px]">
                <span>
                  <span className="tabular text-[#c2cde0]">{c.effectiveDate}</span>부터{' '}
                  <b className="text-text-strong">{c.currency === 'USD' ? '달러 (BOA 계좌)' : '원화 (한국 계좌)'}</b>
                </span>
                <button onClick={() => removeChange(c.id)} title="삭제" className="text-danger hover:brightness-125">
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
          <div className="flex items-end gap-2 pt-1">
            <div className="w-[160px]">
              <Field label="적용일">
                <DateTextInput value={ccDate} onChange={setCcDate} className={inputCls} />
              </Field>
            </div>
            <div className="w-[160px]">
              <Field label="수령통화">
                <select value={ccCurrency} onChange={(e) => setCcCurrency(e.target.value as PayoutCurrency)} className={inputCls}>
                  <option value="USD">달러 (BOA 계좌)</option>
                  <option value="KRW">원화 (한국 계좌)</option>
                </select>
              </Field>
            </div>
            <button onClick={addChange} className="h-9 rounded-[8px] bg-primary px-4 text-[13px] font-bold text-white hover:brightness-110">
              변경 추가
            </button>
          </div>
        </div>
        {err && <div className="mt-2 text-[12px] text-danger">{err}</div>}
      </section>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-semibold text-[#94a3b8]">{label}</span>
      {children}
    </label>
  )
}
