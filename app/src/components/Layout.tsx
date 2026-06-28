import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button } from './Button'

type NavItem = { to: string; label: string; end?: boolean }

const nav: { section: string; links: NavItem[] }[] = [
  { section: 'Vue d\'ensemble', links: [{ to: '/', label: 'Tableau de bord', end: true }] },
  {
    section: 'Opérations',
    links: [
      { to: '/clients', label: 'Clients' },
      { to: '/projects', label: 'Projets' },
      { to: '/time', label: 'Temps' },
      { to: '/invoices', label: 'Factures' },
      { to: '/payments', label: 'Paiements' },
    ],
  },
  {
    section: 'Comptabilité',
    links: [
      { to: '/expenses', label: 'Dépenses' },
      { to: '/payroll', label: 'Paie' },
      { to: '/dividends', label: 'Dividendes' },
      { to: '/sales-tax', label: 'TPS / TVQ' },
      { to: '/corporate-tax', label: 'Impôts société' },
    ],
  },
]

export function Layout() {
  const navigate = useNavigate()

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 bg-white border-r border-border flex flex-col overflow-y-auto">
        <div className="px-5 py-6 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-yuzu flex items-center justify-center text-sm font-bold">Y</div>
            <div>
              <div className="font-semibold text-sm leading-tight">Yuzu Finance</div>
              <div className="text-xs text-muted">Espace privé</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-4">
          {nav.map((group) => (
            <div key={group.section}>
              <div className="px-3 text-[10px] uppercase tracking-wider text-muted mb-1">{group.section}</div>
              <div className="space-y-0.5">
                {group.links.map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    end={l.end}
                    className={({ isActive }) =>
                      `block px-3 py-2 rounded-lg text-sm transition-colors ${
                        isActive ? 'bg-yuzu-light text-ink font-medium' : 'text-muted hover:bg-stone-50 hover:text-ink'
                      }`
                    }
                  >
                    {l.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-border">
          <Button variant="ghost" className="w-full text-xs" onClick={signOut}>Déconnexion</Button>
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
