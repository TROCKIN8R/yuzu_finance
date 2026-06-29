import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchGeneralLedgerData, fetchFinancialReportExtras } from '../lib/glDataLoader'
import { buildFinancialSnapshot } from '../lib/financials'
import {
  buildCo17Schedule,
  buildT4Rl1Schedule,
  buildT5Schedule,
  downloadScheduleCsv,
} from '../lib/taxYearExports'
import type { Dividend, Employee, OrganizationSettings, PayrollRun, Shareholder } from '../lib/types'
import { Button } from '../components/Button'
import { Field, inputClass } from '../components/Field'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { AlertBanner } from '../components/AlertBanner'

export function TaxExportsPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [employees, setEmployees] = useState<Employee[]>([])
  const [payroll, setPayroll] = useState<PayrollRun[]>([])
  const [shareholders, setShareholders] = useState<Shareholder[]>([])
  const [dividends, setDividends] = useState<Dividend[]>([])
  const [allocations, setAllocations] = useState<{ shareholder_id: string; dividend_id: string; amount: number }[]>([])
  const [co17Ready, setCo17Ready] = useState(false)
  const [co17Input, setCo17Input] = useState<ReturnType<typeof buildCo17Schedule> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [year])

  async function load() {
    setError(null)
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`
    const [empRes, payRes, shRes, divRes, allocRes] = await Promise.all([
      supabase.from('employees').select('*').eq('active', true),
      supabase.from('payroll_runs').select('*').gte('payment_date', yearStart).lte('payment_date', yearEnd),
      supabase.from('shareholders').select('*').eq('active', true),
      supabase.from('dividends').select('*').gte('declared_date', yearStart).lte('declared_date', yearEnd),
      supabase.from('dividend_allocations').select('shareholder_id, dividend_id, amount'),
    ])

    setEmployees((empRes.data as Employee[]) ?? [])
    setPayroll((payRes.data as PayrollRun[]) ?? [])
    setShareholders((shRes.data as Shareholder[]) ?? [])
    setDividends((divRes.data as Dividend[]) ?? [])
    setAllocations(allocRes.data ?? [])

    if (shRes.error?.message.includes('shareholders')) {
      setError('Table shareholders manquante — exécutez la migration shareholders.')
    }

    try {
      const { data: glData } = await fetchGeneralLedgerData()
      const extras = await fetchFinancialReportExtras()
      const fin = buildFinancialSnapshot(
        {
          ...glData,
          bankTransactions: extras.bankTransactions,
          payrollRuns: (payRes.data ?? []) as PayrollRun[],
        },
        { start: yearStart, end: yearEnd, label: String(year) },
      )
      const settingsRow = glData.settings as OrganizationSettings | null | undefined
      setCo17Input(
        buildCo17Schedule({
          year,
          revenueSubtotal: fin.income.revenueSubtotal,
          operatingExpenses: fin.income.operatingExpenses,
          payrollGross: fin.income.payrollGross,
          employerPayrollContributions: fin.income.employerPayrollContributions,
          operatingIncome: fin.income.operatingIncome,
          corpTaxProvision: fin.balanceSheet.corpTaxProvision,
          corpTaxPaid: fin.cashFlow.corporateTaxPaid,
          estimatedRate: Number(settingsRow?.estimated_corp_tax_rate ?? 0.12),
        })
      )
      setCo17Ready(true)
    } catch {
      setCo17Ready(false)
    }
  }

  function exportT4Rl1() {
    downloadScheduleCsv(`t4-rl1-${year}-draft.csv`, buildT4Rl1Schedule(year, employees, payroll))
  }

  function exportT5() {
    downloadScheduleCsv(`t5-${year}-draft.csv`, buildT5Schedule(year, shareholders, dividends, allocations))
  }

  function exportCo17() {
    if (!co17Input) return
    downloadScheduleCsv(`co17-schedule-${year}-draft.csv`, co17Input)
  }

  return (
    <PageShell width="narrow">
      <PageHeader
        title="Calendriers fiscaux"
        subtitle="Export CSV T4/RL-1, T5 et échéancier CO-17 — brouillon pour CPA; ne remplace pas la production officielle."
      />

      {error && <AlertBanner variant="warning">{error}</AlertBanner>}

      <div className="card p-4 mb-6">
        <Field label="Année d'imposition">
          <input
            type="number"
            className={inputClass}
            min={2020}
            max={2100}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-4 space-y-3">
          <h2 className="font-semibold">T4 / RL-1 (paie)</h2>
          <p className="text-sm text-muted">
            Totaux par employé à partir des paies enregistrées ({payroll.length} période{payroll.length !== 1 ? 's' : ''}).
          </p>
          <Button type="button" onClick={exportT4Rl1}>
            Télécharger CSV
          </Button>
        </div>

        <div className="card p-4 space-y-3">
          <h2 className="font-semibold">T5 (dividendes)</h2>
          <p className="text-sm text-muted">
            Allocations par actionnaire ({dividends.length} déclaration{dividends.length !== 1 ? 's' : ''}).
          </p>
          <Button type="button" onClick={exportT5} disabled={shareholders.length === 0}>
            Télécharger CSV
          </Button>
        </div>

        <div className="card p-4 space-y-3 sm:col-span-2">
          <h2 className="font-semibold">CO-17 / T2 (société)</h2>
          <p className="text-sm text-muted">
            Sommaire du revenu d'exploitation et impôt estimé à partir du grand livre ({year}).
          </p>
          <Button type="button" onClick={exportCo17} disabled={!co17Ready}>
            Télécharger CSV
          </Button>
        </div>
      </div>
    </PageShell>
  )
}
