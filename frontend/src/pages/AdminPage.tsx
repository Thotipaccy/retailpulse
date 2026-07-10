import { useCallback, useEffect, useMemo, useState } from 'react'
import { Database, Edit2, HardDrive, Server, Shield, Trash2, Users } from 'lucide-react'
import { adminApi } from '../services/adminApi'
import { getErrorMessage } from '../services/api'
import { formatDateTime } from '../utils/format'
import { ModulePageHeader } from '../components/ui/ModulePageHeader'
import { TintedKPICard } from '../components/ui/TintedKPICard'
import { GlassCard } from '../components/ui/GlassCard'
import { TabNav } from '../components/ui/TabNav'
import { PulseDot } from '../components/ui/PulseDot'
import { StatusBadge } from '../components/ui/StatusBadge'
import { DeactivateConfirmModal } from '../components/ui/DeactivateConfirmModal'
import { UserManagementModal } from '../components/modals/UserManagementModal'
import { ConfirmModal, EmptyState, ErrorState, LoadingSkeleton } from '../components/ui/PageHeader'
import { TablePagination, TABLE_PAGE_SIZE } from '../components/ui/TablePagination'
import { useToast } from '../contexts/ToastContext'
import type { AuditLog, User } from '../types'
import type { SystemHealth } from '../types/api'

type AdminTab = 'users' | 'roles' | 'health' | 'audit' | 'backup'

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'users', label: 'User Management' },
  { id: 'roles', label: 'Roles & Permissions' },
  { id: 'health', label: 'System Health' },
  { id: 'audit', label: 'Audit Logs' },
  { id: 'backup', label: 'Backup & Restore' },
]

const PERMISSION_LABELS: Record<string, string> = {
  view_dashboard: 'View Dashboard',
  manage_products: 'Manage Products',
  manage_users: 'Manage Users',
  view_analytics: 'View Analytics',
  export_reports: 'Export Reports',
  manage_system: 'Manage System',
}

export function AdminPage() {
  const { toast } = useToast()
  const [tab, setTab] = useState<AdminTab>('users')
  const [users, setUsers] = useState<User[]>([])
  const [logs, setLogs] = useState<(AuditLog & { ipAddress?: string })[]>([])
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null)
  const [activateTarget, setActivateTarget] = useState<User | null>(null)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [createUserOpen, setCreateUserOpen] = useState(false)
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({})
  const [backups, setBackups] = useState<Array<Record<string, unknown>>>([])
  const [backupLoading, setBackupLoading] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null)
  const [auditPage, setAuditPage] = useState(0)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.allSettled([adminApi.getUsers(), adminApi.getAuditLogs(), adminApi.getSystemHealth(), adminApi.getBackups(), adminApi.getRolePermissions()])
      .then(([usersResult, logsResult, healthResult, backupsResult, rolesResult]) => {
        if (usersResult.status === 'fulfilled') setUsers(usersResult.value)
        if (logsResult.status === 'fulfilled') setLogs(logsResult.value)
        if (healthResult.status === 'fulfilled') setHealth(healthResult.value)
        if (backupsResult.status === 'fulfilled') setBackups(backupsResult.value)
        if (rolesResult.status === 'fulfilled') setRolePermissions(rolesResult.value)
        const allFailed = [usersResult, logsResult, healthResult].every((r) => r.status === 'rejected')
        if (allFailed) setError(getErrorMessage((usersResult as PromiseRejectedResult).reason))
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => load(), 0)
    return () => clearTimeout(timer)
  }, [load])

  const roles = useMemo(() => {
    const byRole = new Map<string, number>()
    for (const user of users) {
      byRole.set(user.role, (byRole.get(user.role) ?? 0) + 1)
    }
    return Array.from(byRole.entries()).map(([role, count]) => ({
      name: role,
      users: count,
      permissions: rolePermissions[role] ?? [],
      color: role === 'administrator' ? 'copper' as const : role === 'manager' ? 'steel' as const : role === 'analyst' ? 'forest' as const : 'amber' as const,
    }))
  }, [users, rolePermissions])

  const togglePermission = async (role: string, permission: string) => {
    const current = rolePermissions[role] ?? []
    const next = current.includes(permission)
      ? current.filter((p) => p !== permission)
      : [...current, permission]
    try {
      await adminApi.updateRolePermissions(role, next)
      setRolePermissions((prev) => ({ ...prev, [role]: next }))
      toast('Role permissions updated', 'success')
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    }
  }

  const handleDeactivateUser = async () => {
    if (!deactivateTarget) return
    try {
      await adminApi.deactivateUser(deactivateTarget.userId)
      setUsers((prev) => prev.map((u) => u.userId === deactivateTarget.userId ? { ...u, isActive: false } : u))
      toast(`${deactivateTarget.fullName} has been deactivated.`, 'success')
    } catch {
      toast('Failed to deactivate user', 'error')
    }
    setDeactivateTarget(null)
  }

  const handleReactivateUser = async (user: User) => {
    try {
      await adminApi.reactivateUser(user.userId)
      setUsers((prev) => prev.map((u) => u.userId === user.userId ? { ...u, isActive: true } : u))
      toast(`${user.fullName} reactivated`, 'success')
    } catch {
      toast('Failed to reactivate user', 'error')
    }
  }

  const handleTriggerBackup = async () => {
    setBackupLoading(true)
    try {
      const result = await adminApi.triggerBackup()
      const list = await adminApi.getBackups()
      setBackups(list)
      const method = String(result.method ?? 'jdbc')
      toast(
        method === 'pg_dump'
          ? 'Full PostgreSQL backup created'
          : 'Logical data backup created (JDBC export)',
        'success',
      )
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setBackupLoading(false)
    }
  }

  const handleRestoreBackup = async () => {
    if (!restoreTarget) return
    setBackupLoading(true)
    try {
      const result = await adminApi.restoreBackup(restoreTarget)
      const message = typeof result.message === 'string'
        ? result.message
        : 'Backup merge restore completed.'
      toast(message, 'success')
      load()
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setBackupLoading(false)
      setRestoreTarget(null)
    }
  }

  if (loading) return <LoadingSkeleton rows={6} />
  if (error) return <ErrorState message={error} onRetry={load} />

  const statusCards = [
    { label: 'System Status', value: health?.status ?? '—', tint: 'green' as const, icon: Server },
    { label: 'Active Users', value: health?.activeUsers != null ? String(health.activeUsers) : '—', tint: 'copper' as const, icon: Users },
    { label: 'Database', value: health?.database ?? '—', tint: 'steel' as const, icon: Database },
    { label: 'Uptime', value: health?.uptime ?? '—', tint: 'amber' as const, icon: HardDrive },
  ]

  return (
    <div className="pb-20">
      <ModulePageHeader icon={Shield} title="System Administration" subtitle="Manage users, roles, system health, and data backups" />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statusCards.map((card) => {
          const Icon = card.icon
          return (
            <TintedKPICard key={card.label} label={card.label} value={card.value} tint={card.tint} trend={<Icon className="mt-1 h-4 w-4 text-on-glass-muted" />} />
          )
        })}
      </div>

      <TabNav tabs={TABS} active={tab} onChange={(id) => setTab(id as AdminTab)} />

      {tab === 'users' && (
        <>
          <div className="mb-4 flex justify-end">
            <button type="button" onClick={() => setCreateUserOpen(true)} className="rounded-lg bg-copper px-4 py-2 text-sm font-medium text-white hover:bg-copper-light">
              Add User
            </button>
          </div>
        {users.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title="No users" description="User data is not available from the backend." />
        ) : (
          <GlassCard className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-on-glass-muted">
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Last Login</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.userId} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-4 py-3 font-medium text-on-glass">{user.fullName}</td>
                      <td className="px-4 py-3 text-on-glass-muted">{user.email}</td>
                      <td className="px-4 py-3 capitalize text-on-glass">{user.role}</td>
                      <td className="px-4 py-3">
                        <StatusBadge variant={user.isActive ? 'success' : 'danger'}>{user.isActive ? 'Active' : 'Inactive'}</StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-on-glass-muted">{user.lastLogin ? formatDateTime(user.lastLogin) : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setEditUser(user)} className="inline-flex items-center gap-1 rounded-lg glass-subtle px-2.5 py-1.5 text-xs text-on-glass hover:glass">
                            <Edit2 className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          {user.isActive ? (
                            <button type="button" onClick={() => setDeactivateTarget(user)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-rust-light hover:bg-rust/10">
                              <Trash2 className="h-3.5 w-3.5" />
                              Deactivate
                            </button>
                          ) : (
                            <button type="button" onClick={() => setActivateTarget(user)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-forest-light hover:bg-forest/10">Activate</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        )}
        </>
      )}

      {tab === 'roles' && (
        roles.length === 0 ? (
          <EmptyState icon={<Shield className="h-6 w-6" />} title="No roles" description="Role data is derived from users — no users found." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {roles.map((role) => (
              <GlassCard key={role.name} className="p-5">
                <p className="text-lg font-semibold capitalize text-on-glass">{role.name}</p>
                <p className="text-sm text-on-glass-muted">{role.users} users</p>
                <ul className="mt-4 space-y-2">
                  {Object.keys(PERMISSION_LABELS).map((perm) => (
                    <li key={perm}>
                      <label className="flex items-center gap-2 text-sm text-on-glass">
                        <input
                          type="checkbox"
                          checked={role.permissions.includes(perm)}
                          onChange={() => void togglePermission(role.name, perm)}
                          className="accent-copper"
                        />
                        {PERMISSION_LABELS[perm]}
                      </label>
                    </li>
                  ))}
                </ul>
              </GlassCard>
            ))}
          </div>
        )
      )}

      {tab === 'health' && (
        health ? (
          <GlassCard className="divide-y divide-white/10 p-5">
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <PulseDot variant={health.status?.toLowerCase() === 'healthy' ? 'success' : 'warning'} />
                <div>
                  <p className="font-medium text-on-glass">System</p>
                  <p className="text-xs text-on-glass-muted">API {health.apiVersion ?? '—'}</p>
                </div>
              </div>
              <StatusBadge variant={health.status?.toLowerCase() === 'healthy' ? 'success' : 'warning'}>{health.status}</StatusBadge>
            </div>
            <div className="flex items-center justify-between py-2">
              <p className="text-on-glass-muted">Database</p>
              <StatusBadge variant="success">{health.database}</StatusBadge>
            </div>
            <div className="flex items-center justify-between py-2">
              <p className="text-on-glass-muted">Uptime</p>
              <span className="text-on-glass">{health.uptime}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <p className="text-on-glass-muted">Active Users</p>
              <span className="text-on-glass">{health.activeUsers}</span>
            </div>
            {health.lastBackup && (
              <div className="flex items-center justify-between py-2">
                <p className="text-on-glass-muted">Last Backup</p>
                <span className="text-on-glass">{health.lastBackup}</span>
              </div>
            )}
          </GlassCard>
        ) : (
          <EmptyState icon={<Server className="h-6 w-6" />} title="No health data" description="System health data is not available." />
        )
      )}

      {tab === 'audit' && (
        logs.length === 0 ? (
          <EmptyState icon={<Shield className="h-6 w-6" />} title="No audit logs" description="Audit log data is not available." />
        ) : (
          <GlassCard className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-on-glass-muted">
                    <th className="px-4 py-3 font-medium">Timestamp</th>
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium">IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.slice(auditPage * TABLE_PAGE_SIZE, (auditPage + 1) * TABLE_PAGE_SIZE).map((log) => (
                    <tr key={log.logId} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-4 py-3 text-on-glass-muted">{formatDateTime(log.createdAt)}</td>
                      <td className="px-4 py-3 text-on-glass">{log.userName}</td>
                      <td className="px-4 py-3"><StatusBadge variant="info">{log.actionType}</StatusBadge></td>
                      <td className="px-4 py-3 text-on-glass-muted">{log.description}</td>
                      <td className="px-4 py-3 font-mono text-xs text-copper-light">{log.ipAddress ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination page={auditPage} totalItems={logs.length} onPageChange={setAuditPage} />
          </GlassCard>
        )
      )}

      {tab === 'backup' && (
        <div className="space-y-4">
          <GlassCard className="border border-copper/20 bg-copper/5 px-4 py-3 text-sm text-on-glass-muted">
            <strong className="text-on-glass">Backup</strong> saves the current database state to a recoverable file.
            <strong className="text-on-glass"> Delete after backup</strong> — data can still be recovered from the backup.
            <strong className="text-on-glass"> Delete before backup</strong> — that data is permanently gone.
          </GlassCard>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={backupLoading}
              onClick={() => void handleTriggerBackup()}
              className="rounded-lg bg-copper px-4 py-2 text-sm font-medium text-white hover:bg-copper-light disabled:opacity-50"
            >
              {backupLoading ? 'Processing...' : 'Create Backup'}
            </button>
          </div>
          {backups.length === 0 ? (
            <EmptyState icon={<HardDrive className="h-6 w-6" />} title="No backups" description="No backups have been created yet." />
          ) : (
            <GlassCard className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-on-glass-muted">
                      <th className="px-4 py-3 font-medium">File</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Size</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Created</th>
                      <th className="px-4 py-3 font-medium">Created By</th>
                      <th className="px-4 py-3 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backups.map((backup) => (
                      <tr key={String(backup.id)} className="border-b border-white/5 hover:bg-white/5">
                        <td className="px-4 py-3 font-mono text-xs text-on-glass">{String(backup.fileName ?? '')}</td>
                        <td className="px-4 py-3 text-xs uppercase text-on-glass-muted">{String(backup.method ?? 'jdbc')}</td>
                        <td className="px-4 py-3 text-on-glass-muted">{String(backup.sizeMb ?? '—')} MB</td>
                        <td className="px-4 py-3"><StatusBadge variant="success">{String(backup.status ?? '')}</StatusBadge></td>
                        <td className="px-4 py-3 text-on-glass-muted">{backup.createdAt ? formatDateTime(String(backup.createdAt)) : '—'}</td>
                        <td className="px-4 py-3 text-on-glass">{String(backup.createdBy ?? '—')}</td>
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => setRestoreTarget(String(backup.id))} className="text-xs text-copper-light hover:underline">
                            Merge restore
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}
        </div>
      )}

      <UserManagementModal
        open={!!editUser || createUserOpen}
        onClose={() => { setEditUser(null); setCreateUserOpen(false) }}
        existingUser={editUser}
        onSave={async (data) => {
          if (editUser) {
            try {
              const updated = await adminApi.updateUser(editUser.userId, data)
              setUsers((prev) => prev.map((u) => u.userId === editUser.userId ? { ...u, ...updated } : u))
              toast(`${data.fullName} updated`, 'success')
            } catch (err) {
              toast(getErrorMessage(err), 'error')
            }
          } else {
            try {
              const created = await adminApi.createUser(data) as User & {
                temporaryPassword?: string
                welcomeEmailSent?: boolean
              }
              setUsers((prev) => [...prev, created])
              if (created.welcomeEmailSent !== false) {
                toast(`User created — welcome email sent to ${data.email}`, 'success')
              } else {
                toast(
                  `User created. Email could not be sent (daily limit). Temporary password: ${created.temporaryPassword ?? '—'}`,
                  'info',
                )
              }
            } catch (err) {
              toast(getErrorMessage(err), 'error')
            }
          }
        }}
      />

      <ConfirmModal
        isOpen={!!restoreTarget}
        title="Merge restore"
        message="Adds missing records from the backup. Your current data is kept — existing records are not deleted or overwritten."
        confirmLabel={backupLoading ? 'Restoring...' : 'Merge restore'}
        variant="default"
        onConfirm={() => void handleRestoreBackup()}
        onCancel={() => setRestoreTarget(null)}
      />

      <ConfirmModal
        isOpen={!!activateTarget}
        title="Activate user"
        message={`Reactivate ${activateTarget?.fullName ?? 'this user'}? They will regain access to the system.`}
        confirmLabel="Activate"
        variant="default"
        onConfirm={() => { if (activateTarget) void handleReactivateUser(activateTarget); setActivateTarget(null) }}
        onCancel={() => setActivateTarget(null)}
      />

      <DeactivateConfirmModal
        isOpen={!!deactivateTarget}
        itemName={deactivateTarget?.fullName ?? 'this user'}
        onConfirm={() => void handleDeactivateUser()}
        onCancel={() => setDeactivateTarget(null)}
      />
    </div>
  )
}
