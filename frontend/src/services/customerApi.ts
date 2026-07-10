import type { ChartPoint, CustomerSummary } from '../types/api'
import type { Customer } from '../types'
import { api, unwrap } from './api'

export const customerApi = {
  async getSummary(): Promise<CustomerSummary> {
    const { data } = await api.get('/customers/summary')
    return unwrap<CustomerSummary>({ data })
  },

  async getSegments(): Promise<ChartPoint[]> {
    const { data } = await api.get('/customers/segments')
    return unwrap<ChartPoint[]>({ data })
  },

  async getTop(limit = 20): Promise<Customer[]> {
    const { data } = await api.get('/customers/top', { params: { limit } })
    return unwrap<Customer[]>({ data })
  },

  async getChurnRisks(): Promise<Customer[]> {
    const { data } = await api.get('/customers/churn-risks')
    return unwrap<Customer[]>({ data })
  },

  async getById(id: string): Promise<Customer> {
    const { data } = await api.get(`/customers/${id}`)
    return unwrap<Customer>({ data })
  },

  async create(payload: { customerName: string; customerType: string; phone?: string; email?: string }): Promise<Customer> {
    const { data } = await api.post('/customers', payload)
    return unwrap<Customer>({ data })
  },

  async update(id: string, payload: { customerName: string; customerType: string; phone?: string; email?: string }): Promise<Customer> {
    const { data } = await api.put(`/customers/${id}`, payload)
    return unwrap<Customer>({ data })
  },

  async deactivate(id: string): Promise<Customer> {
    const { data } = await api.delete(`/customers/${id}`)
    return unwrap<Customer>({ data })
  },

  async reactivate(id: string): Promise<Customer> {
    const { data } = await api.put(`/customers/${id}/reactivate`)
    return unwrap<Customer>({ data })
  },

  async getAll(limit = 100): Promise<Customer[]> {
    return this.getTop(limit)
  },

  async getFrequency(): Promise<ChartPoint[]> {
    const { data } = await api.get('/customers/frequency')
    const rows = unwrap<Array<Record<string, unknown>>>({ data })
    return rows.map((row) => ({
      name: String(row.name ?? ''),
      value: Number(row.count ?? row.value ?? 0),
    }))
  },

  async getLtvTrend(): Promise<Array<{ name: string; ltv: number }>> {
    const { data } = await api.get('/customers/ltv-trend')
    const rows = unwrap<Array<Record<string, unknown>>>({ data })
    return rows.map((row) => ({
      name: String(row.name ?? row.month ?? ''),
      ltv: Number(row.ltv ?? row.value ?? 0),
    }))
  },
}
