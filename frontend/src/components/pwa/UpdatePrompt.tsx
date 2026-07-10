import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw } from 'lucide-react'

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (r) {
        setInterval(() => r.update(), 60 * 60 * 1000)
      }
    },
  })

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 rounded-xl border border-forest/30 bg-forest p-4 shadow-card-hover sm:bottom-6 sm:left-auto sm:right-6 sm:max-w-sm">
      <div className="flex items-center gap-3">
        <RefreshCw className="h-5 w-5 shrink-0 text-white" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">Update available</p>
          <p className="text-xs text-white/80">A new version of RetailPulse is ready.</p>
        </div>
        <button
          type="button"
          onClick={() => void updateServiceWorker(true)}
          className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-forest hover:bg-limestone"
        >
          Update
        </button>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          className="shrink-0 text-white/70 hover:text-white"
          aria-label="Dismiss update"
        >
          ×
        </button>
      </div>
    </div>
  )
}
