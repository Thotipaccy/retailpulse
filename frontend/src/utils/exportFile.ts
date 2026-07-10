import { jsPDF } from 'jspdf'
import type { ExportData, ExportSection } from '../types/export'

export type ExportFormat = 'pdf' | 'excel' | 'csv' | 'pptx' | 'png'

export interface ExportPayload {
  title: string
  fileName: string
  format: ExportFormat
  options: Record<string, boolean>
  data: ExportData
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function sectionToHtml(section: ExportSection): string {
  let html = `<h3>${escapeHtml(section.heading)}</h3>`
  if (section.lines?.length) {
    html += `<ul>${section.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`
  }
  if (section.table) {
    html += '<table border="1" cellpadding="4"><thead><tr>'
    html += section.table.headers.map((h) => `<th>${escapeHtml(String(h))}</th>`).join('')
    html += '</tr></thead><tbody>'
    html += section.table.rows.map((row) =>
      `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell))}</td>`).join('')}</tr>`,
    ).join('')
    html += '</tbody></table>'
  }
  return html
}

function chartsToHtml(charts: ExportData['charts']): string {
  if (!charts?.length) return ''
  return charts.map((chart) =>
    `<h3>${escapeHtml(chart.title)}</h3><img src="${chart.dataUrl}" alt="${escapeHtml(chart.title)}" style="max-width:100%;margin-bottom:16px;border:1px solid #ddd;" />`,
  ).join('')
}

export function createPdfBlob(data: ExportData, options: Record<string, boolean>): Blob {
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

  for (const [key, enabled] of Object.entries(options)) {
    writeln(`${key}: ${enabled ? 'Yes' : 'No'}`, 8)
  }
  y += 4

  for (const section of data.sections) {
    ensureSpace(10)
    writeln(`-- ${section.heading} --`, 11, true)
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
    writeln('-- Chart Visualizations --', 11, true)
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

  return doc.output('blob')
}

function createCsvBlob(data: ExportData, options: Record<string, boolean>): Blob {
  const rows: string[][] = [
    ['Report', data.title],
    ['Generated At', new Date().toISOString()],
    ...Object.entries(options).map(([key, value]) => [key, value ? 'Yes' : 'No']),
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
      rows.push([chart.title, 'Embedded in PDF/Excel/PNG exports'])
    }
  }

  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  return new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' })
}

function createExcelBlob(data: ExportData): Blob {
  const body = [
    `<h2>${escapeHtml(data.title)}</h2>`,
    data.subtitle ? `<p>${escapeHtml(data.subtitle)}</p>` : '',
    `<p>Generated: ${escapeHtml(new Date().toLocaleString())}</p>`,
    ...data.sections.map(sectionToHtml),
    chartsToHtml(data.charts),
  ].join('')
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${body}</body></html>`
  return new Blob([html], { type: 'application/vnd.ms-excel' })
}

function createPptxBlob(data: ExportData): Blob {
  const slides = [
    `<h1>${escapeHtml(data.title)}</h1>`,
    data.subtitle ? `<p>${escapeHtml(data.subtitle)}</p>` : '',
    ...data.sections.map((section) => {
      const lines = [
        `<h2>${escapeHtml(section.heading)}</h2>`,
        ...(section.lines?.map((l) => `<p>${escapeHtml(l)}</p>`) ?? []),
      ]
      if (section.table && section.table.rows.length) {
        lines.push(`<p>${escapeHtml(section.table.headers.join(' - '))}</p>`)
        const preview = section.table.rows.slice(0, 8)
        lines.push(`<ul>${preview.map((row) => `<li>${escapeHtml(row.join(' | '))}</li>`).join('')}</ul>`)
      }
      return lines.join('')
    }),
    chartsToHtml(data.charts),
  ].join('<hr/>')

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(data.title)}</title></head><body>${slides}</body></html>`
  return new Blob([html], { type: 'application/vnd.ms-powerpoint' })
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
  const { format, options, data } = payload

  switch (format) {
    case 'pdf':
      return { blob: createPdfBlob(data, options), extension: 'pdf' }
    case 'csv':
      return { blob: createCsvBlob(data, options), extension: 'csv' }
    case 'excel':
      return { blob: createExcelBlob(data), extension: 'xls' }
    case 'pptx':
      return { blob: createPptxBlob(data), extension: 'ppt' }
    case 'png':
      return { blob: await createPngBlob(data), extension: 'png' }
    default:
      return { blob: createPdfBlob(data, options), extension: 'pdf' }
  }
}

export function downloadBlob(blob: Blob, fileName: string, extension: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${fileName}.${extension}`
  anchor.click()
  URL.revokeObjectURL(url)
}
