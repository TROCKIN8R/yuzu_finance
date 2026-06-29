import { supabase } from './supabase'

export interface FiscalPeriodClose {
  id: string
  user_id: string
  period_end: string
  notes: string | null
  closed_at: string
  created_at: string
}

export const PERIOD_CLOSE_REOPEN_PATH = '/period-close'

/** Normalize Postgres `date` / ISO strings to `YYYY-MM-DD`. */
export function dateOnly(isoDate: string): string {
  return isoDate.slice(0, 10)
}

/** Last calendar day of the month containing `isoDate`. */
export function monthEndForDate(isoDate: string): string {
  const [y, m] = dateOnly(isoDate).split('-').map(Number)
  const last = new Date(y, m, 0)
  const mm = String(last.getMonth() + 1).padStart(2, '0')
  const dd = String(last.getDate()).padStart(2, '0')
  return `${last.getFullYear()}-${mm}-${dd}`
}

export function isDateInClosedPeriod(isoDate: string, closes: Pick<FiscalPeriodClose, 'period_end'>[]): boolean {
  const monthEnd = monthEndForDate(isoDate)
  return closes.some((c) => dateOnly(c.period_end) === monthEnd)
}

/** Server check — use on destructive writes so guards stay correct after closing a month elsewhere. */
export async function assertPeriodOpenForDate(isoDate: string): Promise<void> {
  const { data, error } = await supabase.from('fiscal_period_closes').select('period_end')
  if (error) throw new Error(error.message)
  if (isDateInClosedPeriod(isoDate, data ?? [])) {
    throw new Error(closedPeriodMessage(isoDate))
  }
}

export function formatPeriodLabel(periodEnd: string): string {
  const [y, m] = periodEnd.split('-')
  const months = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
  ]
  return `${months[Number(m) - 1]} ${y}`
}

export function closedPeriodMessage(isoDate: string): string {
  return `Période clôturée (${formatPeriodLabel(monthEndForDate(isoDate))}). Rouvrez le mois dans Clôture de période (${PERIOD_CLOSE_REOPEN_PATH}).`
}

export function firstClosedDateMessage(
  dates: (string | null | undefined)[],
  closes: Pick<FiscalPeriodClose, 'period_end'>[]
): string | null {
  for (const isoDate of dates) {
    if (!isoDate) continue
    if (isDateInClosedPeriod(isoDate, closes)) return closedPeriodMessage(isoDate)
  }
  return null
}
