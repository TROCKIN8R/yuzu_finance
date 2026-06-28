export interface DateRange {
  start: string
  end: string
  label: string
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function iso(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate()
}

function clampFyeDay(y: number, month: number, day: number) {
  return Math.min(day, daysInMonth(y, month))
}

/** Fiscal year containing `ref` (defaults to today). FY ends on fyeMonth/fyeDay. */
export function currentFiscalYearRange(
  fyeMonth: number,
  fyeDay: number,
  ref: Date = new Date()
): DateRange {
  const y = ref.getFullYear()
  const m = ref.getMonth() + 1
  const d = ref.getDate()
  const fyeThisYear = new Date(y, fyeMonth - 1, clampFyeDay(y, fyeMonth, fyeDay))
  const refDate = new Date(y, m - 1, d)
  const endYear = refDate > fyeThisYear ? y + 1 : y
  const startYear = endYear - 1
  const endDay = clampFyeDay(endYear, fyeMonth, fyeDay)
  const startDay = clampFyeDay(startYear, fyeMonth, fyeDay)
  return {
    start: iso(startYear, fyeMonth, startDay + 1 > daysInMonth(startYear, fyeMonth) ? 1 : startDay + 1),
    end: iso(endYear, fyeMonth, endDay),
    label: `AF ${startYear}–${endYear}`,
  }
}

function fixFyStart(startYear: number, fyeMonth: number, fyeDay: number) {
  const nextDay = fyeDay + 1
  if (nextDay > daysInMonth(startYear, fyeMonth)) {
    const nm = fyeMonth === 12 ? 1 : fyeMonth + 1
    const ny = fyeMonth === 12 ? startYear + 1 : startYear
    return iso(ny, nm, 1)
  }
  return iso(startYear, fyeMonth, nextDay)
}

export function currentFiscalYearRangeFixed(fyeMonth: number, fyeDay: number, ref: Date = new Date()): DateRange {
  const y = ref.getFullYear()
  const m = ref.getMonth() + 1
  const d = ref.getDate()
  const afterFye =
    m > fyeMonth || (m === fyeMonth && d > clampFyeDay(y, fyeMonth, fyeDay))
  const endYear = afterFye ? y + 1 : y
  const startYear = endYear - 1
  return {
    start: fixFyStart(startYear, fyeMonth, fyeDay),
    end: iso(endYear, fyeMonth, clampFyeDay(endYear, fyeMonth, fyeDay)),
    label: `AF ${startYear}–${endYear}`,
  }
}

export function calendarYearRange(ref: Date = new Date()): DateRange {
  const y = ref.getFullYear()
  return { start: `${y}-01-01`, end: `${y}-12-31`, label: `Année ${y}` }
}

export function monthToDateRange(ref: Date = new Date()): DateRange {
  const y = ref.getFullYear()
  const m = ref.getMonth() + 1
  const last = daysInMonth(y, m)
  return {
    start: iso(y, m, 1),
    end: iso(y, m, last),
    label: `Mois en cours`,
  }
}

export function allTimeRange(): DateRange {
  return { start: '', end: '', label: 'Tout' }
}

export function periodPresets(fyeMonth: number, fyeDay: number): DateRange[] {
  return [
    allTimeRange(),
    monthToDateRange(),
    calendarYearRange(),
    currentFiscalYearRangeFixed(fyeMonth, fyeDay),
  ]
}

export function inPeriod(date: string, range: DateRange): boolean {
  if (!range.start && !range.end) return true
  if (range.start && date < range.start) return false
  if (range.end && date > range.end) return false
  return true
}

/** Months between start and end inclusive for scheduled adjustments. */
export function monthsInRange(start: string, end: string, capEnd: string): string[] {
  const months: string[] = []
  const endCap = end < capEnd ? end : capEnd
  const [sy, sm] = start.split('-').map(Number)
  const [ey, em] = endCap.split('-').map(Number)
  let y = sy
  let m = sm
  while (y < ey || (y === ey && m <= em)) {
    months.push(iso(y, m, 1).slice(0, 7))
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return months
}

export function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return iso(y, m, daysInMonth(y, m))
}
