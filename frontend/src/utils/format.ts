export function formatPeso(amount: number): string {
  if (amount >= 1_000_000) return `₱${(amount / 1_000_000).toFixed(2)}M`
  if (amount >= 1_000) return `₱${amount.toLocaleString('en-PH')}`
  return `₱${amount.toFixed(0)}`
}

export function formatRWF(amount: number): string {
  if (amount >= 1_000_000) return `RWF ${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `RWF ${(amount / 1_000).toFixed(0)}K`
  return `RWF ${amount.toLocaleString()}`
}

/** Exact amount — no K/M rounding (product prices, costs). */
export function formatRWFExact(amount: number): string {
  return `RWF ${Number(amount).toLocaleString('en-RW')}`
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function formatCurrency(amount: number): string {
  return formatRWF(amount)
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-RW', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}
