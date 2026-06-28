import { WorkflowNav, type WorkflowStepDef, type WorkflowTerminalStep } from './WorkflowNav'

export type BillingStep = 'projects' | 'time' | 'invoices'

const steps: WorkflowStepDef[] = [
  { id: 'projects', to: '/billing/projects', label: 'Projets', hint: 'Mandats et tarifs' },
  { id: 'time', to: '/billing/time', label: 'Temps', hint: 'Heures facturables' },
  { id: 'invoices', to: '/billing/invoices', label: 'Factures', hint: 'Émission et suivi' },
]

const terminal: WorkflowTerminalStep[] = [
  { to: '/bank', label: 'Encaissement', hint: 'Banque', stepNumber: 4, dashed: true },
]

export function BillingWorkflowNav({ current }: { current?: BillingStep }) {
  return (
    <WorkflowNav
      ariaLabel="Étapes de facturation"
      steps={steps}
      currentId={current}
      terminalSteps={terminal}
    />
  )
}
