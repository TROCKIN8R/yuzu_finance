export type WealthsimpleSourceFormat = 'chequing' | 'credit_card'
export type WealthsimpleCsvFormat = WealthsimpleSourceFormat | 'activities'

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
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^"?As of\b/i.test(l))
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

function detectFormat(headers: string[]): WealthsimpleCsvFormat | null {
  const set = new Set(headers)
  if (set.has('effective_date') && set.has('activity_type') && set.has('net_cash_amount')) {
    return 'activities'
  }
  if (set.has('date') && set.has('transaction') && set.has('balance')) return 'chequing'
  if (set.has('transaction_date') && set.has('post_date') && set.has('type') && set.has('details')) {
    return 'credit_card'
  }
  return null
}

function mapActivitiesAccountType(accountType: string): WealthsimpleSourceFormat {
  const t = accountType.toLowerCase()
  if (t.includes('credit') || t.includes('carte')) return 'credit_card'
  return 'chequing'
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

function parseActivitiesRow(row: Record<string, string>): ParsedBankRow | null {
  const date = row.effective_date?.trim()
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null

  const currency = row.currency?.trim()
  if (currency && currency.toUpperCase() !== 'CAD') return null

  const rawAmount = Number(row.net_cash_amount)
  if (Number.isNaN(rawAmount) || rawAmount === 0) return null

  const activityType = row.activity_type?.trim() ?? ''
  const subType = row.activity_sub_type?.trim() ?? ''
  const code = subType && subType !== '-' ? subType : activityType || null
  const description = row.description?.trim() || activityType || 'Transaction'

  return {
    transaction_date: date,
    description,
    amount: round2(rawAmount),
    transaction_code: code,
    source_format: mapActivitiesAccountType(row.account_type ?? ''),
    import_key: importKey([
      'activities',
      row.account_id,
      date,
      row.effective_time,
      activityType,
      subType,
      rawAmount,
      description,
    ]),
  }
}

function parseRow(format: WealthsimpleCsvFormat, row: Record<string, string>): ParsedBankRow | null {
  if (format === 'chequing') return parseChequingRow(row)
  if (format === 'credit_card') return parseCreditCardRow(row)
  return parseActivitiesRow(row)
}

export function parseWealthsimpleCsv(text: string): {
  rows: ParsedBankRow[]
  format: WealthsimpleCsvFormat | null
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
    const parsed = parseRow(format, row)
    if (!parsed) {
      skipped++
      continue
    }
    rows.push(parsed)
  }

  return { rows, format, skipped }
}

export function wealthsimpleFormatLabel(format: WealthsimpleCsvFormat | null) {
  if (format === 'chequing') return 'Compte chèques / épargne'
  if (format === 'credit_card') return 'Carte de crédit'
  if (format === 'activities') return 'Export activités'
  return 'Inconnu'
}
