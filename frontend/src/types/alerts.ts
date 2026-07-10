export interface AlertPreferencesData {
  channels: {
    inApp: boolean
    email: boolean
    sms: boolean
  }
  soundEnabled: boolean
  doNotDisturb: {
    enabled: boolean
    startTime: string
    endTime: string
    days: string[]
  }
  digest: {
    frequency: 'instant' | 'hourly' | 'daily' | 'weekly'
    time: string
    day: string
  }
  alertTypes: {
    inventory: boolean
    sales: boolean
    customer: boolean
    system: boolean
    security: boolean
  }
  thresholds: {
    lowStock: number
    targetDeviation: number
    churnRisk: number
    aiAccuracy: number
  }
}

export const DEFAULT_ALERT_PREFERENCES: AlertPreferencesData = {
  channels: { inApp: true, email: true, sms: false },
  soundEnabled: true,
  doNotDisturb: {
    enabled: false,
    startTime: '22:00',
    endTime: '07:00',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  },
  digest: { frequency: 'instant', time: '08:00', day: 'Monday' },
  alertTypes: {
    inventory: true,
    sales: true,
    customer: true,
    system: true,
    security: true,
  },
  thresholds: {
    lowStock: 10,
    targetDeviation: 15,
    churnRisk: 0.6,
    aiAccuracy: 80,
  },
}

export const DND_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export const WEEK_DAYS = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const
