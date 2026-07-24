import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from 'react'
import {
  areAmountsHidden,
  setAmountsHidden,
  subscribeAmountsHidden,
  toggleAmountsHidden as toggleStore,
} from '../lib/amountPrivacy'

type AmountPrivacy = {
  amountsHidden: boolean
  setAmountsHidden: (hidden: boolean) => void
  toggleAmountsHidden: () => void
}

const AmountPrivacyContext = createContext<AmountPrivacy | null>(null)

function getSnapshot() {
  return areAmountsHidden()
}

function getServerSnapshot() {
  return false
}

export function AmountPrivacyProvider({ children }: { children: ReactNode }) {
  const amountsHidden = useSyncExternalStore(subscribeAmountsHidden, getSnapshot, getServerSnapshot)

  const setHidden = useCallback((next: boolean) => {
    setAmountsHidden(next)
  }, [])

  const toggle = useCallback(() => {
    toggleStore()
  }, [])

  return (
    <AmountPrivacyContext.Provider
      value={{ amountsHidden, setAmountsHidden: setHidden, toggleAmountsHidden: toggle }}
    >
      {children}
    </AmountPrivacyContext.Provider>
  )
}

export function useAmountPrivacy(): AmountPrivacy {
  const ctx = useContext(AmountPrivacyContext)
  if (!ctx) throw new Error('useAmountPrivacy must be used within AmountPrivacyProvider')
  return ctx
}
