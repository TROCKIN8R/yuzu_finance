import { NavLink } from 'react-router-dom'

export type CompensationStep = 'payroll' | 'dividends'

const steps: { to: string; step: CompensationStep; label: string; hint: string }[] = [
  { to: '/compensation/payroll', step: 'payroll', label: 'Salaire', hint: 'Paies et remises' },
  { to: '/compensation/dividends', step: 'dividends', label: 'Dividendes', hint: 'Distributions' },
]

function stepClass(isActive: boolean) {
  return `flex-1 min-w-[8rem] rounded-lg border px-3 py-2.5 text-left transition-colors ${
    isActive
      ? 'border-yuzu bg-yuzu-light/60 shadow-sm'
      : 'border-border bg-white hover:border-yuzu/40 hover:bg-stone-50'
  }`
}

export function CompensationWorkflowNav({ current }: { current?: CompensationStep }) {
  return (
    <nav aria-label="Étapes rémunération" className="space-y-3">
      <ol className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory">
        {steps.map((s, i) => (
          <li key={s.to} className="flex items-stretch gap-2 shrink-0 snap-start">
            <NavLink to={s.to} className={({ isActive }) => stepClass(isActive || current === s.step)}>
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    current === s.step ? 'bg-yuzu text-ink' : 'bg-stone-100 text-muted'
                  }`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-tight">{s.label}</div>
                  <div className="text-[11px] text-muted leading-tight mt-0.5 hidden sm:block">{s.hint}</div>
                </div>
              </div>
            </NavLink>
            {i < steps.length - 1 && (
              <span className="hidden sm:flex items-center text-muted/40 px-0.5" aria-hidden>
                →
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
