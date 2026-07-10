export interface ExportChartImage {
  title: string
  dataUrl: string
  width: number
  height: number
}

export interface ExportTable {
  title: string
  headers: string[]
  rows: (string | number)[][]
}

export interface ExportSection {
  heading: string
  lines?: string[]
  table?: ExportTable
}

export interface ExportData {
  title: string
  subtitle?: string
  sections: ExportSection[]
  charts?: ExportChartImage[]
}
