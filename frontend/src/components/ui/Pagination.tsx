import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

interface PaginationProps {
  currentPage: number          // 1-indexed
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: number[]
  className?: string
}

export function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  className = '',
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const start = Math.min((currentPage - 1) * pageSize + 1, totalItems)
  const end = Math.min(currentPage * pageSize, totalItems)

  // Build visible page numbers with ellipsis
  const getPageNumbers = (): (number | 'ellipsis')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const pages: (number | 'ellipsis')[] = [1]
    if (currentPage > 3) pages.push('ellipsis')
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i)
    }
    if (currentPage < totalPages - 2) pages.push('ellipsis')
    pages.push(totalPages)
    return pages
  }

  const btn = (disabled: boolean, onClick: () => void, children: React.ReactNode, label: string) => (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs transition-colors
        ${disabled
          ? 'cursor-not-allowed border-white/5 text-on-glass-subtle opacity-40'
          : 'border-white/10 text-on-glass-muted hover:border-copper/40 hover:bg-white/5 hover:text-copper-light'
        }`}
    >
      {children}
    </button>
  )

  return (
    <div className={`flex flex-col items-center justify-between gap-3 pt-4 sm:flex-row ${className}`}>
      {/* Summary */}
      <p className="text-xs text-on-glass-muted">
        {totalItems === 0
          ? 'No results'
          : <>Showing <span className="font-semibold text-on-glass">{start}–{end}</span> of <span className="font-semibold text-on-glass">{totalItems}</span></>
        }
      </p>

      {/* Page buttons */}
      <div className="flex items-center gap-1">
        {btn(currentPage === 1, () => onPageChange(1), <ChevronsLeft className="h-3.5 w-3.5" />, 'First page')}
        {btn(currentPage === 1, () => onPageChange(currentPage - 1), <ChevronLeft className="h-3.5 w-3.5" />, 'Previous page')}

        {getPageNumbers().map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`ellipsis-${i}`} className="flex h-8 w-8 items-center justify-center text-xs text-on-glass-subtle">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              aria-label={`Page ${p}`}
              aria-current={p === currentPage ? 'page' : undefined}
              className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-medium transition-colors
                ${p === currentPage
                  ? 'border-copper bg-copper/20 text-copper-light'
                  : 'border-white/10 text-on-glass-muted hover:border-copper/40 hover:bg-white/5 hover:text-copper-light'
                }`}
            >
              {p}
            </button>
          )
        )}

        {btn(currentPage === totalPages, () => onPageChange(currentPage + 1), <ChevronRight className="h-3.5 w-3.5" />, 'Next page')}
        {btn(currentPage === totalPages, () => onPageChange(totalPages), <ChevronsRight className="h-3.5 w-3.5" />, 'Last page')}
      </div>

      {/* Page size selector */}
      {onPageSizeChange && (
        <div className="flex items-center gap-2 text-xs text-on-glass-muted">
          <span>Rows</span>
          <select
            value={pageSize}
            onChange={(e) => { onPageSizeChange(Number(e.target.value)); onPageChange(1) }}
            className="rounded-lg border border-white/10 bg-charcoal-900/50 px-2 py-1 text-xs text-on-glass focus:border-copper focus:outline-none"
          >
            {pageSizeOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
