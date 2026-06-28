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
      className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
