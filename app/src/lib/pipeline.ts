import type { Project, ProjectWeekPlan } from './types'
import { addDays, lineAmount } from './format'

function round2(n: number) {
  return Math.round(n * 100) / 100
}

/** Monday (ISO) of the week containing `iso` (YYYY-MM-DD). */
export function startOfWeekMonday(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  const day = d.getDay() // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

export function addWeeks(weekStart: string, weeks: number): string {
  return addDays(weekStart, weeks * 7)
}

/** Consecutive Monday dates starting at `weekStart` (already a Monday). */
export function weekStarts(weekStart: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addWeeks(weekStart, i))
}

/**
 * Mondays from the current week through the week that contains `fromIso + months`.
 * Typical span: ~26 weeks for 6 months.
 */
export function weeksForNextMonths(fromIso: string, months: number): string[] {
  const start = startOfWeekMonday(fromIso)
  const endDate = new Date(fromIso + 'T12:00:00')
  endDate.setMonth(endDate.getMonth() + months)
  const last = startOfWeekMonday(endDate.toISOString().slice(0, 10))
  const weeks: string[] = []
  let cursor = start
  while (cursor <= last) {
    weeks.push(cursor)
    cursor = addWeeks(cursor, 1)
  }
  return weeks
}

/** ISO-8601 week number for a date (week_start should be a Monday). */
export function isoWeekNumber(weekStart: string): number {
  const date = new Date(weekStart + 'T12:00:00')
  const tmp = new Date(date.getTime())
  tmp.setHours(0, 0, 0, 0)
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7))
  const week1 = new Date(tmp.getFullYear(), 0, 4)
  return (
    1 +
    Math.round(((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  )
}

export function formatWeekLabel(weekStart: string): { week: string; range: string } {
  const end = addDays(weekStart, 6)
  const fmt = new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'short' })
  const startLabel = fmt.format(new Date(weekStart + 'T12:00:00'))
  const endLabel = fmt.format(new Date(end + 'T12:00:00'))
  return {
    week: `S${isoWeekNumber(weekStart)}`,
    range: `${startLabel} – ${endLabel}`,
  }
}

export type PipelineProject = Pick<
  Project,
  'id' | 'name' | 'billing_type' | 'default_hourly_rate' | 'fixed_price' | 'status' | 'partner_id'
> & {
  partners?: { legal_name: string } | { legal_name: string }[] | null
}

export function hoursKey(projectId: string, weekStart: string): string {
  return `${projectId}|${weekStart}`
}

/** Map of projectId|weekStart → hours from plan rows. */
export function plansToHoursMap(plans: Pick<ProjectWeekPlan, 'project_id' | 'week_start' | 'hours'>[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const p of plans) {
    map.set(hoursKey(p.project_id, p.week_start), Number(p.hours) || 0)
  }
  return map
}

/** Total planned hours per project (all weeks). */
export function totalHoursByProject(hoursMap: Map<string, number>, projectIds: string[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const id of projectIds) totals.set(id, 0)
  for (const [key, hours] of hoursMap) {
    const projectId = key.split('|')[0]
    if (!totals.has(projectId)) continue
    totals.set(projectId, (totals.get(projectId) ?? 0) + hours)
  }
  return totals
}

/**
 * Expected revenue for a project-week cell.
 * - Hourly: hours × rate
 * - Fixed: fixed_price × (weekHours / totalPlannedHours) — 0 if no hours planned yet
 */
export function cellRevenue(
  project: Pick<PipelineProject, 'billing_type' | 'default_hourly_rate' | 'fixed_price'>,
  weekHours: number,
  projectTotalHours: number
): number {
  if (weekHours <= 0) return 0
  if (project.billing_type === 'fixed') {
    const price = Number(project.fixed_price) || 0
    if (projectTotalHours <= 0) return 0
    return round2(price * (weekHours / projectTotalHours))
  }
  return lineAmount(weekHours, Number(project.default_hourly_rate) || 0)
}

export function projectRowTotals(
  project: PipelineProject,
  weeks: string[],
  hoursMap: Map<string, number>,
  projectTotalHours: number
): { hours: number; amount: number } {
  let hours = 0
  let amount = 0
  for (const week of weeks) {
    const h = hoursMap.get(hoursKey(project.id, week)) ?? 0
    hours += h
    amount += cellRevenue(project, h, projectTotalHours)
  }
  return { hours: round2(hours), amount: round2(amount) }
}

export function weekColumnTotals(
  projects: PipelineProject[],
  week: string,
  hoursMap: Map<string, number>,
  totalsByProject: Map<string, number>
): { hours: number; amount: number } {
  let hours = 0
  let amount = 0
  for (const p of projects) {
    const h = hoursMap.get(hoursKey(p.id, week)) ?? 0
    hours += h
    amount += cellRevenue(p, h, totalsByProject.get(p.id) ?? 0)
  }
  return { hours: round2(hours), amount: round2(amount) }
}
