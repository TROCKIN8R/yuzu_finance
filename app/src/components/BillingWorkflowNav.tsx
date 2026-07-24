import { WorkflowNav, type WorkflowStepDef, type WorkflowTerminalStep } from './WorkflowNav'

export type BillingStep = 'projects' | 'pipeline' | 'time' | 'invoices'

const steps: WorkflowStepDef[] = [
  { id: 'projects', to: '/billing/projects', label: 'Projets', hint: 'Mandats et tarifs' },
  { id: 'pipeline', to: '/billing/pipeline', label: 'Pipeline', hint: 'Charge et revenus prévus' },
  { id: 'time', to: '/billing/time', label: 'Temps', hint: 'Heures facturables' },
  { id: 'invoices', to: '/billing/invoices', label: 'Factures', hint: 'Émission et suivi' },
]

const terminal: WorkflowTerminalStep[] = [
  { to: '/bank', label: 'Encaissement', hint: 'Banque', stepNumber: 5, dashed: true },
]

export function BillingWorkflowNav({ current }: { current?: BillingStep }) {
  return (
    <WorkflowNav
      ariaLabel="Étapes de facturation"
      steps={steps}
      currentId={current}
      terminalSteps={terminal}
      variant="tabs"
    />
  )
}
