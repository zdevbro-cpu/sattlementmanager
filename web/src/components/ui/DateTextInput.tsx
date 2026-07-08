import { forwardRef, useEffect, useRef, useState } from 'react'
import { Calendar } from 'lucide-react'
import { formatYyMmDd, previewYyMmDd } from '../../lib/format'

/**
 * 날짜 수동입력 인풋 — 포커스 시 전체선택, yymmdd 6자리 입력 완료 시 "20"을
 * 자동으로 붙여 YYYY-MM-DD로 포맷한다 (예: 260705 → 2026-07-05).
 * 우측 달력 아이콘으로 네이티브 date picker도 동시에 사용할 수 있다.
 * onTabNext가 있으면 Tab 키 입력 시 다음 필드로 직접 포커스를 넘긴다.
 */
interface DateTextInputProps {
  value: string // ISO YYYY-MM-DD
  onChange: (iso: string) => void
  className?: string
  placeholder?: string
  onTabNext?: () => void
  disabled?: boolean
}

const DateTextInput = forwardRef<HTMLInputElement, DateTextInputProps>(
  function DateTextInput(
    { value, onChange, className, placeholder = 'yymmdd', onTabNext, disabled },
    ref,
  ) {
    const [text, setText] = useState(value)
    const [editing, setEditing] = useState(false)
    const nativeRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
      if (!editing) setText(value)
    }, [value, editing])

    const handleChange = (raw: string) => {
      const digits = raw.replace(/\D/g, '').slice(0, 6)
      const iso = formatYyMmDd(digits)
      if (iso) {
        setText(iso)
        setEditing(false)
        onChange(iso)
        return
      }
      setText(previewYyMmDd(digits))
      setEditing(true)
      if (digits.length === 0) onChange('')
    }

    const openPicker = () => {
      const el = nativeRef.current as (HTMLInputElement & { showPicker?: () => void }) | null
      if (!el) return
      if (typeof el.showPicker === 'function') el.showPicker()
      else el.focus()
    }

    return (
      <div className="relative">
        <input
          ref={ref}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && !e.shiftKey && onTabNext) {
              e.preventDefault()
              onTabNext()
            }
          }}
          placeholder={placeholder}
          inputMode="numeric"
          disabled={disabled}
          style={{ paddingRight: 28 }}
          className={className}
        />
        <input
          type="date"
          ref={nativeRef}
          value={value || ''}
          onChange={(e) => {
            setText(e.target.value)
            setEditing(false)
            onChange(e.target.value)
          }}
          tabIndex={-1}
          aria-hidden
          className="absolute inset-0 h-full w-full opacity-0 pointer-events-none"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={openPicker}
          disabled={disabled}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Calendar size={14} />
        </button>
      </div>
    )
  },
)

export default DateTextInput
