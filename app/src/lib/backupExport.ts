import { DOCUMENTS_BUCKET } from './documents'
import { todayIso } from './format'
import { supabase } from './supabase'
import { buildZipBlob, downloadBlob, type ZipEntry } from './zipStore'

const TABLE_FOLDERS: { folder: string; table: string }[] = [
  { folder: 'settings', table: 'organization_settings' },
  { folder: 'master', table: 'partners' },
  { folder: 'master', table: 'projects' },
  { folder: 'master', table: 'employees' },
  { folder: 'master', table: 'shareholders' },
  { folder: 'billing', table: 'time_entries' },
  { folder: 'billing', table: 'time_entry_lines' },
  { folder: 'billing', table: 'invoices' },
  { folder: 'billing', table: 'invoice_line_items' },
  { folder: 'billing', table: 'payments' },
  { folder: 'bank', table: 'bank_transactions' },
  { folder: 'bank', table: 'expenses' },
  { folder: 'bank', table: 'employee_expenses' },
  { folder: 'payroll', table: 'payroll_runs' },
  { folder: 'payroll', table: 'dividends' },
  { folder: 'payroll', table: 'dividend_allocations' },
  { folder: 'tax', table: 'sales_tax_periods' },
  { folder: 'tax', table: 'corporate_tax_records' },
  { folder: 'tax', table: 'compliance_deadlines' },
  { folder: 'accounting', table: 'accounting_adjustments' },
  { folder: 'accounting', table: 'fiscal_period_closes' },
  { folder: 'documents', table: 'document_attachments' },
]

export type BackupProgress = {
  phase: string
  current: number
  total: number
}

async function fetchAllRows(table: string): Promise<Record<string, unknown>[]> {
  const pageSize = 1000
  const rows: Record<string, unknown>[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + pageSize - 1)
    if (error) {
      if (error.code === '42P01' || error.message.includes('does not exist')) return rows
      throw new Error(`${table}: ${error.message}`)
    }
    const batch = (data as Record<string, unknown>[]) ?? []
    rows.push(...batch)
    if (batch.length < pageSize) break
    from += pageSize
  }
  return rows
}

function jsonPretty(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function sanitizePathPart(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || 'file'
}

async function downloadStorageFile(path: string): Promise<Uint8Array | null> {
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).download(path)
  if (error || !data) return null
  const buf = await data.arrayBuffer()
  return new Uint8Array(buf)
}

export async function exportFullBackupZip(
  onProgress?: (p: BackupProgress) => void
): Promise<{ filename: string; tableCount: number; documentCount: number }> {
  const stamp = todayIso()
  const root = `yuzu-backup-${stamp}`
  const entries: ZipEntry[] = []
  const counts: Record<string, number> = {}
  const errors: string[] = []

  const totalSteps = TABLE_FOLDERS.length + 2
  let step = 0

  for (const { folder, table } of TABLE_FOLDERS) {
    step += 1
    onProgress?.({ phase: `Export ${table}`, current: step, total: totalSteps })
    try {
      const rows = await fetchAllRows(table)
      counts[table] = rows.length
      entries.push({
        path: `${root}/${folder}/${table}.json`,
        data: jsonPretty(rows),
      })
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
      counts[table] = 0
    }
  }

  step += 1
  onProgress?.({ phase: 'Documents joints', current: step, total: totalSteps })
  let documentCount = 0
  const attachments = (await fetchAllRows('document_attachments')) as {
    entity_type?: string
    entity_id?: string
    filename?: string
    storage_path?: string
    mime_type?: string
    size_bytes?: number
  }[]

  const docIndex: { path: string; storage_path: string; mime_type?: string; size_bytes?: number }[] = []
  for (const doc of attachments) {
    if (!doc.storage_path || !doc.entity_type || !doc.entity_id || !doc.filename) continue
    const rel = `documents/files/${doc.entity_type}/${doc.entity_id}/${sanitizePathPart(doc.filename)}`
    const bytes = await downloadStorageFile(doc.storage_path)
    if (!bytes) {
      errors.push(`Document manquant: ${doc.storage_path}`)
      continue
    }
    entries.push({ path: `${root}/${rel}`, data: bytes })
    docIndex.push({
      path: rel,
      storage_path: doc.storage_path,
      mime_type: doc.mime_type,
      size_bytes: doc.size_bytes,
    })
    documentCount += 1
  }
  entries.push({
    path: `${root}/documents/files-index.json`,
    data: jsonPretty(docIndex),
  })

  const manifest = {
    exported_at: new Date().toISOString(),
    timezone_note: 'America/Montreal recommended for interpretation of dates',
    currency: 'CAD',
    draft_disclaimer: 'Brouillon pour révision — sauvegarde locale, ne remplace pas un dépôt légal.',
    tables: counts,
    document_files: documentCount,
    errors,
  }

  entries.push({ path: `${root}/manifest.json`, data: jsonPretty(manifest) })
  entries.push({
    path: `${root}/README.txt`,
    data: [
      'Yuzu Finance — sauvegarde organisée',
      '',
      'Contenu :',
      '  settings/     — paramètres société',
      '  master/       — partenaires, projets, employés, actionnaires',
      '  billing/      — temps, factures, paiements',
      '  bank/         — banque, dépenses, frais employé',
      '  payroll/      — paie, dividendes',
      '  tax/          — TPS/TVQ, impôts société, échéances conformité',
      '  accounting/   — ajustements, clôtures de période',
      '  documents/    — métadonnées + fichiers joints (PDF/images)',
      '  manifest.json — inventaire et horodatage',
      '',
      'Conservez ce fichier hors dépôt git public. Contient des données financières.',
      '',
    ].join('\n'),
  })

  step += 1
  onProgress?.({ phase: 'Création du ZIP', current: step, total: totalSteps })

  const blob = buildZipBlob(entries)
  const filename = `${root}.zip`
  downloadBlob(blob, filename)

  return {
    filename,
    tableCount: Object.keys(counts).length,
    documentCount,
  }
}
