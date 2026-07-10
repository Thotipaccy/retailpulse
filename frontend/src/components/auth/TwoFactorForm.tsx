import { useEffect, useRef, useState } from 'react'
import { Loader2, Mail } from 'lucide-react'
import { GlassCard } from '../ui/GlassCard'

interface TwoFactorFormProps {
  email: string
  rememberDevice: boolean
  onRememberDeviceChange: (v: boolean) => void
  onVerify: (code: string) => Promise<void>
  onResend: () => Promise<void>
  isLoading: boolean
  error: string
}

export function TwoFactorForm({
  email,
  rememberDevice,
  onRememberDeviceChange,
  onVerify,
  onResend,
  isLoading,
  error,
}: TwoFactorFormProps) {
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [resendTimer, setResendTimer] = useState(60)
  const refs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (resendTimer <= 0) return
    const t = setTimeout(() => setResendTimer((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendTimer])

  const handleDigit = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    const next = [...digits]
    next[index] = value
    setDigits(next)
    if (value && index < 5) refs.current[index + 1]?.focus()
    if (next.every((d) => d) && next.join('').length === 6) {
      void onVerify(next.join(''))
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus()
    }
  }

  const handleResend = async () => {
    if (resendTimer > 0) return
    await onResend()
    setResendTimer(60)
    setDigits(['', '', '', '', '', ''])
  }

  return (
    <GlassCard strong className="p-6 sm:p-8">
      <div className="flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full glass-subtle">
          <Mail className="h-7 w-7 text-copper-light" />
        </div>
      </div>
      <h2 className="mt-4 text-center text-lg font-semibold text-on-glass">Check your email</h2>
      <p className="mt-2 text-center text-sm text-on-glass-muted">
        We sent a 6-digit code to <span className="text-copper-light">{email}</span>
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-rust/30 bg-rust/10 px-4 py-3 text-center text-sm text-rust-light" role="alert">
          Wrong code. Please try again.
        </div>
      )}

      <div className="mt-6 flex justify-center gap-2">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={(e) => handleDigit(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className="glass-input h-12 w-10 rounded-lg text-center text-lg font-bold sm:w-12"
            aria-label={`Digit ${i + 1}`}
            autoComplete="off"
          />
        ))}
      </div>

      <p className="mt-4 text-center text-sm text-on-glass-muted">
        {resendTimer > 0 ? (
          <>Resend code in <span className="text-copper-light">{resendTimer}s</span></>
        ) : (
          <button type="button" onClick={() => void handleResend()} className="text-copper-light hover:underline">
            Resend code
          </button>
        )}
      </p>

      <label className="mt-4 flex items-center justify-center gap-2 text-sm text-on-glass-muted">
        <input
          type="checkbox"
          checked={rememberDevice}
          onChange={(e) => onRememberDeviceChange(e.target.checked)}
          className="rounded border-white/30 text-copper focus:ring-copper"
        />
        Remember this device
      </label>

      <button
        type="button"
        disabled={isLoading || digits.join('').length !== 6}
        onClick={() => void onVerify(digits.join(''))}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-copper py-2.5 text-sm font-semibold text-white hover:bg-copper-light disabled:opacity-50"
      >
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        Verify &amp; Continue
      </button>
      <p className="mt-3 text-center text-xs text-on-glass-muted">Check your email for the 6-digit verification code.</p>
    </GlassCard>
  )
}
