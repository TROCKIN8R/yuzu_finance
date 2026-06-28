import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-yuzu text-ink hover:bg-yuzu-dark font-medium',
  secondary: 'bg-white border border-border text-ink hover:bg-stone-50',
  ghost: 'text-muted hover:text-ink hover:bg-stone-100',
  danger: 'bg-red-50 text-red-700 hover:bg-red-100',
}

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 sm:min-h-[36px] sm:px-3 sm:py-2 rounded-lg text-sm transition-colors disabled:opacity-50 active:scale-[0.98] ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

/** Table row actions — touch-friendly on mobile, compact on desktop. */
export const tableActionClass = '!min-h-[44px] !min-w-[44px] sm:!min-h-[32px] sm:!min-w-0 !px-3 !py-2 sm:!px-2 sm:!py-1'
