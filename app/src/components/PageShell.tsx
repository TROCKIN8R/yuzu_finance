import type { ReactNode } from 'react'

type Width = 'full' | 'wide' | 'narrow'

const widthClass: Record<Width, string> = {
  full: '',
  wide: 'max-w-6xl',
  narrow: 'max-w-2xl',
}

export function PageShell({
  children,
  width = 'full',
  className = '',
}: {
  children: ReactNode
  width?: Width
  className?: string
}) {
  return <div className={`space-y-6 ${widthClass[width]} ${className}`.trim()}>{children}</div>
}
