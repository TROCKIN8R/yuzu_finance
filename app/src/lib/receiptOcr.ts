import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { DOCUMENTS_BUCKET, MAX_DOCUMENT_BYTES, ALLOWED_DOCUMENT_TYPES } from './documents'
import { round2, splitPurchaseAmount, splitPurchaseTotal, type TaxSettings } from './taxes'

export type ReceiptExtract = {
  vendor: string | null
  expense_date: string | null
  description: string | null
  amount: number | null
  gst: number | null
  qst: number | null
  total: number | null
  currency: string | null
  apply_tax: boolean | null
  confidence: number | null
}

export type ReceiptPurchaseFields = {
  vendor?: string
  expense_date?: string
  description?: string
  amount: number
  gst: number
  qst: number
  total: number
  applyTax: boolean
}

function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'document'
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)
  return cleaned || 'document'
}

function validateReceiptFile(file: File) {
  const mime =
    file.type ||
    (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : file.type)
  if (file.size <= 0) throw new Error('Fichier vide.')
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error('Fichier trop volumineux (max 10 Mo).')
  if (!ALLOWED_DOCUMENT_TYPES.includes(mime as (typeof ALLOWED_DOCUMENT_TYPES)[number])) {
    throw new Error('Type de fichier non autorisé (PDF, JPEG, PNG, WebP).')
  }
  return mime
}

/** Upload to a short-lived inbox path for Edge Function download (RLS: own user folder). */
export async function uploadOcrInbox(file: File): Promise<{ storagePath: string; mimeType: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Non connecté.')

  const mimeType = validateReceiptFile(file)
  const storagePath = `${user.id}/ocr-inbox/${crypto.randomUUID()}_${sanitizeFilename(file.name)}`

  const { error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storagePath, file, { contentType: mimeType, upsert: false })

  if (error) throw new Error(error.message)
  return { storagePath, mimeType }
}

export async function deleteOcrInbox(storagePath: string): Promise<void> {
  await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath])
}

/**
 * Upload receipt to Storage inbox, call extract-receipt Edge Function, then delete inbox file.
 * Does not save an expense — caller pre-fills the form for review.
 */
export async function extractReceiptFromFile(file: File): Promise<ReceiptExtract> {
  const { storagePath, mimeType } = await uploadOcrInbox(file)
  try {
    const { data, error } = await supabase.functions.invoke('extract-receipt', {
      body: { storagePath, mimeType },
    })

    if (error) {
      let detail = ''
      if (error instanceof FunctionsHttpError) {
        try {
          const body = await error.context.json()
          if (body && typeof body === 'object') {
            const errObj = body as { error?: string; detail?: string }
            detail = [errObj.error, errObj.detail].filter(Boolean).join(' — ')
          }
        } catch {
          try {
            detail = await error.context.text()
          } catch {
            /* ignore */
          }
        }
      }
      const msg = detail || error.message || 'Échec de l’extraction.'
      if (/Failed to send|FunctionsFetchError|network|not found|404/i.test(msg) && !detail) {
        throw new Error(
          'Fonction extract-receipt indisponible. Déployez-la et configurez GEMINI_API_KEY (voir supabase/README.md).'
        )
      }
      throw new Error(msg)
    }

    if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
      const errObj = data as { error: string; detail?: string }
      throw new Error([errObj.error, errObj.detail].filter(Boolean).join(' — '))
    }

    return data as ReceiptExtract
  } finally {
    await deleteOcrInbox(storagePath).catch(() => {
      /* best-effort cleanup */
    })
  }
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

/**
 * Map OCR fields onto purchase amounts. Prefer printed tax lines when present;
 * otherwise back-calc from TTC (or forward from HT) via taxes.ts.
 */
export function mergeReceiptIntoPurchase(
  extract: ReceiptExtract,
  currentApplyTax: boolean,
  settings: TaxSettings | null | undefined
): ReceiptPurchaseFields {
  const hasTaxLines =
    (extract.gst !== null && extract.gst > 0) || (extract.qst !== null && extract.qst > 0)
  const applyTax =
    extract.apply_tax === true || extract.apply_tax === false
      ? extract.apply_tax
      : hasTaxLines
        ? true
        : currentApplyTax

  let amount = 0
  let gst = 0
  let qst = 0
  let total = 0

  const ocrGst = extract.gst
  const ocrQst = extract.qst
  const ocrAmount = extract.amount
  const ocrTotal = extract.total

  if (applyTax && (ocrGst !== null || ocrQst !== null) && (ocrAmount !== null || ocrTotal !== null)) {
    gst = round2(Math.max(0, ocrGst ?? 0))
    qst = round2(Math.max(0, ocrQst ?? 0))
    if (ocrAmount !== null && ocrTotal !== null) {
      amount = round2(Math.abs(ocrAmount))
      total = round2(Math.abs(ocrTotal))
      const sum = round2(amount + gst + qst)
      if (Math.abs(sum - total) > 0.02) {
        // Prefer TTC identity: residual on QST
        qst = round2(total - amount - gst)
      }
    } else if (ocrTotal !== null) {
      total = round2(Math.abs(ocrTotal))
      amount = round2(Math.max(0, total - gst - qst))
    } else {
      amount = round2(Math.abs(ocrAmount!))
      total = round2(amount + gst + qst)
    }
  } else if (ocrTotal !== null && ocrTotal > 0) {
    const split = splitPurchaseTotal(ocrTotal, applyTax, settings)
    amount = split.amount
    gst = split.gst
    qst = split.qst
    total = split.total
  } else if (ocrAmount !== null && ocrAmount > 0) {
    const split = splitPurchaseAmount(ocrAmount, applyTax, settings)
    amount = split.amount
    gst = split.gst
    qst = split.qst
    total = split.total
  }

  const out: ReceiptPurchaseFields = { amount, gst, qst, total, applyTax }

  if (extract.vendor) out.vendor = extract.vendor
  if (extract.expense_date && isIsoDate(extract.expense_date)) {
    out.expense_date = extract.expense_date
  }
  if (extract.description) out.description = extract.description

  return out
}
