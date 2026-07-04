import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { useBanks } from './bankStore'

const CHOSUNG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
]

/** 문자열의 한글 초성 추출 (한글 외 문자는 그대로) */
function toChosung(str: string): string {
  let out = ''
  for (const ch of str) {
    const code = ch.charCodeAt(0) - 0xac00
    if (code >= 0 && code <= 11171) out += CHOSUNG[Math.floor(code / 588)]
    else out += ch
  }
  return out
}

/**
 * 은행/기관 선택 — 필드에 직접 입력해 검색하고(초성·이름) 목록에서 선택한다.
 * 예) "ㄱㅁ" → 국민은행, "국민" → 국민은행.
 * 목록은 포털(fixed)로 띄워 모달 스크롤 영역에 잘리지 않으며, 아래 공간이 부족하면 위로 펼친다.
 * 신규 기관 추가는 시스템관리 메뉴에서 한다.
 */
export default function InstitutionSelect({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  const banks = useBanks()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return banks
    return banks.filter(
      (b) =>
        b.toLowerCase().includes(q) || toChosung(b).toLowerCase().includes(q),
    )
  }, [query, banks])

  const updatePos = () => {
    const el = inputRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const gap = 4
    const spaceBelow = window.innerHeight - r.bottom - gap
    const spaceAbove = r.top - gap
    const desired = 240
    const up = spaceBelow < Math.min(desired, 160) && spaceAbove > spaceBelow
    const maxHeight = Math.max(120, Math.min(desired, up ? spaceAbove : spaceBelow))
    const style: CSSProperties = {
      position: 'fixed',
      left: r.left,
      width: r.width,
      maxHeight,
      overflowY: 'auto',
      zIndex: 60,
    }
    if (up) style.bottom = window.innerHeight - r.top + gap
    else style.top = r.bottom + gap
    setMenuStyle(style)
  }

  useLayoutEffect(() => {
    if (!open) return
    updatePos()
    const onMove = () => updatePos()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const select = (v: string) => {
    onChange(v)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={open ? query : value}
        placeholder="초성·이름 검색 (예: ㄱㅁ, 국민)"
        onFocus={() => {
          setQuery('')
          setOpen(true)
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onBlur={() => setOpen(false)}
        className={className}
      />
      {open &&
        menuStyle &&
        createPortal(
          <div
            style={menuStyle}
            className="rounded-[8px] border border-border bg-card shadow-xl py-1"
            onMouseDown={(e) => e.preventDefault()}
          >
            {filtered.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => select(b)}
                className={[
                  'w-full text-left px-3 py-1.5 text-[13px] hover:bg-hover',
                  b === value ? 'text-primary font-bold' : 'text-[#c2cde0]',
                ].join(' ')}
              >
                {b}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-2.5 text-[12px] text-[#64748b]">
                검색 결과가 없습니다. 기관추가는 시스템관리 메뉴에서 하세요.
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
