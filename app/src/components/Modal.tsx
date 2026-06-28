import type { ReactNode } from 'react'

export function Modal({
  title,
  open,
  onClose,
  children,
  wide,
}: {
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div
        className={`relative bg-white rounded-xl shadow-xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-lg">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
