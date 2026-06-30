import type { InvoiceLanguage } from './types'

const COPY = {
  fr: {
    invoiceTitle: 'FACTURE',
    number: 'N°',
    date: 'Date',
    dueDate: 'Échéance',
    paymentTerms: 'Conditions de paiement',
    billTo: 'Facturer à :',
    neq: 'NEQ',
    dateCol: 'Date',
    description: 'Description',
    qty: 'Qté',
    unitPrice: 'Prix unit.',
    subtotal: 'Sous-total',
    amount: 'Montant',
    gst: 'TPS',
    qst: 'TVQ',
    gstNumber: 'N° TPS',
    qstNumber: 'N° TVQ',
    total: 'Total',
  },
  en: {
    invoiceTitle: 'INVOICE',
    number: 'No.',
    date: 'Date',
    dueDate: 'Due date',
    paymentTerms: 'Payment terms',
    billTo: 'Bill to:',
    neq: 'NEQ',
    dateCol: 'Date',
    description: 'Description',
    qty: 'Qty',
    unitPrice: 'Unit price',
    subtotal: 'Subtotal',
    amount: 'Amount',
    gst: 'GST',
    qst: 'QST',
    gstNumber: 'GST no.',
    qstNumber: 'QST no.',
    total: 'Total',
  },
} as const

export function invoiceCopy(lang: InvoiceLanguage) {
  return COPY[lang]
}

export function partnerInvoiceLanguage(language: string | null | undefined): InvoiceLanguage {
  return language === 'en' ? 'en' : 'fr'
}
