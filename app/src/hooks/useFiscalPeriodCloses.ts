import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { FiscalPeriodClose } from '../lib/fiscalPeriodClose'

export function useFiscalPeriodCloses() {
  const [closes, setCloses] = useState<FiscalPeriodClose[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('fiscal_period_closes')
      .select('*')
      .order('period_end', { ascending: false })
    if (!error) setCloses((data as FiscalPeriodClose[]) ?? [])
    setLoading(false)
  }

  return { closes, loading, reload: load }
}
