import { api, unwrap } from './api'

export interface StrategicGoal {
  id: string
  goal: string
  progress: number
  deadline: string
  owner: string
}

export interface GrowthOpportunity {
  id: string
  name: string
  impact: string
  confidence: number
  estimatedValue: number
}

export interface BudgetAllocation {
  id: string
  category: string
  allocated: number
  spent: number
  remaining: number
}

export interface RoiInvestment {
  id: string
  initiative: string
  invested: number
  roi: number
  status: string
}

export const planningApi = {
  async getGoals(): Promise<StrategicGoal[]> {
    const { data } = await api.get('/planning/goals')
    const goals = unwrap<Array<Record<string, unknown>>>({ data })
    return goals.map((g) => ({
      id: String(g.id ?? ''),
      goal: String(g.goal ?? ''),
      progress: Number(g.progress ?? 0),
      deadline: String(g.deadline ?? ''),
      owner: String(g.owner ?? ''),
    }))
  },

  async getOpportunities(): Promise<GrowthOpportunity[]> {
    const { data } = await api.get('/planning/opportunities')
    const items = unwrap<Array<Record<string, unknown>>>({ data })
    return items.map((o) => ({
      id: String(o.id ?? ''),
      name: String(o.name ?? ''),
      impact: String(o.impact ?? ''),
      confidence: Number(o.confidence ?? 0),
      estimatedValue: Number(o.estimatedValue ?? 0),
    }))
  },

  async getBudget(): Promise<BudgetAllocation[]> {
    const { data } = await api.get('/planning/budget')
    const items = unwrap<Array<Record<string, unknown>>>({ data })
    return items.map((b) => ({
      id: String(b.id ?? ''),
      category: String(b.category ?? ''),
      allocated: Number(b.allocated ?? 0),
      spent: Number(b.spent ?? 0),
      remaining: Number(b.remaining ?? 0),
    }))
  },

  async getRoi(): Promise<RoiInvestment[]> {
    const { data } = await api.get('/planning/roi')
    const items = unwrap<Array<Record<string, unknown>>>({ data })
    return items.map((r) => ({
      id: String(r.id ?? ''),
      initiative: String(r.initiative ?? ''),
      invested: Number(r.invested ?? 0),
      roi: Number(r.roi ?? 0),
      status: String(r.status ?? ''),
    }))
  },
}
