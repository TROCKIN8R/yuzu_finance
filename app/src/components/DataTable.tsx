import type { ReactNode } from 'react'

export function DataTable({
  children,
  minWidth = 720,
  className = '',
}: {
  children: ReactNode
  minWidth?: number
  className?: string
}) {
  return (
    <div className={`bg-white border border-border rounded-xl overflow-hidden ${className}`}>
      <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
        <table className="w-full text-sm" style={{ minWidth }}>
          {children}
        </table>
      </div>
    </div>
  )
}
