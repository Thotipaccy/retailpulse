const DEVICE_ID_KEY = 'retailpulse_device_id'
const REMEMBERED_DEVICE_PREFIX = 'retailpulse_remembered_device_'
const SAVED_EMAIL_KEY = 'retailpulse_saved_email'

function fingerprintSeed(): string {
  const ua = navigator.userAgent ?? 'ua'
  const lang = navigator.language ?? 'lang'
  const platform = navigator.platform ?? 'platform'
  const width = window.screen?.width ?? 0
  const height = window.screen?.height ?? 0
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'tz'
  return `${ua}|${lang}|${platform}|${width}x${height}|${tz}`
}

function hashString(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

export function getDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY)
  if (existing) return existing
  const generated = `dev_${hashString(fingerprintSeed())}`
  localStorage.setItem(DEVICE_ID_KEY, generated)
  return generated
}

export function rememberDevice(email: string, days = 30): void {
  const deviceId = getDeviceId()
  const expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000)
  localStorage.setItem(`${REMEMBERED_DEVICE_PREFIX}${email.toLowerCase()}`, JSON.stringify({ deviceId, expiresAt }))
  localStorage.setItem(SAVED_EMAIL_KEY, email)
}

export function isDeviceRemembered(email: string): boolean {
  const raw = localStorage.getItem(`${REMEMBERED_DEVICE_PREFIX}${email.toLowerCase()}`)
  if (!raw) return false
  try {
    const parsed = JSON.parse(raw) as { deviceId: string; expiresAt: number }
    if (Date.now() > parsed.expiresAt) return false
    return parsed.deviceId === getDeviceId()
  } catch {
    return false
  }
}

export function getSavedEmail(): string {
  return localStorage.getItem(SAVED_EMAIL_KEY) ?? ''
}
