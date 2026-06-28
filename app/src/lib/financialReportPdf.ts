import { jsPDF } from 'jspdf'
import type { FinancialSnapshot } from './financials'
import type { OrganizationSettings } from './types'
import { formatDate } from './format'

export type FinancialReportKind = 'cash-flow' | 'balance-sheet' | 'income'

function cad(amount: number): string {
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(amount)
}

type StmtLine = { label: string; value: string; bold?: boolean; indent?: boolean }

function addReportHeader(doc: jsPDF, company: string, title: string, periodLabel: string, y: number): number {
  const margin = 14
  doc.setFontSize(14)
  doc.setTextColor(0)
  doc.text(company, margin, y)
  y += 7
  doc.setFontSize(11)
  doc.text(title, margin, y)
  y += 6
  doc.setFontSize(9)
  doc.setTextColor(100)
  doc.text(periodLabel, margin, y)
  y += 4
  doc.text(`Généré le ${formatDate(new Date().toISOString().slice(0, 10))} — brouillon pour révision CPA`, margin, y)
  doc.setTextColor(0)
  return y + 10
}

function addStatementLines(doc: jsPDF, lines: StmtLine[], startY: number): number {
  const margin = 14
  const pageWidth = doc.internal.pageSize.getWidth()
  const valueX = pageWidth - margin
  let y = startY

  for (const line of lines) {
    if (y > 270) {
      doc.addPage()
      y = 20
    }
    doc.setFont('helvetica', line.bold ? 'bold' : 'normal')
    doc.setFontSize(line.bold ? 10 : 9)
    const labelX = margin + (line.indent ? 6 : 0)
    doc.text(line.label, labelX, y)
    doc.text(line.value, valueX, y, { align: 'right' })
    y += line.bold ? 7 : 5.5
  }

  return y
}

function cashFlowLines(fin: FinancialSnapshot): StmtLine[] {
  const cf = fin.cashFlow
  return [
    { label: 'ENCAISSEMENTS', value: '' },
    { label: 'Paiements clients reçus', value: cad(cf.clientPayments), indent: true },
    { label: 'DÉCAISSEMENTS', value: '' },
    { label: 'Dépenses payées (TTC)', value: cad(-cf.expensesPaid), indent: true },
    { label: 'Salaire net versé aux employés', value: cad(-cf.payrollNetToEmployee), indent: true },
    { label: 'Remises paie (retenues + cotisations)', value: cad(-cf.payrollRemittancesPaid), indent: true },
    { label: 'Cotisations employeur (cash)', value: cad(-cf.employerPayrollContributions), indent: true },
    { label: 'Remises TPS/TVQ', value: cad(-cf.salesTaxRemitted), indent: true },
    { label: 'Impôts société payés', value: cad(-cf.corporateTaxPaid), indent: true },
    { label: 'Dividendes payés', value: cad(-cf.dividendsPaid), indent: true },
    { label: 'Total décaissements', value: cad(-fin.cashOut), bold: true },
    { label: 'Trésorerie nette estimée', value: cad(fin.netCash), bold: true },
  ]
}

function balanceSheetLines(fin: FinancialSnapshot): StmtLine[] {
  const bs = fin.balanceSheet
  const eq = bs.equity
  const lines: StmtLine[] = [
    { label: 'ACTIF', value: '' },
    { label: 'Trésorerie comptable', value: cad(bs.cash), indent: true },
  ]
  if (bs.bankStatementBalance != null) {
    lines.push({ label: 'Solde relevé bancaire', value: cad(bs.bankStatementBalance), indent: true })
  }
  lines.push(
    { label: 'Comptes clients (CC)', value: cad(bs.accountsReceivable), indent: true },
    { label: 'TPS à recevoir (CTI)', value: cad(bs.gstReceivable), indent: true },
    { label: 'TVQ à recevoir (RTI)', value: cad(bs.qstReceivable), indent: true },
    { label: 'Total actif', value: cad(bs.totalAssets), bold: true },
    { label: 'PASSIF', value: '' },
    { label: 'Comptes fournisseurs', value: cad(bs.accountsPayable), indent: true }
  )
  if (bs.employeeReimbursementsPending > 0) {
    lines.push({ label: 'Remboursements employé dus', value: cad(bs.employeeReimbursementsPending), indent: true })
  }
  lines.push(
    { label: 'TPS à remettre', value: cad(bs.gstPayable), indent: true },
    { label: 'TVQ à remettre', value: cad(bs.qstPayable), indent: true },
    { label: 'Remises paie en attente', value: cad(bs.payrollRemittancesPending), indent: true }
  )
  if (bs.dividendsPayable > 0) {
    lines.push({ label: 'Dividendes à payer', value: cad(bs.dividendsPayable), indent: true })
  }
  lines.push(
    { label: 'Impôts société dus', value: cad(bs.corporateTaxDue), indent: true },
    { label: 'Provision impôt société', value: cad(bs.corpTaxProvision), indent: true },
    { label: 'Total passif', value: cad(bs.totalLiabilities), bold: true },
    { label: 'AVOIR', value: '' },
    { label: 'Capital-actions', value: cad(eq.shareCapital), indent: true },
    { label: "BNR d'ouverture", value: cad(eq.openingRetainedEarnings), indent: true },
    { label: 'Résultat de la période', value: cad(eq.operatingIncome), indent: true },
    { label: 'Dividendes déclarés (période)', value: cad(-eq.dividendsDistributed), indent: true },
    { label: 'BNR cumulé', value: cad(eq.retainedEarnings), indent: true },
    { label: 'Total avoir', value: cad(eq.totalEquity), bold: true }
  )
  return lines
}

function incomeLines(fin: FinancialSnapshot): StmtLine[] {
  const inc = fin.income
  return [
    { label: 'REVENUS', value: '' },
    { label: 'Revenus de services (HT)', value: cad(inc.revenueSubtotal), indent: true },
    { label: "CHARGES D'EXPLOITATION", value: '' },
    { label: "Dépenses d'exploitation (HT)", value: cad(-inc.operatingExpenses), indent: true },
    { label: 'Salaires bruts', value: cad(-inc.payrollGross), indent: true },
    { label: 'Cotisations employeur', value: cad(-inc.employerPayrollContributions), indent: true },
    { label: "Résultat d'exploitation", value: cad(inc.operatingIncome), bold: true },
    { label: 'DISTRIBUTIONS (AVOIR)', value: '' },
    { label: 'Dividendes payés (hors P&L)', value: cad(inc.dividendsDistributed), indent: true },
  ]
}

const REPORT_META: Record<FinancialReportKind, { title: string; filename: string; lines: (fin: FinancialSnapshot) => StmtLine[] }> = {
  'cash-flow': { title: 'Flux de trésorerie', filename: 'flux-tresorerie', lines: cashFlowLines },
  'balance-sheet': { title: 'Bilan simplifié', filename: 'bilan', lines: balanceSheetLines },
  income: { title: 'État des résultats', filename: 'etat-resultats', lines: incomeLines },
}

function slugPeriod(label: string): string {
  return label.replace(/[^\w\d-]+/g, '-').replace(/-+/g, '-').toLowerCase()
}

export function downloadFinancialReportPdf(
  kind: FinancialReportKind,
  fin: FinancialSnapshot,
  settings: OrganizationSettings | null
) {
  const company = settings?.company_legal_name || 'Rapport financier'
  const meta = REPORT_META[kind]
  const doc = new jsPDF()
  let y = addReportHeader(doc, company, meta.title, fin.period.label, 20)
  addStatementLines(doc, meta.lines(fin), y)
  doc.save(`${meta.filename}-${slugPeriod(fin.period.label)}.pdf`)
}

export function downloadAllFinancialReportsPdf(fin: FinancialSnapshot, settings: OrganizationSettings | null) {
  const company = settings?.company_legal_name || 'Rapport financier'
  const doc = new jsPDF()
  const kinds: FinancialReportKind[] = ['income', 'balance-sheet', 'cash-flow']

  kinds.forEach((kind, index) => {
    if (index > 0) doc.addPage()
    const meta = REPORT_META[kind]
    const y = addReportHeader(doc, company, meta.title, fin.period.label, 20)
    addStatementLines(doc, meta.lines(fin), y)
  })

  doc.save(`rapports-financiers-${slugPeriod(fin.period.label)}.pdf`)
}
