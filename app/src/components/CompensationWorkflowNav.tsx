import { WorkflowNav, type WorkflowStepDef } from './WorkflowNav'

export type CompensationStep = 'payroll' | 'dividends'

const steps: WorkflowStepDef[] = [
  { id: 'payroll', to: '/compensation/payroll', label: 'Salaire', hint: 'Paies et remises' },
  { id: 'dividends', to: '/compensation/dividends', label: 'Dividendes', hint: 'Distributions' },
]

const asideLinkByStep: Record<CompensationStep, { to: string; label: string }> = {
  payroll: { to: '/compensation/employees', label: 'Employés' },
  dividends: { to: '/compensation/shareholders', label: 'Actionnaires' },
}

export function CompensationWorkflowNav({ current }: { current?: CompensationStep }) {
  return (
    <WorkflowNav
      ariaLabel="Étapes rémunération"
      steps={steps}
      currentId={current}
      asideLink={current ? asideLinkByStep[current] : undefined}
    />
  )
}
