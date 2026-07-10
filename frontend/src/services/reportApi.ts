import type { ReportTemplate } from '../types/api'
import type { Report } from '../types'
import { api, unwrap } from './api'

export const reportApi = {
  async getTemplates(): Promise<ReportTemplate[]> {
    const { data } = await api.get('/reports/templates')
    return unwrap<ReportTemplate[]>({ data })
  },

  async generate(params: Record<string, string>): Promise<Report> {
    const { data } = await api.post('/reports/generate', params)
    return unwrap<Report>({ data })
  },

  async getHistory(): Promise<Report[]> {
    const { data } = await api.get('/reports/history')
    return unwrap<Report[]>({ data })
  },

  async download(id: string): Promise<Record<string, unknown>> {
    const { data } = await api.get(`/reports/download/${id}`)
    return unwrap<Record<string, unknown>>({ data })
  },

  async getScheduled(): Promise<Array<Record<string, unknown>>> {
    const { data } = await api.get('/reports/scheduled')
    return unwrap<Array<Record<string, unknown>>>({ data })
  },

  async createSchedule(params: Record<string, string>): Promise<Record<string, unknown>> {
    const { data } = await api.post('/reports/schedule', params)
    return unwrap<Record<string, unknown>>({ data })
  },

  async updateSchedule(id: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    const { data } = await api.put(`/reports/schedule/${id}`, params)
    return unwrap<Record<string, unknown>>({ data })
  },

  async deleteSchedule(id: string): Promise<void> {
    await api.delete(`/reports/schedule/${id}`)
  },

  async downloadFile(id: string): Promise<void> {
    const response = await api.get(`/reports/download/${id}/file`, {
      responseType: 'blob',
    })

    const contentDisposition = response.headers['content-disposition']
    let filename = `report-${id}.csv`
    if (contentDisposition && contentDisposition.includes('attachment')) {
      const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition)
      if (matches != null && matches[1]) {
        filename = matches[1].replace(/['"]/g, '')
      }
    }

    const blob = new Blob([response.data as BlobPart])
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()

    window.URL.revokeObjectURL(url)
    document.body.removeChild(link)
  },
}
