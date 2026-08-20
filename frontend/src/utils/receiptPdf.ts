import { jsPDF } from 'jspdf'

export interface ReceiptData {
  transactionId: string
  transactionDate: string | Date
  cashierName?: string
  customerName?: string
  customerPhone?: string
  paymentMethod: string
  paymentStatus?: string
  dueDate?: string
  totalAmount: number
  discountAmount?: number
  items: Array<{
    productName: string
    quantity: number
    unitPrice: number
    lineTotal?: number
  }>
}

const PM_LABELS: Record<string, string> = {
  cash: 'Cash',
  mobile_money: 'MTN Mobile Money',
  airtel: 'Airtel Money',
  bank_transfer: 'Bank Transfer',
  credit: 'Credit',
}

export function buildReceiptPdf(data: ReceiptData): jsPDF {
  // Generous height to ensure full content, margins and footer fit comfortably
  const estimatedHeight = Math.max(150, 105 + data.items.length * 8 + (data.customerName ? 12 : 0) + (data.dueDate ? 8 : 0))

  const doc = new jsPDF({
    unit: 'mm',
    format: [80, estimatedHeight],
    orientation: 'portrait',
  })

  let y = 8
  const left = 4
  const right = 76
  const center = 40

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('QUINCAILLERIE DU RWAMAGANA', center, y, { align: 'center' })
  y += 4.5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text('Rwamagana, Eastern Province', center, y, { align: 'center' })
  y += 6

  // Dashed separator
  doc.setLineDashPattern([1, 1], 0)
  doc.line(left, y, right, y)
  y += 4.5

  // Header meta
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.text('Receipt:', left, y)
  doc.setFont('helvetica', 'normal')
  const cleanId = data.transactionId.replace(/^TX-?/i, '').substring(0, 8).toUpperCase()
  doc.text(`#${cleanId}`, right, y, { align: 'right' })
  y += 4

  doc.setFont('helvetica', 'bold')
  doc.text('Date:', left, y)
  doc.setFont('helvetica', 'normal')
  const dateStr = typeof data.transactionDate === 'string'
    ? new Date(data.transactionDate).toLocaleString()
    : data.transactionDate.toLocaleString()
  doc.text(dateStr, right, y, { align: 'right' })
  y += 4

  doc.setFont('helvetica', 'bold')
  doc.text('Cashier:', left, y)
  doc.setFont('helvetica', 'normal')
  doc.text(data.cashierName || 'Administrator', right, y, { align: 'right' })
  y += 4.5

  doc.line(left, y, right, y)
  y += 4.5

  // Table header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.text('Item', left, y)
  doc.text('Qty', left + 35, y, { align: 'center' })
  doc.text('Price', left + 52, y, { align: 'right' })
  doc.text('Total', right, y, { align: 'right' })
  y += 2
  doc.line(left, y, right, y)
  y += 4

  // Items
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  for (const item of data.items) {
    const itemTotal = item.lineTotal ?? item.quantity * item.unitPrice
    const nameLines = doc.splitTextToSize(item.productName, 32)
    doc.text(nameLines, left, y)
    doc.text(String(item.quantity || 0), left + 35, y, { align: 'center' })
    doc.text(Number(item.unitPrice).toLocaleString(), left + 52, y, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.text(Number(itemTotal).toLocaleString(), right, y, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    y += Math.max(nameLines.length * 3.5 + 1, 4.5)
  }

  y += 1
  doc.line(left, y, right, y)
  y += 4.5

  // Totals
  const discount = Number(data.discountAmount || 0)
  if (discount > 0) {
    doc.setFontSize(8.5)
    doc.text('Subtotal', left, y)
    doc.text((Number(data.totalAmount) + discount).toLocaleString(), right, y, { align: 'right' })
    y += 3.5
    doc.text('Discount', left, y)
    doc.text(`-${discount.toLocaleString()}`, right, y, { align: 'right' })
    y += 4
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('TOTAL', left, y)
  doc.text(`${Number(data.totalAmount).toLocaleString()} RWF`, right, y, { align: 'right' })
  y += 3

  doc.setLineDashPattern([1, 1], 0)
  doc.line(left, y, right, y)
  y += 4.5

  // Payment info
  doc.setFontSize(8.5)
  doc.text('Payment Method:', left, y)
  doc.setFont('helvetica', 'normal')
  doc.text(PM_LABELS[data.paymentMethod] ?? data.paymentMethod, right, y, { align: 'right' })
  y += 4

  if (data.customerName) {
    doc.setFont('helvetica', 'bold')
    doc.text('Customer:', left, y)
    doc.setFont('helvetica', 'normal')
    doc.text(data.customerName, right, y, { align: 'right' })
    y += 4
  }

  if (data.customerPhone) {
    doc.setFont('helvetica', 'bold')
    doc.text('Phone:', left, y)
    doc.setFont('helvetica', 'normal')
    doc.text(data.customerPhone, right, y, { align: 'right' })
    y += 4
  }

  if (data.paymentMethod === 'credit' && data.dueDate) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(200, 0, 0)
    doc.text('Due by:', left, y)
    doc.text(data.dueDate, right, y, { align: 'right' })
    doc.setTextColor(0, 0, 0)
    y += 4
  }

  doc.line(left, y, right, y)
  y += 5

  // Footer
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Thank you for your business!', center, y, { align: 'center' })
  y += 4
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 100, 100)
  doc.text('Goods once sold are not returnable.', center, y, { align: 'center' })

  return doc
}

export function downloadReceiptPdf(data: ReceiptData) {
  const doc = buildReceiptPdf(data)
  const cleanId = data.transactionId.replace(/^TX-?/i, '').substring(0, 8).toUpperCase()
  doc.save(`Receipt_${cleanId}.pdf`)
}

export function printReceiptPdf(data: ReceiptData) {
  const doc = buildReceiptPdf(data)
  doc.autoPrint()
  const blob = doc.output('blob')
  const blobUrl = URL.createObjectURL(blob)

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.src = blobUrl

  document.body.appendChild(iframe)

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch {
      window.open(blobUrl, '_blank')
    }
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe)
      }
      URL.revokeObjectURL(blobUrl)
    }, 60000)
  }
}
