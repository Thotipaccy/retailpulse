const DEVICE_KEY = 'retailpulse_device_id'
const TRUSTED_KEY = 'retailpulse_trusted_devices'

function generateDeviceId(): string {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const nav = navigator as Navigator & { deviceMemory?: number }
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    nav.deviceMemory ?? 0,
  ].join('|')
  if (ctx) {
    ctx.textBaseline = 'top'
    ctx.font = '14px Inter'
    ctx.fillText(fingerprint, 2, 2)
    return btoa(canvas.toDataURL()).slice(0, 32)
  }
  return btoa(fingerprint).slice(0, 32)
}

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = generateDeviceId()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

export function isDeviceTrusted(email: string): boolean {
  const trusted = JSON.parse(localStorage.getItem(TRUSTED_KEY) ?? '[]') as string[]
  return trusted.includes(`${email}:${getDeviceId()}`)
}

export function trustDevice(email: string): void {
  const trusted = JSON.parse(localStorage.getItem(TRUSTED_KEY) ?? '[]') as string[]
  const key = `${email}:${getDeviceId()}`
  if (!trusted.includes(key)) {
    trusted.push(key)
    localStorage.setItem(TRUSTED_KEY, JSON.stringify(trusted))
  }
}

export function revokeDeviceTrust(email: string): void {
  const trusted = JSON.parse(localStorage.getItem(TRUSTED_KEY) ?? '[]') as string[]
  const key = `${email}:${getDeviceId()}`
  localStorage.setItem(TRUSTED_KEY, JSON.stringify(trusted.filter((t) => t !== key)))
}
