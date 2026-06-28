import type { ReactNode } from 'react'

export function Field({
  label,
  children,
  className = '',
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-muted mb-1">{label}</span>
      {children}
    </label>
  )
}

export const inputClass =
  'w-full px-3 py-2 rounded-lg border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-yuzu/40 focus:border-yuzu'
