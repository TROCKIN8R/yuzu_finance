import { useEffect, useState } from 'react'
import { fetchOrganizationSettings } from '../lib/dashboardData'
import {
  currentFiscalYearRangeFixed,
  DEFAULT_FISCAL_YEAR_END_DAY,
  DEFAULT_FISCAL_YEAR_END_MONTH,
  periodPresets,
  type DateRange,
} from '../lib/fiscalPeriod'
import type { OrganizationSettings } from '../lib/types'

function initPeriod(fyeMonth: number, fyeDay: number) {
  const fy = currentFiscalYearRangeFixed(fyeMonth, fyeDay)
  const ranges = periodPresets(fyeMonth, fyeDay)
  const selected = ranges.find((r) => r.label === fy.label && r.start === fy.start && r.end === fy.end) ?? fy
  return { ranges, selected }
}

export function useDashboardPeriod() {
  const [period, setPeriod] = useState<DateRange | null>(null)
  const [presets, setPresets] = useState<DateRange[]>([])
  const [settings, setSettings] = useState<OrganizationSettings | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    fetchOrganizationSettings()
      .then((orgSettings) => {
        setSettings(orgSettings)
        const { ranges, selected } = initPeriod(DEFAULT_FISCAL_YEAR_END_MONTH, DEFAULT_FISCAL_YEAR_END_DAY)
        setPresets(ranges)
        setPeriod(selected)
        setReady(true)
      })
      .catch((err) => {
        console.error('Dashboard period init failed:', err)
        const { ranges, selected } = initPeriod(DEFAULT_FISCAL_YEAR_END_MONTH, DEFAULT_FISCAL_YEAR_END_DAY)
        setPresets(ranges)
        setPeriod(selected)
        setReady(true)
      })
  }, [])

  return { period, setPeriod, presets, settings, ready }
}
