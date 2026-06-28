import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Partner, Invoice, InvoiceLineItem, OrganizationSettings } from './types'
import { formatDate } from './format'
import type { InvoiceLineDraft } from './invoice'

interface PdfInput {
  invoice: Invoice
  partner: Partner
  settings: OrganizationSettings | null
  lines: (InvoiceLineItem | InvoiceLineDraft)[]
}

export function downloadInvoicePdf({ invoice, partner, settings, lines }: PdfInput) {
  const doc = new jsPDF()
  const company = settings?.company_legal_name || 'Facture'
  const margin = 14
  let y = 20
  const showTaxes =
    (invoice.include_sales_tax ?? false) &&
    (Number(invoice.gst) > 0 || Number(invoice.qst) > 0)

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
  doc.text(partner.legal_name, margin, y)
  y += 4
  if (partner.address_line1) {
    doc.text(partner.address_line1, margin, y)
    y += 4
  }
  const partnerCity = [partner.city, partner.province, partner.postal_code].filter(Boolean).join(' ')
  if (partnerCity) {
    doc.text(partnerCity, margin, y)
    y += 4
  }
  y += 6

  const head = showTaxes
    ? ['Date', 'Description', 'Qté', 'Prix unit.', 'Sous-total', 'TPS', 'TVQ', 'Total']
    : ['Date', 'Description', 'Qté', 'Prix unit.', 'Montant']

  const rows = lines.map((line) => {
    const qtyLabel =
      line.unit_label === 'h' ? `${Number(line.quantity).toFixed(2)} h` : `${Number(line.quantity).toFixed(0)}`
    const unitPrice =
      line.unit_label === 'h'
        ? `${Number(line.unit_price).toFixed(2)} $/h`
        : `${Number(line.unit_price).toFixed(2)} $`
    const base = [
      line.line_date ? formatDate(line.line_date) : '—',
      line.description,
      qtyLabel,
      unitPrice,
    ]
    if (showTaxes) {
      return [
        ...base,
        `${Number(line.subtotal).toFixed(2)} $`,
        `${Number(line.gst).toFixed(2)} $`,
        `${Number(line.qst).toFixed(2)} $`,
        `${Number(line.total).toFixed(2)} $`,
      ]
    }
    return [...base, `${Number(line.total).toFixed(2)} $`]
  })

  autoTable(doc, {
    startY: y,
    head: [head],
    body: rows,
    styles: { fontSize: 7 },
    headStyles: { fillColor: [229, 168, 23] },
    columnStyles: showTaxes
      ? {
          0: { cellWidth: 22 },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
          7: { halign: 'right' },
        }
      : {
          0: { cellWidth: 22 },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
        },
  })

  const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  const rightX = 195
  doc.setFontSize(10)
  if (showTaxes) {
    doc.text(`Sous-total : ${Number(invoice.subtotal).toFixed(2)} $`, rightX, finalY, { align: 'right' })
    doc.text(`TPS : ${Number(invoice.gst).toFixed(2)} $`, rightX, finalY + 6, { align: 'right' })
    doc.text(`TVQ : ${Number(invoice.qst).toFixed(2)} $`, rightX, finalY + 12, { align: 'right' })
    doc.setFontSize(12)
    doc.text(`Total : ${Number(invoice.total).toFixed(2)} $`, rightX, finalY + 20, { align: 'right' })
  } else {
    doc.setFontSize(12)
    doc.text(`Total : ${Number(invoice.total).toFixed(2)} $`, rightX, finalY, { align: 'right' })
  }

  if (settings?.payment_instructions) {
    doc.setFontSize(8)
    doc.setTextColor(100)
    doc.text(settings.payment_instructions, margin, finalY + (showTaxes ? 28 : 12), { maxWidth: 180 })
  }

  doc.save(`${invoice.invoice_number}.pdf`)
}
