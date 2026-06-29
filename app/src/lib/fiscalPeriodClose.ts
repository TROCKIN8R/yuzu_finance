export interface FiscalPeriodClose {
  id: string
  user_id: string
  period_end: string
  notes: string | null
  closed_at: string
  created_at: string
}

/** Last calendar day of the month containing `isoDate`. */
export function monthEndForDate(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number)
  const last = new Date(y, m, 0)
  const mm = String(last.getMonth() + 1).padStart(2, '0')
  const dd = String(last.getDate()).padStart(2, '0')
  return `${last.getFullYear()}-${mm}-${dd}`
}

export function isDateInClosedPeriod(isoDate: string, closes: Pick<FiscalPeriodClose, 'period_end'>[]): boolean {
  const monthEnd = monthEndForDate(isoDate)
  return closes.some((c) => c.period_end === monthEnd)
}

export function formatPeriodLabel(periodEnd: string): string {
  const [y, m] = periodEnd.split('-')
  const months = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
  ]
  return `${months[Number(m) - 1]} ${y}`
}
