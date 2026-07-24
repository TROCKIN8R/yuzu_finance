import { useState, type ReactNode } from 'react'
import { inputClass } from './Field'

export function ListToolbar({
  search,
  onSearchChange,
  searchPlaceholder = 'Rechercher…',
  children,
  resultCount,
  totalCount,
  activeFilterCount = 0,
  onClearFilters,
  clearVisible = false,
  trailing,
  hideSearch = false,
  variant = 'card',
}: {
  search: string
  onSearchChange: (v: string) => void
  searchPlaceholder?: string
  children?: ReactNode
  resultCount?: number
  totalCount?: number
  activeFilterCount?: number
  onClearFilters?: () => void
  clearVisible?: boolean
  trailing?: ReactNode
  hideSearch?: boolean
  /** `plain` — borderless dense bar for workflow pages. */
  variant?: 'card' | 'plain'
}) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const hasFilterControls = !!children
  const showCount = resultCount != null && totalCount != null
  const plain = variant === 'plain'

  return (
    <div
      className={
        plain
          ? 'mb-3 space-y-2'
          : 'ui-card p-3 sm:p-4 mb-4 space-y-3'
      }
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        {!hideSearch && (
          <div className="relative flex-1 w-full sm:max-w-sm">
            <input
              type="search"
              className={`${inputClass} pl-9`}
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Rechercher"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm pointer-events-none" aria-hidden>
              ⌕
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap sm:ml-auto">
          {hasFilterControls && (
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              className="sm:hidden min-h-[44px] px-3 rounded-lg border border-border bg-white text-sm font-medium flex items-center gap-2"
              aria-expanded={filtersOpen}
            >
              Filtres
              {activeFilterCount > 0 && (
                <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-yuzu text-[11px] font-semibold text-ink px-1">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}
          {clearVisible && onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="min-h-[44px] sm:min-h-[36px] px-3 rounded-lg border border-border bg-stone-50 text-sm text-muted hover:text-ink hover:bg-stone-100"
            >
              Réinitialiser
            </button>
          )}
          {trailing}
        </div>
      </div>

      {hasFilterControls && (
        <div
          className={`${
            filtersOpen ? 'block' : 'hidden'
          } sm:block ${plain ? '' : 'pt-1 sm:pt-0 border-t sm:border-t-0 border-border sm:border-0'}`}
        >
          <div
            className={`flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end ${
              plain ? 'sm:pt-0' : 'pt-3 sm:pt-0 gap-3'
            }`}
          >
            {children}
          </div>
        </div>
      )}

      {showCount && (
        <p className={`text-xs text-muted ${plain ? '' : 'pt-0.5 border-t border-border sm:border-0'}`}>
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
    <label className={`flex flex-col gap-1 text-sm min-w-[9rem] ${className}`}>
      <span className="text-muted text-xs font-medium">{label}</span>
      <select className="ui-filter-input w-full" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function FilterChips<T extends string>({
  value,
  onChange,
  options,
  label = 'Affichage',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label?: string
}) {
  return (
    <div className="flex flex-col gap-1 min-w-[12rem]">
      <span className="text-muted text-xs font-medium">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`min-h-[44px] sm:min-h-[36px] px-3 py-2 sm:py-1.5 rounded-lg text-sm transition-colors active:scale-[0.98] ${
              value === o.value ? 'bg-yuzu-light font-medium text-ink ring-1 ring-yuzu/30' : 'text-muted hover:bg-stone-100 border border-transparent hover:border-border'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
  label = 'Période',
}: {
  from: string
  to: string
  onFromChange: (v: string) => void
  onToChange: (v: string) => void
  label?: string
}) {
  return (
    <div className="flex flex-col gap-1 min-w-[14rem]">
      <span className="text-muted text-xs font-medium">{label}</span>
      <div className="flex flex-wrap items-center gap-2 ui-card px-2 py-1.5">
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-muted text-xs">Du</span>
          <input type="date" className="ui-filter-input py-1.5" value={from} onChange={(e) => onFromChange(e.target.value)} />
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-muted text-xs">au</span>
          <input type="date" className="ui-filter-input py-1.5" value={to} onChange={(e) => onToChange(e.target.value)} />
        </label>
      </div>
    </div>
  )
}

/** @deprecated Use ListToolbar onClearFilters + clearVisible instead. */
export function ClearFiltersButton({ onClick, visible }: { onClick: () => void; visible: boolean }) {
  if (!visible) return null
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[44px] sm:min-h-[36px] px-3 rounded-lg border border-border bg-stone-50 text-sm text-muted hover:text-ink"
    >
      Réinitialiser
    </button>
  )
}

export function ViewToggle<T extends string>({
  value,
  onChange,
  options,
  label = 'Vue',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label?: string
}) {
  return <FilterChips value={value} onChange={onChange} options={options} label={label} />
}
