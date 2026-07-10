import { useState, useRef } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, Wrench } from 'lucide-react'
import { useAuth, getRoleRedirectPath } from '../contexts/AuthContext'
import { ROUTES } from '../config/routes'
import { TwoFactorForm } from '../components/auth/TwoFactorForm'
import { GlassCard } from '../components/ui/GlassCard'
import { getSavedEmail } from '../utils/security'

type Step = 'login' | '2fa'

export function LoginPage() {
  const { initiateLogin, verify2FA, resend2FACode, isAuthenticated, isLoading, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const passwordRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('login')
  const [email, setEmail] = useState(getSavedEmail())
  const [rememberMe, setRememberMe] = useState(false)
  const [rememberDevice, setRememberDevice] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [twoFAError, setTwoFAError] = useState('')

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname

  if (isAuthenticated && user) {
    return <Navigate to={from ?? getRoleRedirectPath(user.role)} replace />
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const password = passwordRef.current?.value ?? ''
    if (!email || !password) {
      setError('Please enter email and password')
      return
    }
    try {
      const result = await initiateLogin(email, password, rememberMe)
      if (passwordRef.current) passwordRef.current.value = ''
      if (result.requires2FA) {
        setStep('2fa')
      } else {
        navigate(from ?? ROUTES.DASHBOARD)
      }
    } catch (err) {
      if (passwordRef.current) passwordRef.current.value = ''
      setError(err instanceof Error ? err.message : 'Login failed')
    }
  }

  const handleVerify2FA = async (code: string) => {
    setTwoFAError('')
    try {
      await verify2FA(code, rememberDevice)
      navigate(from ?? ROUTES.DASHBOARD)
    } catch {
      setTwoFAError('Wrong code')
    }
  }

  return (
    <div className="app-bg-pattern flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl glass-strong">
            <Wrench className="h-7 w-7 text-copper-light" />
          </div>
          <h1 className="text-2xl font-bold text-on-glass">RetailPulse</h1>
          <p className="mt-1 text-sm text-on-glass-muted">Intelligent Retail Analytics</p>
          <p className="mt-2 text-xs text-on-glass-muted">Quincaillerie du Rwamagana</p>
        </div>

        {step === 'login' ? (
          <GlassCard strong className="p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-on-glass">Sign in to your account</h2>
            <p className="mt-1 text-sm text-on-glass-muted">Enter your credentials to access the dashboard</p>

            <form onSubmit={(e) => void handleLogin(e)} className="mt-6 space-y-4">
              {error && (
                <div className="rounded-lg border border-rust/30 bg-rust/10 px-4 py-3 text-sm text-rust-light" role="alert">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-on-glass">Email address</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="glass-input mt-1 w-full rounded-lg px-3 py-2.5 text-sm"
                  placeholder="you@retailpulse.rw"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-on-glass">Password</label>
                <div className="relative mt-1">
                  <input
                    ref={passwordRef}
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="off"
                    className="glass-input w-full rounded-lg px-3 py-2.5 pr-10 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-glass-muted hover:text-on-glass"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-on-glass-muted">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-white/30 text-copper focus:ring-copper"
                  />
                  Remember me (30 days)
                </label>
                <Link to="/forgot-password" className="text-sm font-medium text-copper-light hover:text-copper">
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-copper py-2.5 text-sm font-semibold text-white hover:bg-copper-light disabled:opacity-60"
              >
                {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Sign in
              </button>
            </form>
          </GlassCard>
        ) : (
          <TwoFactorForm
            email={email}
            rememberDevice={rememberDevice}
            onRememberDeviceChange={setRememberDevice}
            onVerify={handleVerify2FA}
            onResend={() => resend2FACode(email)}
            isLoading={isLoading}
            error={twoFAError}
          />
        )}
      </div>
    </div>
  )
}
