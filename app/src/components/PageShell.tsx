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
  const spacing = /\bspace-y-/.test(className) ? '' : 'space-y-6'
  return <div className={`${spacing} ${widthClass[width]} ${className}`.trim()}>{children}</div>
}
