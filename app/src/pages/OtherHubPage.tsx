import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { HubCard } from '../components/HubCard'

export function OtherHubPage() {
  return (
    <PageShell width="narrow">
      <PageHeader
        title="Autre"
        subtitle="Fiscalité, comptabilité et outils complémentaires — brouillon pour révision CPA."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <HubCard
          to="/sales-tax"
          title="TPS / TVQ"
          description="Périodes de déclaration, CTI/RTI et remises."
          badge="Trimestriel"
        />
        <HubCard
          to="/corporate-tax"
          title="Impôts société"
          description="Provisions et paiements T2 / CO-17."
          badge="Annuel"
        />
        <HubCard
          to="/employee-expenses"
          title="Frais à rembourser"
          description="Dépenses employé payées personnellement, remboursées via la paie."
        />
        <HubCard
          to="/financial-reports"
          title="Rapports financiers"
          description="État des résultats, bilan et flux de trésorerie — export PDF."
        />
        <HubCard
          to="/tax-exports"
          title="Calendriers fiscaux"
          description="Export CSV T4/RL-1, T5 et échéancier CO-17 — brouillon CPA."
        />
        <HubCard
          to="/period-close"
          title="Clôture de période"
          description="Verrouille un mois : paie, banque, factures, temps, taxes, ajustements."
        />
        <HubCard to="/ledger" title="Grand livre" description="Journal des écritures et balance de vérification." />
        <HubCard
          to="/adjustments"
          title="Ajustements"
          description="Charges payées d'avance, à payer, amortissements et écritures manuelles."
        />
      </div>
    </PageShell>
  )
}
