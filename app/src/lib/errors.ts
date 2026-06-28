/** Extract a user-visible message from Supabase/PostgREST throws (not always `instanceof Error`). */
export function errorMessage(error: unknown, fallback = 'Erreur'): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

/** Hint when bank import columns are missing from Supabase. */
export function bankImportSetupHint(message: string): string {
  const lower = message.toLowerCase()
  if (
    lower.includes('import_key') ||
    lower.includes('source_format') ||
    lower.includes('transaction_code') ||
    lower.includes('schema cache') ||
    lower.includes('column')
  ) {
    return `${message} — exécutez supabase/migrations/20260629100000_bank_import.sql dans l’éditeur SQL Supabase.`
  }
  return message
}
