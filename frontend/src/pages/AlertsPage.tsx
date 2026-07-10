import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bell, Settings, X, AlertTriangle, AlertCircle, CheckCircle2, Info,
  Package, TrendingDown, RefreshCw, Target, Users, Pencil, Eye,
} from 'lucide-react'
import { alertApi } from '../services/alertApi'
import { formatRelativeTime } from '../utils/format'
import { getErrorMessage } from '../services/api'
import { ModulePageHeader } from '../components/ui/ModulePageHeader'
import { TintedKPICard } from '../components/ui/TintedKPICard'
import { GlassCard } from '../components/ui/GlassCard'
import { TabNav } from '../components/ui/TabNav'
import { Switch } from '../components/ui/Switch'
import { StatusBadge } from '../components/ui/StatusBadge'
import { DeactivateConfirmModal } from '../components/ui/DeactivateConfirmModal'
import { Dialog } from '../components/ui/Dialog'
import { AlertPreferencesModal } from '../components/modals/AlertPreferencesModal'
import { useToast } from '../contexts/ToastContext'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/ui/PageHeader'
import type { Alert } from '../types'

type Tab = 'all' | 'unread' | 'rules'

interface AlertRule {
  id: string
  name: string
  description: string
  threshold: string
  enabled: boolean
  isActive: boolean
  icon: typeof Package
}

const RULE_ICONS: Record<string, typeof Package> = {
  inventory: Package,
  sales: TrendingDown,
  sync: RefreshCw,
  revenue: Target,
  customer: Users,
}

function pickRuleIcon(name: string): typeof Package {
  const lower = name.toLowerCase()
  for (const [key, icon] of Object.entries(RULE_ICONS)) {
    if (lower.includes(key)) return icon
  }
  return Bell
}

function mapRule(row: Record<string, unknown>, index: number): AlertRule {
  const name = String(row.name ?? row.ruleName ?? `Rule ${index + 1}`)
  return {
    id: String(row.id ?? row.ruleId ?? index),
    name,
    description: String(row.description ?? ''),
    threshold: String(row.threshold ?? row.condition ?? '—'),
    enabled: row.enabled !== false,
    isActive: row.isActive !== false,
    icon: pickRuleIcon(name),
  }
}

function severityIcon(severity: Alert['severity']) {
  switch (severity) {
    case 'critical': return { Icon: AlertTriangle, color: 'text-rust-light bg-rust/15' }
    case 'high': return { Icon: AlertCircle, color: 'text-ochre bg-ochre/15' }
    case 'medium': return { Icon: Info, color: 'text-steel-light bg-steel/15' }
    default: return { Icon: CheckCircle2, color: 'text-forest-light bg-forest/15' }
  }
}

function severityToStat(severity: Alert['severity']): 'critical' | 'warning' | 'success' | 'info' {
  if (severity === 'critical') return 'critical'
  if (severity === 'high') return 'warning'
  if (severity === 'low') return 'success'
  return 'info'
}

export function AlertsPage() {
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>('all')
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rulesLoading, setRulesLoading] = useState(false)
  const [rulesError, setRulesError] = useState<string | null>(null)
  const [rules, setRules] = useState<AlertRule[]>([])
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [editRuleId, setEditRuleId] = useState<string | null>(null)
  const [editThreshold, setEditThreshold] = useState('')
  const [editChannel, setEditChannel] = useState('In-app + Email')
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [deactivateRule, setDeactivateRule] = useState<AlertRule | null>(null)

  const loadAlerts = useCallback(() => {
    setLoading(true)
    setError(null)
    alertApi.getAlerts('all')
      .then((data) => setAlerts(data))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  const loadRules = useCallback(() => {
    setRulesLoading(true)
    setRulesError(null)
    alertApi.getRules()
      .then((data) => setRules(data.map(mapRule)))
      .catch((err) => setRulesError(getErrorMessage(err)))
      .finally(() => setRulesLoading(false))
  }, [])

  useEffect(() => {
    loadAlerts()
  }, [loadAlerts])

  useEffect(() => {
    if (tab === 'rules') loadRules()
  }, [tab, loadRules])

  useEffect(() => {
    alertApi.getPreferences().catch(() => {})
  }, [])

  const visibleAlerts = useMemo(
    () => {
      const active = alerts.filter((a) => !dismissed.has(a.alertId))
      return tab === 'unread' ? active.filter((a) => !a.isRead) : active
    },
    [alerts, dismissed, tab],
  )

  const unreadCount = alerts.filter((a) => !a.isRead && !dismissed.has(a.alertId)).length

  const stats = useMemo(() => {
    const active = alerts.filter((a) => !dismissed.has(a.alertId))
    return {
      critical: active.filter((a) => a.severity === 'critical').length,
      warning: active.filter((a) => a.severity === 'high').length,
      success: active.filter((a) => a.severity === 'low').length,
      info: active.filter((a) => a.severity === 'medium').length,
    }
  }, [alerts, dismissed])

  const handleMarkRead = async (id: string) => {
    try {
      await alertApi.markRead(id)
    } catch { /* local update still applies */ }
    setAlerts((prev) => prev.map((a) => (a.alertId === id ? { ...a, isRead: true } : a)))
  }

  const handleMarkAll = async () => {
    try {
      await alertApi.markAllRead()
      toast('All alerts marked as read', 'success')
    } catch {
      toast('Failed to mark all as read', 'error')
      return
    }
    setAlerts((prev) => prev.map((a) => ({ ...a, isRead: true })))
  }

  const handleDismiss = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id))
    void handleMarkRead(id)
    toast('Alert dismissed', 'info')
  }

  const toggleRule = async (id: string) => {
    const rule = rules.find((r) => r.id === id)
    if (!rule) return
    const newEnabled = !rule.enabled
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: newEnabled } : r)))
    try {
      await alertApi.updateRule(id, { isActive: newEnabled })
      toast(`Alert rule ${newEnabled ? 'enabled' : 'disabled'}`, 'success')
    } catch {
      // Rollback on failure
      setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: rule.enabled } : r)))
      toast('Failed to update alert rule', 'error')
    }
  }

  const editRule = rules.find((r) => r.id === editRuleId)

  if (loading && tab !== 'rules') return <LoadingSkeleton rows={5} />
  if (error && tab !== 'rules') return <ErrorState message={error} onRetry={loadAlerts} />

  return (
    <div>
      <ModulePageHeader
        icon={Bell}
        title="Alerts"
        subtitle="System notifications and risk monitoring"
        badge={
          unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rust px-1 text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          ) : undefined
        }
        actions={
          <>
            <button type="button" onClick={() => setPrefsOpen(true)} className="inline-flex items-center gap-2 rounded-lg glass-subtle px-4 py-2 text-sm text-on-glass hover:glass">
              <Settings className="h-4 w-4" />
              Preferences
            </button>
            <button type="button" onClick={() => void handleMarkAll()} className="rounded-lg bg-copper px-4 py-2 text-sm font-medium text-white hover:bg-copper-light">
              Mark All as Read
            </button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TintedKPICard label="Critical" value={stats.critical} subtitle="Immediate action required" tint="red" />
        <TintedKPICard label="Warning" value={stats.warning} subtitle="Review soon" tint="amber" />
        <TintedKPICard label="Success" value={stats.success} subtitle="Positive updates" tint="green" />
        <TintedKPICard label="Info" value={stats.info} subtitle="Informational notices" tint="blue" />
      </div>

      <TabNav
        tabs={[
          { id: 'all' as Tab, label: 'All Alerts', count: alerts.filter((a) => !dismissed.has(a.alertId)).length },
          { id: 'unread' as Tab, label: 'Unread', count: unreadCount },
          { id: 'rules' as Tab, label: 'Alert Rules' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {(tab === 'all' || tab === 'unread') && (
        <div className="space-y-3">
          {visibleAlerts.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-6 w-6" />}
              title="All caught up"
              description={`No ${tab === 'unread' ? 'unread ' : ''}alerts to show`}
            />
          ) : (
            visibleAlerts.map((alert) => {
              const { Icon, color } = severityIcon(alert.severity)
              return (
                <GlassCard key={alert.alertId} className={`flex items-start gap-4 p-4 ${!alert.isRead ? 'border-l-2 border-l-steel-light' : ''}`}>
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge variant={severityToStat(alert.severity) === 'critical' ? 'danger' : severityToStat(alert.severity) === 'warning' ? 'warning' : severityToStat(alert.severity) === 'success' ? 'success' : 'info'}>
                        {alert.severity}
                      </StatusBadge>
                      <span className="text-xs text-on-glass-muted">{alert.alertType}</span>
                      {!alert.isRead && (
                        <span className="rounded-full bg-steel/20 px-2 py-0.5 text-[10px] font-medium text-steel-light">Unread</span>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm text-on-glass">{alert.message}</p>
                    <p className="mt-1 text-xs text-on-glass-muted">{formatRelativeTime(alert.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {!alert.isRead && (
                      <button
                        type="button"
                        onClick={() => void handleMarkRead(alert.alertId)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-forest-light hover:bg-forest/10"
                        aria-label="Mark as read"
                        title="Mark as read"
                      >
                        <Eye className="h-3 w-3" />
                        Mark read
                      </button>
                    )}
                    <button type="button" onClick={() => handleDismiss(alert.alertId)} className="rounded-lg p-1.5 text-on-glass-muted hover:bg-white/10 hover:text-on-glass" aria-label="Dismiss alert">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </GlassCard>
              )
            })
          )}
        </div>
      )}

      {tab === 'rules' && (
        rulesLoading ? <LoadingSkeleton rows={5} /> :
        rulesError ? <ErrorState message={rulesError} onRetry={loadRules} /> :
        rules.length === 0 ? (
          <EmptyState icon={<Bell className="h-6 w-6" />} title="No alert rules" description="Alert rules are not configured." />
        ) : (
          <GlassCard className="overflow-hidden">
            <div className="divide-y divide-white/5">
              {rules.map((rule) => {
                const Icon = rule.icon
                return (
                  <div key={rule.id} className={`flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${!rule.isActive ? 'opacity-70' : ''}`}>
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-copper/15">
                        <Icon className="h-5 w-5 text-copper-light" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-on-glass">{rule.name}</p>
                          {!rule.isActive && <StatusBadge variant="neutral">Inactive</StatusBadge>}
                        </div>
                        <p className="text-sm text-on-glass-muted">{rule.description}</p>
                        <p className="mt-1 text-xs text-copper-light">Threshold: {rule.threshold}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {rule.isActive && <Switch checked={rule.enabled} onChange={() => toggleRule(rule.id)} />}
                      <button type="button" onClick={() => { setEditRuleId(rule.id); setEditThreshold(rule.threshold); setEditChannel('In-app + Email') }} className="inline-flex items-center gap-1.5 rounded-lg glass-subtle px-3 py-1.5 text-sm text-on-glass hover:glass">
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      {rule.isActive ? (
                        <button type="button" onClick={() => setDeactivateRule(rule)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-rust-light hover:bg-rust/10">Deactivate</button>
                      ) : (
                        <button type="button" onClick={async () => {
                          try {
                            await alertApi.updateRule(rule.id, { isActive: true })
                            setRules((r) => r.map((x) => x.id === rule.id ? { ...x, isActive: true, enabled: true } : x))
                            toast(`${rule.name} has been reactivated`, 'success')
                          } catch {
                            toast('Failed to reactivate rule', 'error')
                          }
                        }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-forest-light hover:bg-forest/10">Reactivate</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </GlassCard>
        )
      )}

      <AlertPreferencesModal
        open={prefsOpen}
        onClose={() => setPrefsOpen(false)}
        onSaved={() => {
          if (tab !== 'rules') loadAlerts()
        }}
      />

      <Dialog
        open={!!editRuleId}
        onClose={() => setEditRuleId(null)}
        title={`Edit ${editRule?.name ?? 'Rule'}`}
        footer={
          <>
            <button type="button" onClick={() => setEditRuleId(null)} className="rounded-lg px-4 py-2 text-sm text-on-glass-muted hover:text-on-glass">Cancel</button>
            <button
              type="button"
              onClick={async () => {
                if (editRule) {
                  try {
                    await alertApi.updateRule(editRule.id, { threshold: editThreshold })
                    setRules((r) => r.map((x) => x.id === editRule.id ? { ...x, threshold: editThreshold } : x))
                    toast(`${editRule.name} threshold updated`, 'success')
                  } catch {
                    toast('Failed to update rule', 'error')
                  }
                }
                setEditRuleId(null)
              }}
              className="rounded-lg bg-copper px-4 py-2 text-sm text-white hover:bg-copper-light"
            >Save</button>
          </>
        }
      >
        {editRule && (
          <div className="space-y-4">
            <div>
              <label htmlFor="editRuleName" className="text-sm text-on-glass-muted">Rule Name</label>
              <input id="editRuleName" type="text" value={editRule.name} readOnly className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm opacity-80" />
            </div>
            <div>
              <label htmlFor="editRuleDescription" className="text-sm text-on-glass-muted">Description</label>
              <input id="editRuleDescription" type="text" value={editRule.description} readOnly className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm opacity-80" />
            </div>
            <div>
              <label htmlFor="editRuleThreshold" className="text-sm text-on-glass-muted">Threshold</label>
              <input id="editRuleThreshold" type="text" value={editThreshold} onChange={(e) => setEditThreshold(e.target.value)} className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="editRuleChannel" className="text-sm text-on-glass-muted">Notification Channel</label>
              <select id="editRuleChannel" value={editChannel} onChange={(e) => setEditChannel(e.target.value)} className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm">
                <option>In-app + Email</option>
                <option>In-app only</option>
                <option>Email only</option>
              </select>
            </div>
          </div>
        )}
      </Dialog>

      <DeactivateConfirmModal
        isOpen={!!deactivateRule}
        itemName={deactivateRule?.name ?? 'this rule'}
        onConfirm={async () => {
          if (deactivateRule) {
            try {
              await alertApi.updateRule(deactivateRule.id, { isActive: false })
              setRules((r) => r.map((x) => x.id === deactivateRule.id ? { ...x, isActive: false, enabled: false } : x))
              toast(`${deactivateRule.name} has been deactivated.`, 'success')
            } catch {
              toast('Failed to deactivate rule', 'error')
            }
          }
          setDeactivateRule(null)
        }}
        onCancel={() => setDeactivateRule(null)}
      />
    </div>
  )
}
