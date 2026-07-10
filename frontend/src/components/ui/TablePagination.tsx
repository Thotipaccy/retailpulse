const PAGE_SIZE = 25

interface TablePaginationProps {
  page: number
  totalItems: number
  onPageChange: (page: number) => void
  pageSize?: number
}

export function TablePagination({ page, totalItems, onPageChange, pageSize = PAGE_SIZE }: TablePaginationProps) {
  if (totalItems === 0) return null

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const start = page * pageSize + 1
  const end = Math.min((page + 1) * pageSize, totalItems)

  return (
    <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
      <p className="text-sm text-on-glass-muted">
        Showing {start}–{end} of {totalItems}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
          className="rounded-lg glass-subtle px-3 py-1 text-sm text-on-glass disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
          className="rounded-lg glass-subtle px-3 py-1 text-sm text-on-glass disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  )
}

export { PAGE_SIZE as TABLE_PAGE_SIZE }
