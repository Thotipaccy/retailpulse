export interface ActivityEntry {
  id: string
  action: string
  description: string
  location: string
  timestamp: string
  device: string
}

const ACTIVITY_KEY = 'retailpulse_activity_log'
const RWAMAGANA_LOCATION = 'Rwamagana, Rwanda'

function detectDevice(): string {
  const ua = navigator.userAgent
  const browser = ua.includes('Edg/') ? 'Edge'
    : ua.includes('Chrome/') ? 'Chrome'
      : ua.includes('Safari/') ? 'Safari'
        : ua.includes('Firefox/') ? 'Firefox'
          : 'Browser'
  const os = ua.includes('Windows') ? 'Windows'
    : ua.includes('Mac OS') ? 'macOS'
      : ua.includes('Linux') ? 'Linux'
        : ua.includes('Android') ? 'Android'
          : ua.includes('iPhone') ? 'iOS'
            : 'OS'
  return `${browser} on ${os}`
}

export function addActivity(action: string, description: string): void {
  const current = getActivityLog()
  const next: ActivityEntry = {
    id: `act_${Date.now()}`,
    action,
    description,
    location: RWAMAGANA_LOCATION,
    timestamp: new Date().toISOString(),
    device: detectDevice(),
  }
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify([next, ...current].slice(0, 50)))
}

export function getActivityLog(): ActivityEntry[] {
  const raw = localStorage.getItem(ACTIVITY_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as ActivityEntry[]
  } catch {
    return []
  }
}
