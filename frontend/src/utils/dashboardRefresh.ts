export const DASHBOARD_REFRESH_EVENT = 'retailpulse:dashboard-refresh'

export function notifyDashboardRefresh(): void {
  window.dispatchEvent(new Event(DASHBOARD_REFRESH_EVENT))
}
