import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Briefcase, Building2, Camera, Clock, Loader2, Lock, Mail, MapPin, Monitor, Save, User as UserIcon } from 'lucide-react'
import { ROUTES } from '../config/routes'
import { useAuth } from '../contexts/AuthContext'
import { authApi, clearUserAvatar, saveUserAvatar } from '../services/authApi'
import { getErrorMessage } from '../services/api'
import { addActivity, type ActivityEntry } from '../utils/activityLog'
import { GlassCard } from '../components/ui/GlassCard'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/ui/PageHeader'
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/Avatar'
import { Dialog } from '../components/ui/Dialog'
import { useToast } from '../contexts/ToastContext'
import type { User as AppUser } from '../types'

type ProfileTab = 'profile' | 'security'

const RWANDA_LOCATION = 'Rwamagana, Rwanda'

function formatActivityTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).replace(',', '')
}

function roleBadgeClass(role: AppUser['role']): string {
  switch (role) {
    case 'administrator':
      return 'bg-rust/20 text-rust-light border-rust/30'
    case 'manager':
      return 'bg-copper/20 text-copper-light border-copper/30'
    case 'analyst':
      return 'bg-forest/20 text-forest-light border-forest/30'
    default:
      return 'bg-slate-500/20 text-slate-400 border-slate-500/30'
  }
}

function roleLabel(role: AppUser['role']): string {
  switch (role) {
    case 'administrator': return 'Administrator'
    case 'manager': return 'Manager'
    case 'analyst': return 'Analyst'
    default: return 'Viewer'
  }
}

const gradientBtn = 'rounded-lg bg-gradient-to-r from-copper to-copper-dark px-4 py-2 text-sm font-medium text-white transition-colors hover:from-copper-dark hover:to-copper'
const outlineBtn = 'rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/10'

export function ProfilePage() {
  const { user: authUser, updateUserAvatar } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<ProfileTab>(searchParams.get('tab') === 'security' ? 'security' : 'profile')
  const [profile, setProfile] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
  const [isToggling2FA, setIsToggling2FA] = useState(false)
  const [showDisable2FAConfirm, setShowDisable2FAConfirm] = useState(false)
  const [showEnable2FAModal, setShowEnable2FAModal] = useState(false)
  const [twoFACode, setTwoFACode] = useState('')
  const [disablePassword, setDisablePassword] = useState('')
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', department: '' })
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' })
  const [avatarDraft, setAvatarDraft] = useState<string | null>(null)
  const [avatarDirty, setAvatarDirty] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [activityRows, setActivityRows] = useState<ActivityEntry[]>([])
  const [activityLoading, setActivityLoading] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    authApi.getProfile()
      .then((p) => {
        setProfile(p)
        setForm({
          fullName: p.fullName,
          email: p.email,
          phone: p.phone ?? '',
          department: p.department ?? '',
        })
      })
      .catch(() => {
        const cached = authUser ?? authApi.getStoredUser()
        if (cached) {
          setProfile(cached)
          setForm({
            fullName: cached.fullName,
            email: cached.email,
            phone: cached.phone ?? '',
            department: cached.department ?? '',
          })
        } else {
          setError('Profile not found')
        }
      })
      .finally(() => setLoading(false))

    authApi.getProfileActivity()
      .then((entries) => setActivityRows(
        entries.map((e) => ({
          id: e.id,
          action: e.action,
          description: e.description,
          location: RWANDA_LOCATION,
          timestamp: e.timestamp,
          device: /Mobi|Android|iPhone/i.test(e.description) ? 'Mobile' : 'Desktop',
        })),
      ))
      .catch(() => setActivityRows([]))
      .finally(() => setActivityLoading(false))
  }, [authUser])

  useEffect(() => {
    setTab(searchParams.get('tab') === 'security' ? 'security' : 'profile')
  }, [searchParams])

  const switchTab = (next: ProfileTab) => {
    setTab(next)
    navigate(next === 'security' ? ROUTES.PROFILE_SECURITY : ROUTES.PROFILE, { replace: true })
  }

  const user = profile ?? authUser
  if (loading) return <LoadingSkeleton rows={4} />
  if (!user) return <ErrorState message={error ?? 'Profile not found'} onRetry={() => window.location.reload()} />

  const initials = user.fullName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
  const avatarSrc = avatarDirty ? avatarDraft : (user.avatarDataUrl ?? null)
  const hasCustomAvatar = Boolean(user.avatarDataUrl || (avatarDirty && avatarDraft))
  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleString('en-US', { month: 'short', year: 'numeric' })
    : 'N/A'
  const stores = user.stores?.length ? user.stores : ['All Stores']
  const passwordMismatch = passwords.confirm.length > 0 && passwords.newPass !== passwords.confirm
  const canSubmitPassword = Boolean(passwords.current) && passwords.newPass.length >= 8 && !passwordMismatch

  const triggerSuccess = () => {
    setShowSuccess(true)
    window.setTimeout(() => setShowSuccess(false), 3000)
  }

  const onSelectAvatar = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setAvatarError('Only JPG and PNG files are allowed.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Image must be 5MB or smaller.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setAvatarDraft(String(reader.result))
      setAvatarDirty(true)
      setAvatarError(null)
    }
    reader.readAsDataURL(file)
  }

  const saveAvatar = () => {
    if (!avatarDraft) return
    saveUserAvatar(user.userId, avatarDraft)
    updateUserAvatar(avatarDraft)
    setProfile((prev) => prev ? { ...prev, avatarDataUrl: avatarDraft } : prev)
    setAvatarDirty(false)
    setAvatarDraft(null)
    addActivity('Profile Update', 'Updated profile picture')
    toast('Profile picture updated', 'success')
  }

  const cancelAvatar = () => {
    setAvatarDraft(null)
    setAvatarDirty(false)
    setAvatarError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeAvatar = () => {
    clearUserAvatar(user.userId)
    updateUserAvatar(undefined)
    setProfile((prev) => prev ? { ...prev, avatarDataUrl: undefined } : prev)
    setAvatarDraft(null)
    setAvatarDirty(false)
    addActivity('Profile Update', 'Removed profile picture')
    toast('Profile picture removed', 'info')
  }

  const resetForm = () => {
    setForm({
      fullName: user.fullName,
      email: user.email,
      phone: user.phone ?? '',
      department: user.department ?? '',
    })
    setIsEditing(false)
  }

  const handleProfileUpdate = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSavingProfile(true)
    try {
      const updated = await authApi.updateProfile({
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
      })
      setProfile(updated)
      setIsEditing(false)
      addActivity('Profile Update', 'Updated profile information')
      triggerSuccess()
      toast('Profile updated successfully', 'success')
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handlePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSubmitPassword) return
    setIsUpdatingPassword(true)
    try {
      await authApi.changePassword(passwords.current, passwords.newPass)
      setPasswords({ current: '', newPass: '', confirm: '' })
      addActivity('Password Change', 'Changed account password')
      triggerSuccess()
      toast('Password updated successfully', 'success')
    } catch {
      toast('Could not update password. Check your connection.', 'error')
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  const startEnable2FA = async () => {
    setIsToggling2FA(true)
    try {
      await authApi.send2FAVerification()
      setShowEnable2FAModal(true)
      toast('Verification code sent to your email', 'info')
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setIsToggling2FA(false)
    }
  }

  const confirmEnable2FA = async () => {
    if (!twoFACode.trim()) return
    setIsToggling2FA(true)
    try {
      await authApi.enable2FA(twoFACode.trim())
      setProfile((prev) => prev ? { ...prev, twoFactorEnabled: true } : prev)
      setShowEnable2FAModal(false)
      setTwoFACode('')
      addActivity('Security', 'Enabled two-factor authentication')
      toast('Two-factor authentication enabled', 'success')
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setIsToggling2FA(false)
    }
  }

  const startDisable2FA = async () => {
    setIsToggling2FA(true)
    try {
      await authApi.send2FAVerification()
      setDisablePassword('')
      setTwoFACode('')
      setShowDisable2FAConfirm(true)
      toast('Verification code sent to your email', 'info')
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setIsToggling2FA(false)
    }
  }

  const confirmDisable2FA = async () => {
    if (!twoFACode.trim() || !disablePassword) return
    setIsToggling2FA(true)
    try {
      await authApi.disable2FA(twoFACode.trim(), disablePassword)
      setProfile((prev) => prev ? { ...prev, twoFactorEnabled: false } : prev)
      setShowDisable2FAConfirm(false)
      setTwoFACode('')
      setDisablePassword('')
      addActivity('Security', 'Disabled two-factor authentication')
      toast('Two-factor authentication disabled', 'success')
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setIsToggling2FA(false)
    }
  }

  return (
    <div className="pb-8">
      {/* Page header — no breadcrumb */}
      <h1 className="mb-2 text-3xl font-bold text-white">My Profile</h1>
      <p className="text-slate-400">Manage your account settings and preferences</p>

      {showSuccess && (
        <div className="mt-4 rounded-lg border border-forest/30 bg-forest/10 px-4 py-3 text-sm text-forest-light">
          Changes saved successfully!
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* ── PROFILE CARD (1 col) ── */}
        <GlassCard className="overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl lg:col-span-1">
          <div className="flex flex-col items-center px-6 pb-6 pt-6 text-center">
            {/* Avatar + camera */}
            <div className="relative mb-4">
              <Avatar className="h-32 w-32 border-4 border-copper/30">
                {avatarSrc ? (
                  <AvatarImage src={avatarSrc} alt={user.fullName} className="h-full w-full object-cover" />
                ) : (
                  <AvatarFallback className="bg-gradient-to-br from-copper to-copper-dark text-3xl font-bold text-white">
                    {initials}
                  </AvatarFallback>
                )}
              </Avatar>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={onSelectAvatar}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 flex h-10 w-10 items-center justify-center rounded-full bg-copper text-white transition-colors hover:bg-copper/80"
                style={{ border: '4px solid #0f172a' }}
                aria-label="Upload profile picture"
              >
                <Camera className="h-5 w-5" />
              </button>
            </div>

            {avatarError && <p className="mb-2 text-xs text-rust-light">{avatarError}</p>}

            {avatarDirty && (
              <div className="mb-3 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={saveAvatar} className={gradientBtn}>
                  Save Picture
                </button>
                <button type="button" onClick={cancelAvatar} className={outlineBtn}>
                  Cancel
                </button>
              </div>
            )}

            {hasCustomAvatar && !avatarDirty && (
              <button type="button" onClick={removeAvatar} className="mb-3 text-xs text-slate-400 underline-offset-2 hover:underline">
                Remove Photo
              </button>
            )}

            <p className="mb-1 text-xl font-bold text-white">{user.fullName}</p>
            <p className="mb-3 text-sm text-slate-400">{user.email}</p>
            <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${roleBadgeClass(user.role)}`}>
              {roleLabel(user.role)}
            </span>

            {/* Stats */}
            <div className="mt-6 w-full space-y-3 border-t border-white/10 pt-6 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-400">User ID</span>
                <span className="font-medium text-white">{user.id ?? user.userId}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="shrink-0 text-slate-400">Stores Access</span>
                <span className="text-right font-medium text-white">{stores.join(', ')}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-400">Member Since</span>
                <span className="font-medium text-white">{memberSince}</span>
              </div>
            </div>
        </div>
      </GlassCard>

        {/* ── SETTINGS CARD (2 cols) ── */}
        <GlassCard className="overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl lg:col-span-2">
          {/* Tab bar */}
          <div className="border-b border-white/10 px-4 py-4">
            <div className="grid w-full grid-cols-2 gap-1 rounded-lg bg-white/5 p-1">
              <button
                type="button"
                onClick={() => switchTab('profile')}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  tab === 'profile' ? 'bg-copper text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Profile Information
              </button>
              <button
                type="button"
                onClick={() => switchTab('security')}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  tab === 'security' ? 'bg-copper text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Security
              </button>
            </div>
          </div>

          <div className="p-6">
            {/* ── PROFILE INFORMATION TAB ── */}
            {tab === 'profile' && (
              <form onSubmit={(e) => void handleProfileUpdate(e)}>
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Personal Information</h2>
                    <p className="text-sm text-slate-400">Update your personal details</p>
                  </div>
                  {!isEditing && (
                    <button type="button" onClick={() => setIsEditing(true)} className={outlineBtn}>
                      Edit Profile
                    </button>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="profile-name" className="mb-1 block text-sm text-slate-300">
                      <UserIcon className="mr-2 inline h-4 w-4" />
                      Full Name
                    </label>
                    <input
                      id="profile-name"
                      value={form.fullName}
                      disabled={!isEditing}
                      onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white disabled:opacity-50"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="profile-email" className="mb-1 block text-sm text-slate-300">
                      <Mail className="mr-2 inline h-4 w-4" />
                      Email Address
                    </label>
                    <input
                      id="profile-email"
                      type="email"
                      value={form.email}
                      disabled={!isEditing}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white disabled:opacity-50"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="profile-phone" className="mb-1 block text-sm text-slate-300">
                      Phone Number
                    </label>
                    <input
                      id="profile-phone"
                      type="tel"
                      value={form.phone}
                      disabled={!isEditing}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label htmlFor="profile-role" className="mb-1 block text-sm text-slate-300">
                      <Briefcase className="mr-2 inline h-4 w-4" />
                      Role
                    </label>
                    <input
                      id="profile-role"
                      value={profile ? roleLabel(profile.role) : '—'}
                      readOnly
                      disabled
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white opacity-80"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm text-slate-300">
                      <Building2 className="mr-2 inline h-4 w-4" />
                      Store Access
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {stores.map((store) => (
                        <span
                          key={store}
                          className="inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-white"
                        >
                          {store}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {isEditing && (
                  <div className="mt-4 flex flex-wrap gap-3 pt-4">
                    <button type="submit" disabled={isSavingProfile} className={`${gradientBtn} disabled:opacity-50`}>
                      {isSavingProfile ? (
                        <>
                          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 inline h-4 w-4" />
                          Save Changes
                        </>
                      )}
                    </button>
                    <button type="button" onClick={resetForm} className={outlineBtn}>
                      Cancel
                    </button>
                  </div>
                )}
              </form>
            )}

            {/* ── SECURITY TAB ── */}
            {tab === 'security' && (
              <div>
                <form onSubmit={(e) => void handlePasswordChange(e)} className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Change Password</h2>
                    <p className="text-sm text-slate-400">Ensure your account stays secure</p>
                  </div>

                  <div>
                    <label htmlFor="current-password" className="mb-1 block text-sm text-slate-300">
                      <Lock className="mr-2 inline h-4 w-4" />
                      Current Password
                    </label>
                    <input
                      id="current-password"
                      type="password"
                      placeholder="Enter current password"
                      value={passwords.current}
                      onChange={(e) => setPasswords((p) => ({ ...p, current: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="new-password" className="mb-1 block text-sm text-slate-300">
                      New Password
                    </label>
                    <input
                      id="new-password"
                      type="password"
                      minLength={8}
                      placeholder="Enter new password"
                      value={passwords.newPass}
                      onChange={(e) => setPasswords((p) => ({ ...p, newPass: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                      required
                    />
                    <p className="mt-1 text-xs text-slate-400">Minimum 8 characters</p>
                  </div>
                  <div>
                    <label htmlFor="confirm-password" className="mb-1 block text-sm text-slate-300">
                      Confirm New Password
                    </label>
                    <input
                      id="confirm-password"
                      type="password"
                      placeholder="Confirm new password"
                      value={passwords.confirm}
                      onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                      required
                    />
                    {passwordMismatch && (
                      <p className="mt-1 text-xs text-rust-light">Passwords do not match</p>
                    )}
      </div>

                  <button
                    type="submit"
                    disabled={!canSubmitPassword || isUpdatingPassword}
                    className={`${gradientBtn} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {isUpdatingPassword ? (
                      <>
                        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <Lock className="mr-2 inline h-4 w-4" />
                        Update Password
                      </>
                    )}
                  </button>
          </form>

                {/* 2FA */}
                <div className="mt-6 border-t border-white/10 pt-6">
                  <h3 className="mb-3 text-sm font-semibold text-white">Two-Factor Authentication</h3>
                  <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">OTP Verification</p>
                      <p className="text-xs text-slate-400">Add an extra layer of security</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                        user.twoFactorEnabled
                          ? 'border-forest/30 bg-forest/20 text-forest-light'
                          : 'border-slate-500/30 bg-slate-500/20 text-slate-400'
                      }`}>
                        {user.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                      {user.twoFactorEnabled ? (
                        <button type="button" onClick={() => void startDisable2FA()} disabled={isToggling2FA} className={`${outlineBtn} disabled:opacity-50`}>
                          {isToggling2FA ? 'Sending...' : 'Disable'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void startEnable2FA()}
                          disabled={isToggling2FA}
                          className={`${outlineBtn} disabled:opacity-50`}
                        >
                          {isToggling2FA ? 'Sending...' : 'Enable'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Activity Log */}
                <div className="mt-6 border-t border-white/10 pt-6">
                  <h3 className="mb-3 text-sm font-semibold text-white">Activity Log</h3>
                  {activityLoading ? (
                    <p className="text-sm text-slate-400">Loading activity...</p>
                  ) : activityRows.length === 0 ? (
                    <EmptyState icon={<Clock className="h-6 w-6" />} title="No activity" description="No recent account activity found." />
                  ) : (
                    <div className="space-y-4">
                      {activityRows.slice(0, 5).map((entry) => (
                      <div
                        key={entry.id}
                        className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/5 p-4 lg:flex-row lg:items-center lg:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white">{entry.action}</p>
                          <p className="text-xs text-slate-400">{entry.description}</p>
                        </div>
                        <div className="flex shrink-0 items-center text-xs text-slate-400">
                          <MapPin className="mr-2 h-4 w-4 shrink-0" />
                          {entry.location}
                        </div>
                        <div className="flex shrink-0 items-center text-xs text-slate-400">
                          <Clock className="mr-2 h-4 w-4 shrink-0" />
                          {formatActivityTimestamp(entry.timestamp)}
                        </div>
                        <div className="flex shrink-0 items-center text-xs text-slate-400">
                          <Monitor className="mr-2 h-4 w-4 shrink-0" />
                          {entry.device}
                        </div>
                      </div>
                    ))}
                    </div>
                  )}
            </div>
            </div>
            )}
          </div>
        </GlassCard>
      </div>

      <Dialog
        open={showDisable2FAConfirm}
        onClose={() => setShowDisable2FAConfirm(false)}
        title="Disable Two-Factor Authentication"
        footer={(
          <>
            <button type="button" onClick={() => setShowDisable2FAConfirm(false)} className={outlineBtn}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirmDisable2FA()}
              disabled={!twoFACode.trim() || !disablePassword || isToggling2FA}
              className="rounded-lg bg-rust px-4 py-2 text-sm font-medium text-white hover:bg-rust/90 disabled:opacity-50"
            >
              {isToggling2FA ? 'Disabling...' : 'Disable 2FA'}
            </button>
          </>
        )}
      >
        <p className="mb-3 text-sm text-slate-400">
          Enter your current password and the verification code sent to your email to disable 2FA.
        </p>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Current password</label>
            <input
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              className="glass-input w-full rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Verification code</label>
            <input
              type="text"
              value={twoFACode}
              onChange={(e) => setTwoFACode(e.target.value)}
              className="glass-input w-full rounded-lg px-3 py-2 text-sm"
              placeholder="6-digit code"
              maxLength={6}
            />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={showEnable2FAModal}
        onClose={() => setShowEnable2FAModal(false)}
        title="Enable Two-Factor Authentication"
        footer={(
          <>
            <button type="button" onClick={() => setShowEnable2FAModal(false)} className={outlineBtn}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirmEnable2FA()}
              disabled={!twoFACode.trim() || isToggling2FA}
              className={`${gradientBtn} disabled:opacity-50`}
            >
              {isToggling2FA ? 'Verifying...' : 'Verify & Enable'}
            </button>
          </>
        )}
      >
        <p className="mb-3 text-sm text-slate-400">Enter the verification code sent to your email.</p>
        <input
          type="text"
          value={twoFACode}
          onChange={(e) => setTwoFACode(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          placeholder="6-digit code"
          maxLength={6}
        />
      </Dialog>
    </div>
  )
}
