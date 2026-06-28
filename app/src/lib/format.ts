export function formatCad(amount: number): string {
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(amount)
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-CA', { dateStyle: 'medium' }).format(new Date(iso + 'T12:00:00'))
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

/** Supabase nested selects may type as T or T[] depending on inference. */
export function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}
