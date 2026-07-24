import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Project, ProjectWeekPlan } from '../lib/types'
import { formatCad, numberFieldValue, parseNumberField, relationOne, todayIso } from '../lib/format'
import { projectAmountLabel } from '../lib/invoice'
import {
  cellRevenue,
  formatWeekLabel,
  hoursKey,
  plansToHoursMap,
  projectRowTotals,
  startOfWeekMonday,
  totalHoursByProject,
  weekColumnTotals,
  weeksForNextMonths,
  type PipelineProject,
} from '../lib/pipeline'
import { Badge } from '../components/Badge'
import { EmptyState } from '../components/EmptyState'
import { WorkflowFooter } from '../components/WorkflowFooter'

type BillingOutletContext = { refreshMetrics?: () => void }

const HORIZON_MONTHS = 6
const PIPELINE_STATUSES = new Set(['active', 'on_hold'])

export function PipelinePage() {
  const { refreshMetrics } = useOutletContext<BillingOutletContext>() ?? {}
  const [projects, setProjects] = useState<PipelineProject[]>([])
  const [plans, setPlans] = useState<ProjectWeekPlan[]>([])
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const draftRef = useRef<Map<string, string>>(new Map())
  const [, bump] = useState(0)

  const thisWeek = startOfWeekMonday(todayIso())
  const weeks = useMemo(() => weeksForNextMonths(todayIso(), HORIZON_MONTHS), [])

  const visibleProjects = useMemo(
    () => projects.filter((p) => PIPELINE_STATUSES.has(p.status)).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [projects]
  )

  const hoursMap = useMemo(() => plansToHoursMap(plans), [plans])
  const totalsByProject = useMemo(
    () => totalHoursByProject(hoursMap, visibleProjects.map((p) => p.id)),
    [hoursMap, visibleProjects]
  )

  const grand = useMemo(() => {
    let hours = 0
    let amount = 0
    for (const p of visibleProjects) {
      const row = projectRowTotals(p, weeks, hoursMap, totalsByProject.get(p.id) ?? 0)
      hours += row.hours
      amount += row.amount
    }
    return { hours: Math.round(hours * 100) / 100, amount: Math.round(amount * 100) / 100 }
  }, [visibleProjects, weeks, hoursMap, totalsByProject])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setError(null)
    const [p, w] = await Promise.all([
      supabase.from('projects').select('id, name, billing_type, default_hourly_rate, fixed_price, status, partner_id, partners(legal_name)').order('name'),
      supabase.from('project_week_plans').select('*'),
    ])
    if (p.error) {
      setError(p.error.message)
      return
    }
    if (w.error) {
      setError(
        w.error.message.includes('project_week_plans')
          ? 'Table project_week_plans manquante — exécutez la migration supabase/migrations/20260724230000_project_week_plans.sql'
          : w.error.message
      )
      return
    }
    setProjects((p.data as PipelineProject[]) ?? [])
    setPlans((w.data as ProjectWeekPlan[]) ?? [])
    refreshMetrics?.()
  }

  function displayHours(projectId: string, week: string): string {
    const key = hoursKey(projectId, week)
    if (draftRef.current.has(key)) return draftRef.current.get(key)!
    return numberFieldValue(hoursMap.get(key) ?? 0)
  }

  function onHoursChange(projectId: string, week: string, raw: string) {
    const key = hoursKey(projectId, week)
    draftRef.current.set(key, raw)
    bump((n) => n + 1)
  }

  async function commitHours(projectId: string, week: string) {
    const key = hoursKey(projectId, week)
    const raw = draftRef.current.get(key)
    if (raw === undefined) return
    draftRef.current.delete(key)

    const hours = Math.max(0, Math.round(parseNumberField(raw) * 100) / 100)
    const prev = hoursMap.get(key) ?? 0
    if (hours === prev) {
      bump((n) => n + 1)
      return
    }

    setSavingKey(key)
    setError(null)

    // Optimistic local update
    setPlans((current) => {
      const existing = current.find((r) => r.project_id === projectId && r.week_start === week)
      if (hours === 0) {
        return current.filter((r) => !(r.project_id === projectId && r.week_start === week))
      }
      if (existing) {
        return current.map((r) => (r.id === existing.id ? { ...r, hours } : r))
      }
      return [
        ...current,
        {
          id: `temp-${key}`,
          user_id: '',
          project_id: projectId,
          week_start: week,
          hours,
          created_at: '',
          updated_at: '',
        },
      ]
    })

    try {
      if (hours === 0) {
        const { error: delErr } = await supabase
          .from('project_week_plans')
          .delete()
          .eq('project_id', projectId)
          .eq('week_start', week)
        if (delErr) throw delErr
      } else {
        const existing = plans.find((r) => r.project_id === projectId && r.week_start === week && !r.id.startsWith('temp-'))
        if (existing) {
          const { data, error: updErr } = await supabase
            .from('project_week_plans')
            .update({ hours })
            .eq('id', existing.id)
            .select()
            .maybeSingle()
          if (updErr) throw updErr
          if (data) {
            setPlans((current) => current.map((r) => (r.id === existing.id ? (data as ProjectWeekPlan) : r)))
          }
        } else {
          const { data, error: insErr } = await supabase
            .from('project_week_plans')
            .insert({ project_id: projectId, week_start: week, hours })
            .select()
            .maybeSingle()
          if (insErr) throw insErr
          if (data) {
            setPlans((current) => {
              const withoutTemp = current.filter(
                (r) => !(r.project_id === projectId && r.week_start === week)
              )
              return [...withoutTemp, data as ProjectWeekPlan]
            })
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur d’enregistrement')
      await load()
    } finally {
      setSavingKey(null)
      bump((n) => n + 1)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-ink">Pipeline</h2>
        <p className="text-sm text-muted mt-0.5">
          Prochains {HORIZON_MONTHS} mois · heures prévues par semaine · revenus estimés (horaire × taux, forfait au
          prorata)
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}

      {visibleProjects.length === 0 ? (
        <EmptyState message="Aucun projet actif ou en pause — créez-en un pour planifier la charge et les revenus." />
      ) : (
        <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-white">
          <table className="min-w-max w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-stone-50/80">
                <th className="sticky left-0 z-20 bg-stone-50 px-3 py-2.5 text-left font-medium text-muted min-w-[220px] border-r border-border">
                  Projet
                </th>
                {weeks.map((week) => {
                  const label = formatWeekLabel(week)
                  const isCurrent = week === thisWeek
                  return (
                    <th
                      key={week}
                      className={`px-2 py-2.5 text-center font-medium min-w-[88px] ${
                        isCurrent ? 'bg-yuzu/10 text-yuzu-dark' : 'text-muted'
                      }`}
                    >
                      <div className="text-xs font-semibold">{label.week}</div>
                      <div className="text-[10px] font-normal whitespace-nowrap opacity-80">{label.range}</div>
                    </th>
                  )
                })}
                <th className="sticky right-0 z-20 bg-stone-50 px-3 py-2.5 text-right font-medium text-muted min-w-[100px] border-l border-border">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleProjects.map((project) => {
                const row = projectRowTotals(project, weeks, hoursMap, totalsByProject.get(project.id) ?? 0)
                const partner = relationOne(project.partners)?.legal_name
                return (
                  <tr key={project.id} className="border-b border-border/70 hover:bg-stone-50/40">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 border-r border-border align-top">
                      <div className="font-medium text-ink leading-tight">{project.name}</div>
                      <div className="text-xs text-muted truncate max-w-[200px]">{partner ?? '—'}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <Badge
                          label={project.billing_type === 'fixed' ? 'Forfait' : 'Horaire'}
                          tone={project.billing_type === 'fixed' ? 'partial' : 'sent'}
                        />
                        <span className="text-[11px] text-muted tabular-nums">
                          {projectAmountLabel(project as Project)}
                        </span>
                      </div>
                    </td>
                    {weeks.map((week) => {
                      const key = hoursKey(project.id, week)
                      const h = hoursMap.get(key) ?? 0
                      const draft = draftRef.current.get(key)
                      const weekHours = draft !== undefined ? parseNumberField(draft) : h
                      const amount = cellRevenue(project, weekHours, totalsByProject.get(project.id) ?? 0)
                      const isCurrent = week === thisWeek
                      return (
                        <td
                          key={week}
                          className={`px-1.5 py-1.5 text-center align-top ${isCurrent ? 'bg-yuzu/5' : ''}`}
                        >
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step={0.25}
                            aria-label={`Heures ${project.name} ${week}`}
                            className="w-full max-w-[72px] mx-auto block px-1.5 py-1 rounded-md border border-border bg-white text-center text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-yuzu/40 focus:border-yuzu"
                            value={displayHours(project.id, week)}
                            disabled={savingKey === key}
                            onChange={(e) => onHoursChange(project.id, week, e.target.value)}
                            onBlur={() => void commitHours(project.id, week)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                            }}
                          />
                          <div
                            className={`mt-0.5 text-[10px] tabular-nums ${
                              amount > 0 ? 'text-ink/70' : 'text-transparent'
                            }`}
                          >
                            {formatCad(amount)}
                          </div>
                        </td>
                      )
                    })}
                    <td className="sticky right-0 z-10 bg-white px-3 py-2 text-right border-l border-border align-top">
                      <div className="font-semibold tabular-nums">{row.hours} h</div>
                      <div className="text-xs text-muted tabular-nums">{formatCad(row.amount)}</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-stone-50/90 border-t border-border font-medium">
                <td className="sticky left-0 z-10 bg-stone-50 px-3 py-2.5 border-r border-border">
                  Totaux ({weeks.length} sem.)
                </td>
                {weeks.map((week) => {
                  const col = weekColumnTotals(visibleProjects, week, hoursMap, totalsByProject)
                  return (
                    <td key={week} className="px-1.5 py-2 text-center">
                      <div className="text-xs tabular-nums">{col.hours} h</div>
                      <div className="text-[10px] text-muted tabular-nums">{formatCad(col.amount)}</div>
                    </td>
                  )
                })}
                <td className="sticky right-0 z-10 bg-stone-50 px-3 py-2.5 text-right border-l border-border">
                  <div className="font-semibold tabular-nums">{grand.hours} h</div>
                  <div className="text-xs text-muted tabular-nums">{formatCad(grand.amount)}</div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-xs text-muted">
        Faites défiler horizontalement pour voir toutes les semaines. Forfaits : montant réparti au prorata de toutes
        les heures planifiées du projet.
      </p>

      <WorkflowFooter to="/billing/time" label="Enregistrer du temps">
        Prêt à saisir les heures réelles ?
      </WorkflowFooter>
    </div>
  )
}
