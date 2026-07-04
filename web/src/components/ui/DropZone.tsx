import { useRef, useState, type ReactNode } from 'react'

/**
 * 파일 등록 영역 — 드래그드롭 + 탐색기(클릭) 둘 다 지원.
 * 이미지 촬영 등록(모바일)도 accept/capture 로 커버.
 */
export default function DropZone({
  onFile,
  accept = 'image/*',
  capture,
  hint,
  compact,
  children,
}: {
  onFile: (file: File) => void
  accept?: string
  capture?: 'environment' | 'user'
  hint?: string
  compact?: boolean
  children?: ReactNode
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const pick = (files: FileList | null) => {
    const f = files?.[0]
    if (f) onFile(f)
  }

  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        pick(e.dataTransfer.files)
      }}
      className={[
        'cursor-pointer rounded-[8px] border border-dashed text-center transition-colors',
        compact ? 'px-2 py-2' : 'px-3 py-4',
        over
          ? 'border-primary bg-primary/10'
          : 'border-border bg-input/40 hover:bg-hover',
      ].join(' ')}
    >
      <input
        ref={ref}
        type="file"
        accept={accept}
        capture={capture}
        hidden
        onChange={(e) => pick(e.target.files)}
      />
      {children ?? (
        <div className="text-[12px] text-[#94a3b8]">
          <span className="text-primary font-bold">클릭(탐색기)</span> 또는{' '}
          <span className="text-primary font-bold">드래그드롭</span>으로 등록
          {hint && <div className="text-[11px] text-[#64748b] mt-0.5">{hint}</div>}
        </div>
      )}
    </div>
  )
}
