import { jsPDF } from 'jspdf'
import * as XLSX from 'xlsx'
import type { ExportData } from '../types/export'

export type ExportFormat = 'pdf' | 'excel' | 'csv' | 'png'

export interface ExportPayload {
  title: string
  fileName: string
  format: ExportFormat
  options: Record<string, boolean>
  data: ExportData
}

export function exportTimestamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}`
}

export function createPdfBlob(data: ExportData): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const margin = 12
  const pageHeight = doc.internal.pageSize.getHeight()
  const pageWidth = doc.internal.pageSize.getWidth()
  const maxWidth = pageWidth - margin * 2
  let y = margin

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage()
      y = margin
    }
  }

  const writeln = (text: string, fontSize = 10, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(fontSize)
    const lines = doc.splitTextToSize(text, maxWidth) as string[]
    for (const line of lines) {
      ensureSpace(fontSize * 0.5)
      doc.text(line, margin, y)
      y += fontSize * 0.45
    }
  }

  writeln(data.title, 16, true)
  if (data.subtitle) writeln(data.subtitle, 10)
  writeln(`Generated: ${new Date().toLocaleString()}`, 9)
  writeln('RetailPulse - Quincaillerie du Rwamagana', 9)
  y += 3

  for (const section of data.sections) {
    ensureSpace(10)
    writeln(section.heading, 11, true)
    section.lines?.forEach((line) => writeln(line, 9))
    if (section.table) {
      writeln(section.table.headers.join(' | '), 8, true)
      for (const row of section.table.rows) {
        writeln(row.map(String).join(' | '), 8)
      }
    }
    y += 3
  }

  if (data.charts?.length) {
    writeln('Chart Visualizations', 11, true)
    y += 2
    for (const chart of data.charts) {
      const displayWidth = maxWidth
      const displayHeight = Math.min((chart.height / chart.width) * displayWidth, 95)
      ensureSpace(displayHeight + 14)
      writeln(chart.title, 10, true)
      y += 1
      doc.addImage(chart.dataUrl, 'PNG', margin, y, displayWidth, displayHeight)
      y += displayHeight + 8
    }
  }

  if (!data.sections.length && !data.charts?.length) {
    writeln('No data sections were available for this export.', 10)
  }

  // Page footer with page numbers
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(140)
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: 'right' })
    doc.text('RetailPulse', margin, pageHeight - 6)
  }

  return doc.output('blob')
}

function createCsvBlob(data: ExportData): Blob {
  const rows: string[][] = [
    ['Report', data.title],
    ['Generated At', new Date().toISOString()],
    [],
  ]

  for (const section of data.sections) {
    rows.push([`Section: ${section.heading}`])
    if (section.lines?.length) {
      for (const line of section.lines) rows.push([line])
    }
    if (section.table) {
      rows.push(section.table.headers)
      rows.push(...section.table.rows.map((row) => row.map(String)))
    }
    rows.push([])
  }

  if (data.charts?.length) {
    rows.push(['Chart Images'])
    for (const chart of data.charts) {
      rows.push([chart.title, 'Embedded in PDF/PNG exports'])
    }
  }

  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  return new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' })
}

/** Real multi-sheet .xlsx workbook via SheetJS. */
function createExcelBlob(data: ExportData): Blob {
  const wb = XLSX.utils.book_new()
  const usedNames = new Set<string>()

  const safeSheetName = (base: string): string => {
    const name = base.replace(/[\\/*?:[\]]/g, '').trim().slice(0, 28) || 'Sheet'
    let candidate = name
    let i = 2
    while (usedNames.has(candidate.toLowerCase())) {
      candidate = `${name.slice(0, 26)}_${i++}`
    }
    usedNames.add(candidate.toLowerCase())
    return candidate
  }

  const autoWidths = (aoa: (string | number)[][]): XLSX.ColInfo[] => {
    const widths: number[] = []
    for (const row of aoa.slice(0, 200)) {
      row.forEach((cell, c) => {
        const len = String(cell ?? '').length + 2
        widths[c] = Math.min(Math.max(widths[c] ?? 10, len), 52)
      })
    }
    return widths.map((wch) => ({ wch }))
  }

  // Summary sheet: title, metadata and every line-based section.
  const summaryAoa: (string | number)[][] = [
    [data.title],
    ['Generated', new Date().toLocaleString()],
    ['Source', data.subtitle ?? 'RetailPulse live API data'],
    [],
  ]
  for (const s of data.sections) {
    if (s.lines?.length) {
      summaryAoa.push([s.heading], ...s.lines.map((l) => [l]), [])
    }
  }
  if (data.charts?.length) {
    summaryAoa.push(
      ['Charts'],
      ...data.charts.map((c) => [c.title, '(image included in PDF/PNG exports)']),
    )
  }
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryAoa)
  summaryWs['!cols'] = autoWidths(summaryAoa)
  XLSX.utils.book_append_sheet(wb, summaryWs, safeSheetName('Summary'))

  // One sheet per table section.
  for (const s of data.sections) {
    if (!s.table || !s.table.rows.length) continue
    const aoa: (string | number)[][] = [
      [s.table.title || s.heading],
      [],
      [...s.table.headers],
      ...s.table.rows,
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = autoWidths(aoa)
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(s.table.title || s.heading))
  }

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load chart image'))
    img.src = dataUrl
  })
}

export async function createPngBlob(data: ExportData): Promise<Blob> {
  const chartImages = data.charts?.length
    ? await Promise.all(data.charts.map(async (chart) => ({ chart, image: await loadImage(chart.dataUrl) })))
    : []

  const canvas = document.createElement('canvas')
  canvas.width = 1400
  const baseHeight = 900
  const chartHeight = chartImages.reduce((sum, item) => sum + Math.min(320, item.image.height / 2) + 48, 0)
  canvas.height = baseHeight + chartHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  ctx.fillStyle = '#1c1917'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#f5f5f4'
  ctx.font = 'bold 32px system-ui, sans-serif'
  ctx.fillText(data.title, 48, 56)
  ctx.font = '16px system-ui, sans-serif'
  ctx.fillStyle = '#d6d3d1'
  ctx.fillText(data.subtitle ?? 'RetailPulse export', 48, 88)
  ctx.fillText(`Generated ${new Date().toLocaleString()}`, 48, 116)

  let y = 160
  const drawLine = (text: string, bold = false) => {
    ctx.fillStyle = bold ? '#f5f5f4' : '#e7e5e4'
    ctx.font = `${bold ? 'bold ' : ''}14px system-ui, sans-serif`
    ctx.fillText(text.slice(0, 120), 48, y)
    y += 22
  }

  for (const section of data.sections) {
    drawLine(section.heading, true)
    section.lines?.forEach((line) => drawLine(line))
    if (section.table) {
      drawLine(section.table.headers.join(' | '), true)
      section.table.rows.slice(0, 8).forEach((row) => drawLine(row.map(String).join(' | ')))
    }
    y += 8
  }

  for (const { chart, image } of chartImages) {
    y += 12
    drawLine(chart.title, true)
    const targetWidth = canvas.width - 96
    const targetHeight = Math.min(320, (image.height / image.width) * targetWidth)
    ctx.drawImage(image, 48, y, targetWidth, targetHeight)
    y += targetHeight + 16
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to create PNG'))
    }, 'image/png')
  })
}

export async function createExportBlob(payload: ExportPayload): Promise<{ blob: Blob; extension: string }> {
  const { format, data } = payload

  switch (format) {
    case 'pdf':
      return { blob: createPdfBlob(data), extension: 'pdf' }
    case 'csv':
      return { blob: createCsvBlob(data), extension: 'csv' }
    case 'excel':
      return { blob: createExcelBlob(data), extension: 'xlsx' }
    case 'png':
      return { blob: await createPngBlob(data), extension: 'png' }
    default:
      return { blob: createPdfBlob(data), extension: 'pdf' }
  }
}

export function downloadBlob(blob: Blob, fileName: string, extension: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${fileName}_${exportTimestamp()}.${extension}`
  anchor.click()
  URL.revokeObjectURL(url)
}
