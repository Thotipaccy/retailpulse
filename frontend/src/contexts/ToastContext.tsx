import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle, X, XCircle } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now()
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-20 right-4 z-[100] flex flex-col gap-2 md:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg glass-strong ${
              t.type === 'success' ? 'border-forest/30' : t.type === 'error' ? 'border-rust/30' : 'border-white/15'
            }`}
          >
            {t.type === 'success' ? <CheckCircle className="h-4 w-4 text-forest-light" /> :
             t.type === 'error' ? <XCircle className="h-4 w-4 text-rust-light" /> : null}
            <span className="text-sm text-on-glass">{t.message}</span>
            <button type="button" onClick={() => setToasts((x) => x.filter((i) => i.id !== t.id))} className="ml-2 text-on-glass-muted hover:text-on-glass">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
