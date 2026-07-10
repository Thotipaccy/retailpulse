export interface RwandaSeason {
  id: string
  name: string
  english: string
  months: number[]
  products: string[]
  lift: string
  tint: 'forest' | 'ochre' | 'copper' | 'steel'
  priority: boolean
}

export const RWANDA_SEASONS: RwandaSeason[] = [
  {
    id: 'spring',
    name: 'Spring',
    english: 'Mar–May',
    months: [2, 3, 4],
    products: ['Gardening Tools', 'Exterior Paint', 'Lawn Care', 'Seeds & Fertilizer'],
    lift: '+28%',
    tint: 'forest',
    priority: false,
  },
  {
    id: 'summer',
    name: 'Summer',
    english: 'Jun–Aug',
    months: [5, 6, 7],
    products: ['Cement', 'Iron Sheets', 'Construction Tools', 'Rebar'],
    lift: '+35%',
    tint: 'ochre',
    priority: false,
  },
  {
    id: 'autumn',
    name: 'Autumn',
    english: 'Sep–Nov',
    months: [8, 9, 10],
    products: ['Plumbing', 'Waterproofing', 'Rain Gutters', 'Drainage'],
    lift: '+22%',
    tint: 'copper',
    priority: false,
  },
  {
    id: 'winter',
    name: 'Winter',
    english: 'Dec–Feb',
    months: [11, 0, 1],
    products: ['Indoor Renovation', 'Electrical Supplies', 'Interior Paint', 'Lighting'],
    lift: '+18%',
    tint: 'steel',
    priority: false,
  },
]

export function getSeasonsWithPriority(): RwandaSeason[] {
  const month = new Date().getMonth()
  return RWANDA_SEASONS.map((s) => ({
    ...s,
    priority: s.months.includes(month),
  })).sort((a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0))
}
