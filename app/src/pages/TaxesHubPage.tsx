import { Link } from 'react-router-dom'

function HubCard({
  to,
  title,
  description,
  badge,
}: {
  to: string
  title: string
  description: string
  badge?: string
}) {
  return (
    <Link
      to={to}
      className="block bg-white border border-border rounded-xl p-5 hover:border-yuzu/60 hover:shadow-sm transition-shadow"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        {badge && (
          <span className="text-[10px] uppercase tracking-wide font-medium text-muted bg-stone-100 px-2 py-0.5 rounded">
            {badge}
          </span>
        )}
      </div>
      <p className="text-sm text-muted mt-2">{description}</p>
      <span className="inline-block mt-4 text-sm font-medium text-yuzu-dark">Ouvrir →</span>
    </Link>
  )
}

export function TaxesHubPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">Fiscalité</h1>
      <p className="text-sm text-muted mt-1 mb-6">
        TPS/TVQ et impôts de société — brouillon pour révision CPA.
      </p>
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
      </div>
    </div>
  )
}
