import { useEffect, type ReactNode } from 'react'

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
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
        aria-label="Fermer"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`relative bg-white shadow-xl w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain rounded-t-2xl sm:rounded-xl safe-bottom`}
      >
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-border sticky top-0 bg-white z-10">
          <h2 id="modal-title" className="font-semibold text-lg pr-2">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-stone-100 text-2xl leading-none"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  )
}
