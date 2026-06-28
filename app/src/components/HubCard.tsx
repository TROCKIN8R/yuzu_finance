import { Link } from 'react-router-dom'

export function HubCard({
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
      className="ui-card block p-5 hover:border-yuzu/60 hover:shadow-sm transition-shadow"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        {badge && (
          <span className="text-[10px] uppercase tracking-wide font-medium text-muted bg-stone-100 px-2 py-0.5 rounded shrink-0">
            {badge}
          </span>
        )}
      </div>
      <p className="text-sm text-muted mt-2">{description}</p>
      <span className="inline-block mt-4 text-sm font-medium text-yuzu-dark">Ouvrir →</span>
    </Link>
  )
}
