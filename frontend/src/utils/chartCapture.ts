import html2canvas from 'html2canvas'
import type { ExportChartImage } from '../types/export'

export async function captureChartImages(): Promise<ExportChartImage[]> {
  const nodes = document.querySelectorAll<HTMLElement>('[data-export-chart]')
  const charts: ExportChartImage[] = []

  for (const node of nodes) {
    if (node.offsetWidth === 0 || node.offsetHeight === 0) continue

    const canvas = await html2canvas(node, {
      backgroundColor: '#1c1917',
      scale: 2,
      logging: false,
      useCORS: true,
    })

    charts.push({
      title: node.dataset.exportChartTitle ?? 'Chart',
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
    })
  }

  return charts
}
