import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { buildFinancialSnapshot, type FinancialSnapshot } from '../lib/financials'
import { fetchFinancialReportExtras, fetchGeneralLedgerData } from '../lib/glDataLoader'
import { periodPresets, type DateRange } from '../lib/fiscalPeriod'
import type { OrganizationSettings } from '../lib/types'
import {
  BalanceSheetStatement,
  CashFlowStatement,
  IncomeStatement,
} from '../components/FinancialStatements'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { Button } from '../components/Button'
import { ViewToggle } from '../components/ListToolbar'
import {
  downloadAllFinancialReportsPdf,
  downloadFinancialReportPdf,
  type FinancialReportKind,
} from '../lib/financialReportPdf'

type ReportView = FinancialReportKind

export function FinancialReportsPage() {
  const [fin, setFin] = useState<FinancialSnapshot | null>(null)
  const [period, setPeriod] = useState<DateRange | null>(null)
  const [presets, setPresets] = useState<DateRange[]>([])
  const [settings, setSettings] = useState<OrganizationSettings | null>(null)
  const [view, setView] = useState<ReportView>('income')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (period) reloadFinancials(period)
  }, [period])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const { data: settingsRow } = await supabase.from('organization_settings').select('*').maybeSingle()
      const orgSettings = settingsRow ?? null
      setSettings(orgSettings)
      const fyeMonth = Number(orgSettings?.fiscal_year_end_month ?? 6)
      const fyeDay = Number(orgSettings?.fiscal_year_end_day ?? 30)
      const ranges = periodPresets(fyeMonth, fyeDay)
      setPresets(ranges)
      const initial = ranges.find((r) => r.label.startsWith('AF')) ?? ranges[0]
      setPeriod(initial)
      await reloadFinancials(initial, orgSettings ?? undefined)
    } catch (err) {
      console.error('Financial reports load failed:', err)
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement des rapports.')
    } finally {
      setLoading(false)
    }
  }

  async function reloadFinancials(range: DateRange, orgSettings?: OrganizationSettings) {
    const [{ data: glData }, extras, settingsRow] = await Promise.all([
      fetchGeneralLedgerData(),
      fetchFinancialReportExtras(),
      orgSettings ? Promise.resolve({ data: orgSettings }) : supabase.from('organization_settings').select('*').maybeSingle(),
    ])

    setFin(
      buildFinancialSnapshot(
        {
          ...glData,
          bankTransactions: extras.bankTransactions,
          settings: settingsRow.data ?? glData.settings ?? undefined,
        },
        range
      )
    )
  }

  if (loading || !period) return <div className="text-muted">Chargement…</div>

  if (error || !fin) {
    return (
      <PageShell>
        <div className="max-w-xl ui-card p-6 space-y-3">
          <h1 className="text-lg font-semibold">Rapports financiers</h1>
          <p className="text-sm text-red-700">{error ?? 'Données financières indisponibles.'}</p>
          <Button type="button" onClick={() => load()}>
            Réessayer
          </Button>
        </div>
      </PageShell>
    )
  }

  const periodLabel = period.label

  return (
    <PageShell>
      <PageHeader
        backTo={{ to: '/other', label: 'Autre' }}
        title="Rapports financiers"
        subtitle="État des résultats, bilan et flux de trésorerie — brouillon pour révision CPA."
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => downloadFinancialReportPdf(view, fin, settings)}>
              Télécharger PDF
            </Button>
            <Button type="button" variant="secondary" onClick={() => downloadAllFinancialReportsPdf(fin, settings)}>
              Tout en PDF
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <ViewToggle
          value={view}
          onChange={setView}
          options={[
            { value: 'income', label: 'État des résultats' },
            { value: 'balance-sheet', label: 'Bilan' },
            { value: 'cash-flow', label: 'Flux de trésorerie' },
          ]}
        />
        <select
          className="border border-border rounded-lg px-3 py-2 text-sm bg-white min-h-[44px]"
          value={presets.findIndex((p) => p.label === period.label && p.start === period.start && p.end === period.end)}
          onChange={(e) => setPeriod(presets[Number(e.target.value)])}
        >
          {presets.map((p, i) => (
            <option key={p.label} value={i}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-border rounded-xl p-5">
        {view === 'income' && <IncomeStatement fin={fin} periodLabel={periodLabel} />}
        {view === 'balance-sheet' && <BalanceSheetStatement fin={fin} periodLabel={periodLabel} />}
        {view === 'cash-flow' && <CashFlowStatement fin={fin} periodLabel={periodLabel} />}
      </div>
    </PageShell>
  )
}
