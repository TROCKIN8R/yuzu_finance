import type { ReactNode } from 'react'

const styles: Record<string, string> = {
  draft: 'bg-stone-100 text-stone-600',
  sent: 'bg-blue-50 text-blue-700',
  partial: 'bg-yuzu-light text-yuzu-dark',
  paid: 'bg-emerald-50 text-emerald-700',
  void: 'bg-red-50 text-red-600',
  active: 'bg-emerald-50 text-emerald-700',
  on_hold: 'bg-amber-50 text-amber-700',
  completed: 'bg-stone-100 text-stone-600',
  archived: 'bg-stone-100 text-stone-500',
  invoiced: 'bg-emerald-50 text-emerald-700',
  unbilled: 'bg-yuzu-light text-yuzu-dark',
}

export function Badge({ label, tone = 'draft' }: { label: string; tone?: string }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${styles[tone] ?? styles.draft}`}>
      {label}
    </span>
  )
}
