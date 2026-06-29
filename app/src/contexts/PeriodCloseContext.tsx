import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { useFiscalPeriodCloses } from '../hooks/useFiscalPeriodCloses'
import {
  firstClosedDateMessage,
  isDateInClosedPeriod,
  type FiscalPeriodClose,
} from '../lib/fiscalPeriodClose'

type PeriodCloseGuard = {
  closes: FiscalPeriodClose[]
  loading: boolean
  reload: () => Promise<void>
  isClosed: (isoDate: string) => boolean
  /** Shows an alert and returns true when any date falls in a closed month. */
  blockIfClosed: (...dates: (string | null | undefined)[]) => boolean
}

const PeriodCloseContext = createContext<PeriodCloseGuard | null>(null)

export function PeriodCloseProvider({ children }: { children: ReactNode }) {
  const { closes, loading, reload } = useFiscalPeriodCloses()

  const isClosed = useCallback((isoDate: string) => isDateInClosedPeriod(isoDate, closes), [closes])

  const blockIfClosed = useCallback(
    (...dates: (string | null | undefined)[]) => {
      const msg = firstClosedDateMessage(dates, closes)
      if (msg) {
        alert(msg)
        return true
      }
      return false
    },
    [closes]
  )

  return (
    <PeriodCloseContext.Provider value={{ closes, loading, reload, isClosed, blockIfClosed }}>
      {children}
    </PeriodCloseContext.Provider>
  )
}

export function usePeriodCloseGuard(): PeriodCloseGuard {
  const ctx = useContext(PeriodCloseContext)
  if (!ctx) throw new Error('usePeriodCloseGuard must be used within PeriodCloseProvider')
  return ctx
}
