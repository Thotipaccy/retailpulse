import { useCallback, useEffect, useState } from 'react'
import { Dialog } from '../ui/Dialog'
import { Switch } from '../ui/Switch'
import { useToast } from '../../contexts/ToastContext'
import { alertApi } from '../../services/alertApi'
import { getErrorMessage } from '../../services/api'
import {
  DEFAULT_ALERT_PREFERENCES,
  DND_DAYS,
  WEEK_DAYS,
  type AlertPreferencesData,
} from '../../types/alerts'

interface AlertPreferencesModalProps {
  open: boolean
  onClose: () => void
  onSaved?: () => void
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <p className="text-sm font-medium text-on-glass">{label}</p>
        {description && <p className="text-xs text-on-glass-muted">{description}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  )
}

export function AlertPreferencesModal({ open, onClose, onSaved }: AlertPreferencesModalProps) {
  const { toast } = useToast()
  const [prefs, setPrefs] = useState<AlertPreferencesData>(DEFAULT_ALERT_PREFERENCES)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadPreferences = useCallback(async () => {
    setLoading(true)
    try {
      const data = await alertApi.getPreferences()
      setPrefs(data)
    } catch {
      const cached = alertApi.getCachedPreferences()
      setPrefs(cached ?? DEFAULT_ALERT_PREFERENCES)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      void loadPreferences()
    }
  }, [open, loadPreferences])

  const toggleDndDay = (day: string) => {
    setPrefs((p) => {
      const days = p.doNotDisturb.days.includes(day)
        ? p.doNotDisturb.days.filter((d) => d !== day)
        : [...p.doNotDisturb.days, day]
      return { ...p, doNotDisturb: { ...p.doNotDisturb, days } }
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await alertApi.savePreferences(prefs)
      toast('Preferences saved', 'success')
      onSaved?.()
      onClose()
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setSaving(true)
    try {
      const reset = await alertApi.resetPreferences()
      setPrefs(reset)
      toast('Preferences reset to defaults', 'info')
    } catch (err) {
      setPrefs(DEFAULT_ALERT_PREFERENCES)
      toast(getErrorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Alert Preferences"
      maxWidth="max-w-2xl"
      footer={(
        <>
          <button
            type="button"
            onClick={() => void handleReset()}
            disabled={saving || loading}
            className="mr-auto text-sm text-copper-light hover:underline disabled:opacity-50"
          >
            Reset to Defaults
          </button>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-on-glass-muted hover:text-on-glass">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || loading}
            className="rounded-lg bg-copper px-4 py-2 text-sm font-medium text-white hover:bg-copper-light disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </>
      )}
    >
      {loading ? (
        <p className="py-8 text-center text-sm text-on-glass-muted">Loading preferences...</p>
      ) : (
        <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1">
          <section>
            <h3 className="text-sm font-semibold text-on-glass">Notification Channels</h3>
            <p className="mb-3 text-xs text-on-glass-muted">Choose how you receive alerts</p>
            <ToggleRow
              label="In-App Notifications"
              description="Receive alerts within the dashboard"
              checked={prefs.channels.inApp}
              onChange={(v) => setPrefs((p) => ({ ...p, channels: { ...p.channels, inApp: v } }))}
            />
            <ToggleRow
              label="Email Notifications"
              description="Receive alerts at your email address"
              checked={prefs.channels.email}
              onChange={(v) => setPrefs((p) => ({ ...p, channels: { ...p.channels, email: v } }))}
            />
            <ToggleRow
              label="SMS Notifications"
              description="Receive alerts via text message"
              checked={prefs.channels.sms}
              onChange={(v) => setPrefs((p) => ({ ...p, channels: { ...p.channels, sms: v } }))}
            />
          </section>

          <section className="border-t border-white/10 pt-4">
            <ToggleRow
              label="Play sound for critical alerts"
              checked={prefs.soundEnabled}
              onChange={(v) => setPrefs((p) => ({ ...p, soundEnabled: v }))}
            />
          </section>

          <section className="border-t border-white/10 pt-4">
            <h3 className="text-sm font-semibold text-on-glass">Do Not Disturb</h3>
            <p className="mb-3 text-xs text-on-glass-muted">Mute all notifications during these hours</p>
            <ToggleRow
              label="Enable DND"
              checked={prefs.doNotDisturb.enabled}
              onChange={(v) => setPrefs((p) => ({ ...p, doNotDisturb: { ...p.doNotDisturb, enabled: v } }))}
            />
            {prefs.doNotDisturb.enabled && (
              <div className="mt-3 space-y-3 rounded-lg glass-subtle p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-on-glass-muted">Start Time</label>
                    <input
                      type="time"
                      value={prefs.doNotDisturb.startTime}
                      onChange={(e) => setPrefs((p) => ({
                        ...p,
                        doNotDisturb: { ...p.doNotDisturb, startTime: e.target.value },
                      }))}
                      className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-on-glass-muted">End Time</label>
                    <input
                      type="time"
                      value={prefs.doNotDisturb.endTime}
                      onChange={(e) => setPrefs((p) => ({
                        ...p,
                        doNotDisturb: { ...p.doNotDisturb, endTime: e.target.value },
                      }))}
                      className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs text-on-glass-muted">Days</p>
                  <div className="flex flex-wrap gap-2">
                    {DND_DAYS.map((day) => (
                      <label key={day} className="inline-flex items-center gap-1.5 text-xs text-on-glass">
                        <input
                          type="checkbox"
                          checked={prefs.doNotDisturb.days.includes(day)}
                          onChange={() => toggleDndDay(day)}
                          className="rounded border-white/20"
                        />
                        {day}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="border-t border-white/10 pt-4">
            <h3 className="text-sm font-semibold text-on-glass">Notification Digest</h3>
            <p className="mb-3 text-xs text-on-glass-muted">How often to receive summary notifications</p>
            <select
              value={prefs.digest.frequency}
              onChange={(e) => setPrefs((p) => ({
                ...p,
                digest: { ...p.digest, frequency: e.target.value as AlertPreferencesData['digest']['frequency'] },
              }))}
              className="glass-input w-full rounded-lg px-3 py-2 text-sm"
            >
              <option value="instant">Instant — every alert sent immediately</option>
              <option value="hourly">Hourly — batched every hour</option>
              <option value="daily">Daily — daily summary at configured time</option>
              <option value="weekly">Weekly — weekly summary on configured day</option>
            </select>
            {(prefs.digest.frequency === 'daily' || prefs.digest.frequency === 'weekly') && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {prefs.digest.frequency === 'weekly' && (
                  <div>
                    <label className="text-xs text-on-glass-muted">Delivery Day</label>
                    <select
                      value={prefs.digest.day}
                      onChange={(e) => setPrefs((p) => ({ ...p, digest: { ...p.digest, day: e.target.value } }))}
                      className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                    >
                      {WEEK_DAYS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="text-xs text-on-glass-muted">Delivery Time</label>
                  <input
                    type="time"
                    value={prefs.digest.time}
                    onChange={(e) => setPrefs((p) => ({ ...p, digest: { ...p.digest, time: e.target.value } }))}
                    className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}
          </section>

          <section className="border-t border-white/10 pt-4">
            <h3 className="text-sm font-semibold text-on-glass">Alert Types</h3>
            <p className="mb-3 text-xs text-on-glass-muted">Choose which alert categories you receive</p>
            <ToggleRow
              label="Inventory Alerts"
              description="Low stock, stockout risks, overstock"
              checked={prefs.alertTypes.inventory}
              onChange={(v) => setPrefs((p) => ({ ...p, alertTypes: { ...p.alertTypes, inventory: v } }))}
            />
            <ToggleRow
              label="Sales Alerts"
              description="Target achieved, target at risk, unusual patterns"
              checked={prefs.alertTypes.sales}
              onChange={(v) => setPrefs((p) => ({ ...p, alertTypes: { ...p.alertTypes, sales: v } }))}
            />
            <ToggleRow
              label="Customer Alerts"
              description="Churn risks, new VIP customers, customer inactivity"
              checked={prefs.alertTypes.customer}
              onChange={(v) => setPrefs((p) => ({ ...p, alertTypes: { ...p.alertTypes, customer: v } }))}
            />
            <ToggleRow
              label="System Alerts"
              description="Backup failures, sync errors, AI accuracy drops"
              checked={prefs.alertTypes.system}
              onChange={(v) => setPrefs((p) => ({ ...p, alertTypes: { ...p.alertTypes, system: v } }))}
            />
            <ToggleRow
              label="Security Alerts"
              description="Failed logins, password changes, user deactivations"
              checked={prefs.alertTypes.security}
              onChange={(v) => setPrefs((p) => ({ ...p, alertTypes: { ...p.alertTypes, security: v } }))}
            />
          </section>

          <section className="border-t border-white/10 pt-4">
            <h3 className="text-sm font-semibold text-on-glass">Thresholds</h3>
            <p className="mb-3 text-xs text-on-glass-muted">Per-alert-type sensitivity settings</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-on-glass-muted">Low stock (units)</label>
                <input
                  type="number"
                  min={1}
                  value={prefs.thresholds.lowStock}
                  onChange={(e) => setPrefs((p) => ({
                    ...p,
                    thresholds: { ...p.thresholds, lowStock: Number(e.target.value) },
                  }))}
                  className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-on-glass-muted">Sales target deviation (%)</label>
                <input
                  type="number"
                  min={1}
                  value={prefs.thresholds.targetDeviation}
                  onChange={(e) => setPrefs((p) => ({
                    ...p,
                    thresholds: { ...p.thresholds, targetDeviation: Number(e.target.value) },
                  }))}
                  className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-on-glass-muted">Churn risk threshold</label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={prefs.thresholds.churnRisk}
                  onChange={(e) => setPrefs((p) => ({
                    ...p,
                    thresholds: { ...p.thresholds, churnRisk: Number(e.target.value) },
                  }))}
                  className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-on-glass-muted">AI accuracy minimum (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={prefs.thresholds.aiAccuracy}
                  onChange={(e) => setPrefs((p) => ({
                    ...p,
                    thresholds: { ...p.thresholds, aiAccuracy: Number(e.target.value) },
                  }))}
                  className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
          </section>
        </div>
      )}
    </Dialog>
  )
}
