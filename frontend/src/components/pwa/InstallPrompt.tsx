import { Download } from 'lucide-react'
import { useInstallPrompt } from '../../hooks/useInstallPrompt'

export function InstallPrompt() {
  const { isInstallable, isInstalled, install } = useInstallPrompt()

  if (!isInstallable || isInstalled) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 rounded-xl border border-copper/30 bg-charcoal-800 p-4 shadow-card-hover sm:bottom-6 sm:left-auto sm:right-6 sm:max-w-sm lg:bottom-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-copper/20">
          <Download className="h-5 w-5 text-copper-light" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-limestone">Install RetailPulse</p>
          <p className="mt-0.5 text-sm text-charcoal-300">
            Add to your home screen for quick access and offline support.
          </p>
          <button
            type="button"
            onClick={() => void install()}
            className="mt-3 rounded-lg bg-copper px-4 py-2 text-sm font-medium text-white hover:bg-copper-light"
          >
            Install App
          </button>
        </div>
      </div>
    </div>
  )
}
