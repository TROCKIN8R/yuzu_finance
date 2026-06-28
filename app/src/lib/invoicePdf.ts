import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Client, Invoice, OrganizationSettings, TimeEntry } from './types'
import { effectiveRate, formatDate, lineAmount } from './format'

interface PdfInput {
  invoice: Invoice
  client: Client
  settings: OrganizationSettings | null
  entries: TimeEntry[]
}

export function downloadInvoicePdf({ invoice, client, settings, entries }: PdfInput) {
  const doc = new jsPDF()
  const company = settings?.company_legal_name || 'Facture'
  const margin = 14
  let y = 20

  doc.setFontSize(16)
  doc.text(company, margin, y)
  y += 6
  doc.setFontSize(9)
  doc.setTextColor(100)
  const addr = [settings?.address_line1, `${settings?.city ?? ''}, ${settings?.province ?? ''} ${settings?.postal_code ?? ''}`]
    .filter(Boolean)
    .join(' · ')
  if (addr) doc.text(addr, margin, y)
  y += 5
  if (settings?.neq) doc.text(`NEQ : ${settings.neq}`, margin, y)
  y += 10

  doc.setTextColor(0)
  doc.setFontSize(12)
  doc.text('FACTURE / INVOICE', margin, y)
  y += 8
  doc.setFontSize(10)
  doc.text(`N° ${invoice.invoice_number}`, margin, y)
  doc.text(`Date : ${formatDate(invoice.invoice_date)}`, 120, y)
  y += 6
  doc.text(`Échéance : ${formatDate(invoice.due_date)}`, margin, y)
  y += 10

  doc.setFontSize(10)
  doc.text('Facturer à :', margin, y)
  y += 5
  doc.setFontSize(9)
  doc.text(client.legal_name, margin, y)
  y += 4
  if (client.address_line1) {
    doc.text(client.address_line1, margin, y)
    y += 4
  }
  const clientCity = [client.city, client.province, client.postal_code].filter(Boolean).join(' ')
  if (clientCity) {
    doc.text(clientCity, margin, y)
    y += 4
  }
  y += 6

  const rows = entries.map((e) => {
    const rate = e.projects ? effectiveRate(e, e.projects) : 0
    const amt = lineAmount(Number(e.hours), rate)
    return [
      formatDate(e.entry_date),
      e.description,
      Number(e.hours).toFixed(2),
      `${rate.toFixed(2)} $`,
      `${amt.toFixed(2)} $`,
    ]
  })

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Description', 'Heures', 'Taux', 'Montant']],
    body: rows,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [229, 168, 23] },
  })

  const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  const rightX = 195
  doc.setFontSize(10)
  doc.text(`Sous-total : ${Number(invoice.subtotal).toFixed(2)} $`, rightX, finalY, { align: 'right' })
  doc.text(`TPS : ${Number(invoice.gst).toFixed(2)} $`, rightX, finalY + 6, { align: 'right' })
  doc.text(`TVQ : ${Number(invoice.qst).toFixed(2)} $`, rightX, finalY + 12, { align: 'right' })
  doc.setFontSize(12)
  doc.text(`Total : ${Number(invoice.total).toFixed(2)} $`, rightX, finalY + 20, { align: 'right' })

  if (settings?.payment_instructions) {
    doc.setFontSize(8)
    doc.setTextColor(100)
    doc.text(settings.payment_instructions, margin, finalY + 28, { maxWidth: 180 })
  }

  doc.save(`${invoice.invoice_number}.pdf`)
}
