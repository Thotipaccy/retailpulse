import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Wrench } from 'lucide-react'
import { GlassCard } from '../components/ui/GlassCard'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    await new Promise((r) => setTimeout(r, 800))
    setSubmitted(true)
    setLoading(false)
  }

  return (
    <div className="app-bg-pattern flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl glass-strong">
            <Wrench className="h-7 w-7 text-copper-light" />
          </div>
          <h1 className="text-2xl font-bold text-on-glass">Reset Password</h1>
        </div>

        <GlassCard strong className="p-6 sm:p-8">
          {submitted ? (
            <p className="text-sm text-on-glass">If an account exists for {email}, a password reset link has been sent.</p>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <p className="text-sm text-on-glass-muted">Enter your email and we'll send a reset link.</p>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-on-glass">Email address</label>
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="glass-input mt-1 w-full rounded-lg px-3 py-2.5 text-sm" />
              </div>
              <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-copper py-2.5 text-sm font-semibold text-white hover:bg-copper-light disabled:opacity-60">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Send reset link
              </button>
            </form>
          )}
          <Link to="/login" className="mt-4 block text-center text-sm text-copper-light hover:underline">Back to sign in</Link>
        </GlassCard>
      </div>
    </div>
  )
}
