import type { SystemHealth } from '../types/api'
import type { AuditLog, User } from '../types'
import { api, unwrap } from './api'

export const adminApi = {
  async getUsers(): Promise<User[]> {
    const { data } = await api.get('/admin/users')
    return unwrap<User[]>({ data })
  },

  async createUser(payload: Record<string, unknown>): Promise<User> {
    const { data } = await api.post('/admin/users', payload)
    return unwrap<User>({ data })
  },

  async updateUser(id: string, payload: Record<string, unknown>): Promise<User> {
    const { data } = await api.put(`/admin/users/${id}`, payload)
    return unwrap<User>({ data })
  },

  /** Soft delete — sets isActive to false; historical data preserved */
  async deleteUser(id: string): Promise<void> {
    const { data } = await api.delete(`/admin/users/${id}`)
    unwrap({ data })
  },

  async deactivateUser(id: string): Promise<User> {
    return this.updateUser(id, { isActive: false })
  },

  async reactivateUser(id: string): Promise<User> {
    return this.updateUser(id, { isActive: true })
  },

  async getAuditLogs(): Promise<AuditLog[]> {
    const { data } = await api.get('/admin/audit-logs')
    return unwrap<AuditLog[]>({ data })
  },

  async getSystemHealth(): Promise<SystemHealth> {
    const { data } = await api.get('/admin/system-health')
    return unwrap<SystemHealth>({ data })
  },

  async triggerBackup(): Promise<Record<string, unknown>> {
    const { data } = await api.post('/admin/backup')
    return unwrap<Record<string, unknown>>({ data })
  },

  async getBackups(): Promise<Array<Record<string, unknown>>> {
    const { data } = await api.get('/admin/backups')
    return unwrap<Array<Record<string, unknown>>>({ data })
  },

  async restoreBackup(id: string): Promise<Record<string, unknown>> {
    const { data } = await api.post('/admin/restore', { backupId: id, confirm: true })
    return unwrap<Record<string, unknown>>({ data })
  },

  async getRolePermissions(): Promise<Record<string, string[]>> {
    const { data } = await api.get('/admin/roles/permissions')
    return unwrap<Record<string, string[]>>({ data })
  },

  async updateRolePermissions(role: string, permissions: string[]): Promise<Record<string, string[]>> {
    const { data } = await api.put(`/admin/roles/${role}/permissions`, { permissions })
    return unwrap<Record<string, string[]>>({ data })
  },
}
