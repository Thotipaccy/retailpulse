export interface CustomerRecord {
  id: string
  name: string
  phone: string
  email: string
  type: 'retail' | 'wholesale' | 'contractor'
  lifetimeValue: number
  rfmSegment: string
  churnRisk: number
  isActive: boolean
  notes?: string
}
