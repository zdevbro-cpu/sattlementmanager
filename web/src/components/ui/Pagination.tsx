import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

export const PAGE_SIZES = [20, 50, 100]

const WINDOW = 10
const navBtnCls =
  'h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-[#94a3b8] hover:bg-hover disabled:opacity-40 disabled:pointer-events-none'

/**
 * 목록 공통 페이지네이션 — 페이지 번호가 많아져도(수십~수백 페이지) 한 화면에 맞도록
 * 현재 페이지 주변 10개만 보여주고, 맨앞/이전/다음/맨뒤 버튼으로 나머지 구간을 이동한다.
 */
export default function Pagination({
  page,
  totalPages,
  perPage,
  onPageChange,
  onPerPageChange,
  pageSizes = PAGE_SIZES,
}: {
  page: number
  totalPages: number
  perPage: number
  onPageChange: (page: number) => void
  onPerPageChange: (perPage: number) => void
  pageSizes?: number[]
}) {
  let start = Math.max(1, page - Math.floor(WINDOW / 2))
  const end = Math.min(totalPages, start + WINDOW - 1)
  start = Math.max(1, end - WINDOW + 1)
  const nums = Array.from({ length: end - start + 1 }, (_, i) => start + i)

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
      <div className="flex gap-1">
        <button onClick={() => onPageChange(1)} disabled={page === 1} title="맨 앞으로" className={navBtnCls}>
          <ChevronsLeft size={16} />
        </button>
        <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1} title="이전 페이지" className={navBtnCls}>
          <ChevronLeft size={16} />
        </button>
        {nums.map((n) => (
          <button
            key={n}
            onClick={() => onPageChange(n)}
            className={`h-8 min-w-8 px-2 rounded-md border text-[13px] font-semibold ${n === page ? 'border-primary text-primary' : 'border-border text-[#94a3b8] hover:bg-hover'}`}
          >
            {n}
          </button>
        ))}
        <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page === totalPages} title="다음 페이지" className={navBtnCls}>
          <ChevronRight size={16} />
        </button>
        <button onClick={() => onPageChange(totalPages)} disabled={page === totalPages} title="맨 뒤로" className={navBtnCls}>
          <ChevronsRight size={16} />
        </button>
      </div>
      <div className="flex gap-1">
        {pageSizes.map((n) => (
          <button
            key={n}
            onClick={() => onPerPageChange(n)}
            className={`h-8 px-3 rounded-md border text-[13px] font-semibold ${n === perPage ? 'border-primary text-primary' : 'border-border text-[#94a3b8] hover:bg-hover'}`}
          >
            {n}개
          </button>
        ))}
      </div>
    </div>
  )
}
