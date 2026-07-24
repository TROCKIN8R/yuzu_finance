import type { ReactNode } from 'react'

const headerControlClass =
  'w-full min-w-0 min-h-[32px] px-2 py-1 rounded-md border border-border bg-white text-xs text-ink font-normal focus:outline-none focus:ring-2 focus:ring-yuzu/40'

export function FilterTh({
  label,
  children,
  className = '',
}: {
  label: string
  children?: ReactNode
  className?: string
}) {
  return (
    <th className={`px-3 py-2.5 font-medium text-left align-bottom ${className}`}>
      <div className="flex flex-col gap-1.5 min-w-0">
        <span className="text-muted text-xs uppercase tracking-wide">{label}</span>
        {children}
      </div>
    </th>
  )
}

export function PlainTh({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th className={`px-3 py-2.5 font-medium text-left align-bottom text-muted text-xs uppercase tracking-wide ${className}`}>
      {children}
    </th>
  )
}

export function HeaderSearch({
  value,
  onChange,
  placeholder = 'Filtrer…',
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  'aria-label'?: string
}) {
  return (
    <input
      type="search"
      className={headerControlClass}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel ?? placeholder}
    />
  )
}

export function HeaderSelect({
  value,
  onChange,
  options,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  'aria-label'?: string
}) {
  return (
    <select
      className={headerControlClass}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
    >
      {options.map((o) => (
        <option key={o.value || '__all'} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function HeaderDateRange({
  from,
  to,
  onFromChange,
  onToChange,
  'aria-label': ariaLabel = 'Période',
}: {
  from: string
  to: string
  onFromChange: (v: string) => void
  onToChange: (v: string) => void
  'aria-label'?: string
}) {
  return (
    <div className="flex flex-col gap-1 min-w-[7.5rem]" aria-label={ariaLabel}>
      <input
        type="date"
        className={headerControlClass}
        value={from}
        onChange={(e) => onFromChange(e.target.value)}
        aria-label="Du"
      />
      <input
        type="date"
        className={headerControlClass}
        value={to}
        onChange={(e) => onToChange(e.target.value)}
        aria-label="Au"
      />
    </div>
  )
}

/** Compact count + clear row above a column-filtered table. */
export function FilterSummary({
  resultCount,
  totalCount,
  hasFilters,
  onClear,
  actions,
}: {
  resultCount: number
  totalCount: number
  hasFilters: boolean
  onClear: () => void
  actions?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-[2.25rem]">
      <p className="text-xs text-muted">
        {resultCount === totalCount
          ? `${totalCount} résultat${totalCount !== 1 ? 's' : ''}`
          : `${resultCount} sur ${totalCount}`}
        {hasFilters && (
          <>
            {' · '}
            <button type="button" onClick={onClear} className="text-yuzu-dark hover:underline font-medium">
              Réinitialiser
            </button>
          </>
        )}
      </p>
      {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
