import type { JournalEntry, TrialBalanceRow } from './generalLedger'
import { flattenJournalEntries } from './generalLedger'

function escapeCsv(value: string | number): string {
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function downloadCsv(filename: string, rows: string[][]) {
  const bom = '\uFEFF'
  const body = rows.map((r) => r.map(escapeCsv).join(',')).join('\n')
  const blob = new Blob([bom + body], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportJournalCsv(entries: JournalEntry[], filename = 'journal-general.csv') {
  const flat = flattenJournalEntries(entries)
  downloadCsv(filename, [
    ['Date', 'Référence', 'Description', 'Compte', 'Nom compte', 'Débit', 'Crédit', 'Source'],
    ...flat.map((l) => [
      l.date,
      l.reference,
      l.description,
      l.accountCode,
      l.accountName,
      l.debit > 0 ? l.debit.toFixed(2) : '',
      l.credit > 0 ? l.credit.toFixed(2) : '',
      l.sourceType,
    ]),
  ])
}

export function exportTrialBalanceCsv(rows: TrialBalanceRow[], filename = 'balance-verification.csv') {
  downloadCsv(filename, [
    ['Compte', 'Nom', 'Type', 'Débit', 'Crédit', 'Solde'],
    ...rows.map((r) => [
      r.accountCode,
      r.accountName,
      r.accountType,
      r.debit > 0 ? r.debit.toFixed(2) : '',
      r.credit > 0 ? r.credit.toFixed(2) : '',
      r.balance.toFixed(2),
    ]),
  ])
}
