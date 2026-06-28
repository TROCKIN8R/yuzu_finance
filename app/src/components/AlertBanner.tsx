import type { ReactNode } from 'react'

export function AlertBanner({ children, variant = 'warning' }: { children: ReactNode; variant?: 'warning' | 'success' | 'info' }) {
  const styles =
    variant === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : variant === 'info'
        ? 'border-sky-200 bg-sky-50 text-sky-900'
        : 'border-amber-200 bg-amber-50 text-amber-900'

  return <div className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>{children}</div>
}
