import { useEffect, useState } from 'react'
import { fetchOrganizationSettings } from '../lib/dashboardData'
import { currentFiscalYearRangeFixed, periodPresets, type DateRange } from '../lib/fiscalPeriod'
import type { OrganizationSettings } from '../lib/types'

export function useDashboardPeriod() {
  const [period, setPeriod] = useState<DateRange | null>(null)
  const [presets, setPresets] = useState<DateRange[]>([])
  const [settings, setSettings] = useState<OrganizationSettings | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    fetchOrganizationSettings().then((orgSettings) => {
      setSettings(orgSettings)
      const fyeMonth = Number(orgSettings?.fiscal_year_end_month ?? 6)
      const fyeDay = Number(orgSettings?.fiscal_year_end_day ?? 30)
      const ranges = periodPresets(fyeMonth, fyeDay)
      setPresets(ranges)
      setPeriod(ranges.find((r) => r.label.startsWith('AF')) ?? ranges[0] ?? currentFiscalYearRangeFixed(fyeMonth, fyeDay))
      setReady(true)
    })
  }, [])

  return { period, setPeriod, presets, settings, ready }
}
