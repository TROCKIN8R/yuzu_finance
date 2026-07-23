export function formatCad(amount: number): string {
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(amount)
}

export function formatDate(iso: string, language: 'fr' | 'en' = 'fr'): string {
  const locale = language === 'en' ? 'en-CA' : 'fr-CA'
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso + 'T12:00:00'))
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function effectiveRate(entry: { rate_override: number | null }, project: { default_hourly_rate: number }): number {
  return entry.rate_override ?? project.default_hourly_rate
}

export function lineAmount(hours: number, rate: number): number {
  return Math.round(hours * rate * 100) / 100
}

/** Controlled number inputs: blank instead of 0 to avoid leading-zero typing (0500). */
export function numberFieldValue(n: number): string {
  if (n === 0) return ''
  return String(n)
}

export function parseNumberField(raw: string): number {
  const trimmed = raw.trim()
  if (trimmed === '') return 0
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : 0
}

/** Supabase nested selects may type as T or T[] depending on inference. */
export function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}
