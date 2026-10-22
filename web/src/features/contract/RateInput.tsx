import { useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type { RateSource } from '../../types/contract'
import { ensureExchangeRate } from './usLasOn'

export interface RateValue {
  rate: number
  /** 적용 환율의 고시일 (휴일이면 직전 영업일) */
  date: string
  source: RateSource | ''
}

/**
 * 거래일 환율 입력 — 기준일(계약일·변경일·입금일 등)이 정해지면 하나은행 1회차 매매기준율을
 * 자동으로 채우고, 사용자가 직접 고치면 '수정됨'으로 표시한다(이후 기준일이 바뀌어도 덮어쓰지 않음).
 * 자동 조회가 실패하면 안내 문구를 띄우고 직접 입력하게 둔다.
 */
export default function RateInput({
  baseDate,
  value,
  onChange,
  inputCls,
  disabled,
}: {
  baseDate: string
  value: RateValue
  onChange: (v: RateValue) => void
  inputCls: string
  disabled?: boolean
}) {
  const [text, setText] = useState(value.rate ? String(value.rate) : '')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  // 이미 저장된 환율이 있는 상태로 열렸으면(오타수정 등) 처음 한 번은 다시 조회하지 않는다
  const initialDate = useRef(value.rate > 0 ? baseDate : '')

  useEffect(() => {
    setText(value.rate ? String(value.rate) : '')
  }, [value.rate])

  const load = (date: string) => {
    if (!date) return
    setLoading(true)
    setMsg('')
    ensureExchangeRate(date)
      // 환율표에서 자동으로 채운 값은 'auto' — 환율표 값이 시스템관리에서 수정된 값이어도 이 입력란에서는 자동 채움이다
      .then((r) => onChange({ rate: r.rate, date: r.noticeDate || r.date, source: 'auto' }))
      .catch((e) => setMsg(`자동 조회 실패 — 직접 입력하세요 (${(e as Error).message})`))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!baseDate || disabled) return
    if (baseDate === initialDate.current) return
    initialDate.current = ''
    if (value.source === 'manual') return
    load(baseDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseDate, disabled])

  return (
    <div>
      <div className="relative">
        <input
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d.]/g, '')
            setText(raw)
            onChange({ rate: Number(raw) || 0, date: baseDate, source: 'manual' })
          }}
          placeholder={loading ? '조회 중…' : baseDate ? '환율 입력' : '기준일 먼저 입력'}
          className={`${inputCls} text-right tabular pr-8`}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => load(baseDate)}
          disabled={disabled || !baseDate || loading}
          title="하나은행 1회차 매매기준율로 다시 채우기"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-white disabled:opacity-40"
        >
          <RotateCcw size={13} />
        </button>
      </div>
      <div className="mt-0.5 text-[11px] whitespace-nowrap">
        {msg ? (
          <span className="text-danger">{msg}</span>
        ) : value.rate > 0 ? (
          value.source === 'manual' ? (
            <span className="font-semibold text-warning">수정됨</span>
          ) : (
            <span className="text-[#94a3b8]">자동 · {value.date} 고시</span>
          )
        ) : null}
      </div>
    </div>
  )
}
