import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Partner, Invoice, InvoiceLineItem, OrganizationSettings } from './types'
import { DEFAULT_CURRENCY, formatCadCode, formatDate } from './format'
import type { InvoiceLineDraft } from './invoice'
import { invoiceCopy, partnerInvoiceLanguage } from './invoiceI18n'
import { formatPartnerPaymentTerms } from './partners'
import { resolvePaymentInstructions } from './paymentInstructions'
import { uploadDocument } from './documents'

interface PdfInput {
  invoice: Invoice
  partner: Partner
  settings: OrganizationSettings | null
  lines: (InvoiceLineItem | InvoiceLineDraft)[]
}

const LOGO_URL = `${import.meta.env.BASE_URL}yuzu-logo.png`
const LOGO_WIDTH_MM = 58

type LogoAsset = { dataUrl: string; width: number; height: number }

let logoCache: Promise<LogoAsset | null> | null = null

async function loadLogoAsset(): Promise<LogoAsset | null> {
  try {
    const response = await fetch(LOGO_URL)
    if (!response.ok) return null
    const blob = await response.blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Logo failed to load'))
      image.src = dataUrl
    })
    return { dataUrl, width: img.naturalWidth, height: img.naturalHeight }
  } catch {
    return null
  }
}

function getLogoAsset() {
  if (!logoCache) logoCache = loadLogoAsset()
  return logoCache
}

function drawCompanyHeader(
  doc: jsPDF,
  settings: OrganizationSettings | null,
  t: ReturnType<typeof invoiceCopy>,
  lang: 'fr' | 'en',
  margin: number,
  logo: LogoAsset | null
) {
  const company = settings?.company_legal_name || (lang === 'en' ? 'Invoice' : 'Facture')
  let y = margin
  let textX = margin
  let headerBottom = y

  if (logo) {
    const logoHeight = LOGO_WIDTH_MM * (logo.height / logo.width)
    doc.addImage(logo.dataUrl, 'PNG', margin, y, LOGO_WIDTH_MM, logoHeight)
    textX = margin + LOGO_WIDTH_MM + 8
    headerBottom = margin + logoHeight
  }

  let textY = margin + 5
  doc.setTextColor(0)
  doc.setFontSize(11)
  doc.text(company, textX, textY)
  textY += 5

  doc.setFontSize(9)
  doc.setTextColor(100)
  const cityLine = [settings?.city, settings?.province, settings?.postal_code].filter(Boolean).join(', ')
  const addrLines = [settings?.address_line1, cityLine, settings?.country].filter(
    (line): line is string => !!line
  )
  for (const line of addrLines) {
    doc.text(line, textX, textY)
    textY += 4
  }
  if (settings?.neq) {
    doc.text(`${t.neq} : ${settings.neq}`, textX, textY)
    textY += 4
  }
  if (settings?.charge_gst && settings.gst_number) {
    doc.text(`${t.gstNumber} : ${settings.gst_number}`, textX, textY)
    textY += 4
  }
  if (settings?.charge_qst && settings.qst_number) {
    doc.text(`${t.qstNumber} : ${settings.qst_number}`, textX, textY)
    textY += 4
  }

  headerBottom = Math.max(headerBottom, textY)
  doc.setTextColor(0)
  return headerBottom + 8
}

export async function buildInvoicePdfBlob({ invoice, partner, settings, lines }: PdfInput): Promise<Blob> {
  const lang = partnerInvoiceLanguage(partner.language)
  const t = invoiceCopy(lang)
  const doc = new jsPDF()
  const margin = 14
  const logo = await getLogoAsset()
  let y = drawCompanyHeader(doc, settings, t, lang, margin, logo)

  const showTaxes =
    (invoice.include_sales_tax ?? false) &&
    (Number(invoice.gst) > 0 || Number(invoice.qst) > 0)

  doc.setFontSize(12)
  doc.text(t.invoiceTitle, margin, y)
  y += 8
  doc.setFontSize(10)
  const currency = invoice.currency || DEFAULT_CURRENCY
  doc.text(`${t.number} ${invoice.invoice_number}`, margin, y)
  doc.text(`${t.date} : ${formatDate(invoice.invoice_date, lang)}`, 120, y)
  y += 6
  doc.text(`${t.dueDate} : ${formatDate(invoice.due_date, lang)}`, margin, y)
  doc.text(`${t.currency} : ${currency}`, 120, y)
  y += 6
  doc.text(`${t.paymentTerms} : ${formatPartnerPaymentTerms(partner, lang, settings)}`, margin, y)
  y += 10

  doc.setFontSize(10)
  doc.text(t.billTo, margin, y)
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
  if (partner.country) {
    doc.text(partner.country, margin, y)
    y += 4
  }
  y += 6

  const head = showTaxes
    ? [t.dateCol, t.description, t.qty, t.unitPrice, t.subtotal, t.gst, t.qst, t.total]
    : [t.dateCol, t.description, t.qty, t.unitPrice, t.amount]

  const rows = lines.map((line) => {
    const qtyLabel =
      line.unit_label === 'h' ? `${Number(line.quantity).toFixed(2)} h` : `${Number(line.quantity).toFixed(0)}`
    const unitPrice =
      line.unit_label === 'h'
        ? `${formatCadCode(Number(line.unit_price), lang)}/h`
        : formatCadCode(Number(line.unit_price), lang)
    const base = [
      line.line_date ? formatDate(line.line_date, lang) : '—',
      line.description,
      qtyLabel,
      unitPrice,
    ]
    if (showTaxes) {
      return [
        ...base,
        formatCadCode(Number(line.subtotal), lang),
        formatCadCode(Number(line.gst), lang),
        formatCadCode(Number(line.qst), lang),
        formatCadCode(Number(line.total), lang),
      ]
    }
    return [...base, formatCadCode(Number(line.total), lang)]
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
    doc.text(`${t.subtotal} : ${formatCadCode(Number(invoice.subtotal), lang)}`, rightX, finalY, { align: 'right' })
    doc.text(`${t.gst} : ${formatCadCode(Number(invoice.gst), lang)}`, rightX, finalY + 6, { align: 'right' })
    doc.text(`${t.qst} : ${formatCadCode(Number(invoice.qst), lang)}`, rightX, finalY + 12, { align: 'right' })
    doc.setFontSize(12)
    doc.text(`${t.total} : ${formatCadCode(Number(invoice.total), lang)}`, rightX, finalY + 20, { align: 'right' })
  } else {
    doc.setFontSize(12)
    doc.text(`${t.total} : ${formatCadCode(Number(invoice.total), lang)}`, rightX, finalY, { align: 'right' })
  }

  const paymentInstructions = resolvePaymentInstructions(settings, lang)
  if (paymentInstructions) {
    doc.setFontSize(8)
    doc.setTextColor(100)
    const instructionLines = doc.splitTextToSize(paymentInstructions, 180)
    doc.text(instructionLines, margin, finalY + (showTaxes ? 28 : 12))
  }

  return doc.output('blob')
}

export async function downloadInvoicePdf(input: PdfInput) {
  const blob = await buildInvoicePdfBlob(input)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${input.invoice.invoice_number}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

export async function saveInvoicePdfToStorage(input: PdfInput): Promise<void> {
  const blob = await buildInvoicePdfBlob(input)
  await uploadDocument(blob, `${input.invoice.invoice_number}.pdf`, 'application/pdf', 'invoice', input.invoice.id)
}
