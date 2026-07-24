import {
  Archive,
  BookOpen,
  CalendarClock,
  CalendarRange,
  FileBarChart,
  Lock,
  Percent,
  Receipt,
  Scale,
  SlidersHorizontal,
} from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { HubCard, HubSection } from '../components/HubCard'

export function OtherHubPage() {
  return (
    <PageShell width="narrow">
      <PageHeader
        title="Autre"
        subtitle="Fiscalité, comptabilité et outils complémentaires — brouillon pour révision CPA."
      />

      <div className="space-y-5">
        <HubSection title="Fiscalité">
          <HubCard
            to="/sales-tax"
            icon={Percent}
            title="TPS / TVQ"
            description="Périodes de déclaration, CTI/RTI et remises."
            badge="Trimestriel"
          />
          <HubCard
            to="/corporate-tax"
            icon={Scale}
            title="Impôts société"
            description="Provisions et paiements T2 / CO-17."
            badge="Annuel"
          />
          <HubCard
            to="/tax-exports"
            icon={CalendarRange}
            title="Calendriers fiscaux"
            description="Export CSV T4/RL-1, T5 et échéancier CO-17."
          />
          <HubCard
            to="/compliance"
            icon={CalendarClock}
            title="Conformité"
            description="Échéances retenues, TPS/TVQ, impôts, NEQ."
            badge="Calendrier"
          />
        </HubSection>

        <HubSection title="Comptabilité">
          <HubCard
            to="/financial-reports"
            icon={FileBarChart}
            title="Rapports financiers"
            description="État des résultats, bilan et flux — export PDF."
          />
          <HubCard
            to="/period-close"
            icon={Lock}
            title="Clôture de période"
            description="Verrouille un mois : paie, banque, factures, taxes."
          />
          <HubCard
            to="/ledger"
            icon={BookOpen}
            title="Grand livre"
            description="Journal des écritures et balance de vérification."
          />
          <HubCard
            to="/adjustments"
            icon={SlidersHorizontal}
            title="Ajustements"
            description="Prépaids, à payer, amortissements et écritures manuelles."
          />
        </HubSection>

        <HubSection title="Outils">
          <HubCard
            to="/employee-expenses"
            icon={Receipt}
            title="Frais à rembourser"
            description="Dépenses employé remboursées via la paie."
          />
          <HubCard
            to="/backup"
            icon={Archive}
            title="Sauvegarde"
            description="Exporter un ZIP : données + documents joints."
          />
        </HubSection>
      </div>
    </PageShell>
  )
}
