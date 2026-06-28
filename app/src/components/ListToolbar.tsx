import type { ReactNode } from 'react'
import { inputClass } from './Field'

export function ListToolbar({
  search,
  onSearchChange,
  searchPlaceholder = 'Rechercher…',
  children,
  resultCount,
  totalCount,
}: {
  search: string
  onSearchChange: (v: string) => void
  searchPlaceholder?: string
  children?: ReactNode
  resultCount?: number
  totalCount?: number
}) {
  const showCount = resultCount != null && totalCount != null
  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1 max-w-md">
          <input
            type="search"
            className={`${inputClass} pl-9`}
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm pointer-events-none">⌕</span>
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
      {showCount && (
        <p className="text-xs text-muted">
          {resultCount === totalCount
            ? `${totalCount} résultat${totalCount !== 1 ? 's' : ''}`
            : `${resultCount} sur ${totalCount}`}
        </p>
      )}
    </div>
  )
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  className = '',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  className?: string
}) {
  return (
    <label className={`inline-flex items-center gap-1.5 text-sm ${className}`}>
      <span className="text-muted text-xs whitespace-nowrap">{label}</span>
      <select
        className="px-2 py-1.5 rounded-lg border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-yuzu/40"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

export function FilterChips<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            value === o.value ? 'bg-yuzu-light font-medium text-ink' : 'text-muted hover:bg-stone-100'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
}: {
  from: string
  to: string
  onFromChange: (v: string) => void
  onToChange: (v: string) => void
}) {
  return (
    <div className="inline-flex items-center gap-2 text-sm flex-wrap">
      <span className="text-muted text-xs">Du</span>
      <input
        type="date"
        className="px-2 py-1.5 rounded-lg border border-border bg-white text-sm"
        value={from}
        onChange={(e) => onFromChange(e.target.value)}
      />
      <span className="text-muted text-xs">au</span>
      <input
        type="date"
        className="px-2 py-1.5 rounded-lg border border-border bg-white text-sm"
        value={to}
        onChange={(e) => onToChange(e.target.value)}
      />
    </div>
  )
}

export function ClearFiltersButton({ onClick, visible }: { onClick: () => void; visible: boolean }) {
  if (!visible) return null
  return (
    <button type="button" onClick={onClick} className="text-xs text-muted hover:text-ink underline">
      Réinitialiser filtres
    </button>
  )
}
