export type WealthsimpleSourceFormat = 'chequing' | 'credit_card'

export interface ParsedBankRow {
  transaction_date: string
  description: string
  amount: number
  transaction_code: string | null
  source_format: WealthsimpleSourceFormat
  import_key: string
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0]).map((h) => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line).map((v) => v.trim().replace(/^"|"$/g, ''))
    const row: Record<string, string> = {}
    headers.forEach((h, i) => {
      row[h] = values[i] ?? ''
    })
    return row
  })
}

function importKey(parts: (string | number | null | undefined)[]) {
  return parts.map((p) => String(p ?? '').trim()).join('|')
}

function detectFormat(headers: string[]): WealthsimpleSourceFormat | null {
  const set = new Set(headers)
  if (set.has('date') && set.has('transaction') && set.has('balance')) return 'chequing'
  if (set.has('transaction_date') && set.has('post_date') && set.has('type') && set.has('details')) {
    return 'credit_card'
  }
  return null
}

function parseChequingRow(row: Record<string, string>): ParsedBankRow | null {
  const date = row.date
  const amount = Number(row.amount)
  if (!date || Number.isNaN(amount)) return null

  const code = row.transaction || null
  const rawDesc = row.description?.trim()
  const description = rawDesc || code || 'Transaction'

  return {
    transaction_date: date,
    description,
    amount: round2(amount),
    transaction_code: code,
    source_format: 'chequing',
    import_key: importKey(['chequing', date, code, amount, description]),
  }
}

function parseCreditCardRow(row: Record<string, string>): ParsedBankRow | null {
  const type = row.type?.trim() ?? ''
  if (type === 'Refund initiated' || type === 'Refund settled') return null

  const date = row.transaction_date || row.post_date
  const rawAmount = Number(row.amount)
  if (!date || Number.isNaN(rawAmount)) return null

  const details = row.details?.trim() || type || 'Transaction'
  let amount = round2(rawAmount)

  if (type === 'Purchase' || type === 'Fee') {
    amount = round2(-Math.abs(amount))
  } else if (type === 'Payment') {
    amount = round2(Math.abs(amount))
  } else if (type.toLowerCase().includes('refund')) {
    amount = round2(Math.abs(amount))
  }

  return {
    transaction_date: date,
    description: details,
    amount,
    transaction_code: type || null,
    source_format: 'credit_card',
    import_key: importKey(['credit_card', date, type, rawAmount, details, row.post_date]),
  }
}

export function parseWealthsimpleCsv(text: string): {
  rows: ParsedBankRow[]
  format: WealthsimpleSourceFormat | null
  skipped: number
} {
  const normalized = text.replace(/^\uFEFF/, '').trim()
  const records = parseCsv(normalized)
  if (records.length === 0) return { rows: [], format: null, skipped: 0 }

  const headers = Object.keys(records[0])
  const format = detectFormat(headers)
  if (!format) return { rows: [], format: null, skipped: records.length }

  const rows: ParsedBankRow[] = []
  let skipped = 0

  for (const row of records) {
    const parsed = format === 'chequing' ? parseChequingRow(row) : parseCreditCardRow(row)
    if (!parsed) {
      skipped++
      continue
    }
    rows.push(parsed)
  }

  return { rows, format, skipped }
}

export function wealthsimpleFormatLabel(format: WealthsimpleSourceFormat | null) {
  if (format === 'chequing') return 'Compte chèques / épargne'
  if (format === 'credit_card') return 'Carte de crédit'
  return 'Inconnu'
}
