import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button } from './Button'

type NavItem = { to: string; label: string; end?: boolean }

const primaryNav: { section: string; links: NavItem[] }[] = [
  {
    section: 'Facturation',
    links: [
      { to: '/partners', label: 'Partenaires' },
      { to: '/billing/projects', label: 'Prestation → Encaissement' },
    ],
  },
  {
    section: 'Finances',
    links: [
      { to: '/bank', label: 'Banque' },
      { to: '/compensation/payroll', label: 'Rémunération' },
      { to: '/other', label: 'Autre' },
    ],
  },
]

const otherModulePaths = [
  '/other',
  '/sales-tax',
  '/corporate-tax',
  '/employee-expenses',
  '/ledger',
  '/adjustments',
]

const mobilePageTitles: { match: (path: string) => boolean; title: string }[] = [
  { match: (p) => p === '/', title: 'Tableau de bord' },
  { match: (p) => p.startsWith('/billing'), title: 'Prestation → Encaissement' },
  { match: (p) => p.startsWith('/compensation'), title: 'Rémunération' },
  { match: (p) => p === '/bank', title: 'Banque' },
  { match: (p) => p === '/partners', title: 'Partenaires' },
  { match: (p) => otherModulePaths.some((m) => p === m || p.startsWith(`${m}/`)), title: 'Autre' },
  { match: (p) => p === '/settings', title: 'Paramètres' },
]

function mobileTitle(pathname: string) {
  return mobilePageTitles.find((t) => t.match(pathname))?.title ?? 'Yuzu Finance'
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      {open ? (
        <path strokeLinecap="round" d="M6 6l12 12M6 18L18 6" />
      ) : (
        <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
      )}
    </svg>
  )
}

function navLinkClass(isActive: boolean) {
  return `block px-3 py-3 md:py-2 rounded-lg text-sm transition-colors min-h-[44px] md:min-h-0 flex items-center ${
    isActive ? 'bg-yuzu-light text-ink font-medium' : 'text-muted hover:bg-stone-50 hover:text-ink active:bg-stone-100'
  }`
}

export function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const pageTitle = mobileTitle(location.pathname)

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col md:flex-row">
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-2 bg-white border-b border-border safe-top">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg hover:bg-stone-100 active:bg-stone-200"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
        >
          <MenuIcon open={menuOpen} />
        </button>
        <div className="flex flex-col items-center min-w-0 flex-1 px-1">
          <span className="font-semibold text-sm truncate w-full text-center">{pageTitle}</span>
        </div>
        <div className="w-[44px]" aria-hidden />
      </header>

      {menuOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-ink/50 md:hidden"
          onClick={() => setMenuOpen(false)}
          aria-label="Fermer le menu"
        />
      )}

      <aside
        className={`fixed md:sticky md:top-0 inset-y-0 left-0 z-50 w-[min(18rem,88vw)] md:w-56 shrink-0 bg-white border-r border-border flex flex-col h-[100dvh] max-h-[100dvh] overflow-hidden overscroll-contain transition-transform duration-200 ease-out md:translate-x-0 safe-top ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="hidden md:block px-5 py-6 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-yuzu flex items-center justify-center text-sm font-bold">Y</div>
            <div>
              <div className="font-semibold text-sm leading-tight">Yuzu Finance</div>
              <div className="text-xs text-muted">Espace privé</div>
            </div>
          </div>
        </div>
        <div className="md:hidden flex items-center justify-between px-4 py-4 border-b border-border shrink-0">
          <span className="font-semibold text-sm">Navigation</span>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-stone-100"
            aria-label="Fermer"
          >
            <MenuIcon open />
          </button>
        </div>
        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-4">
          <div>
            <NavLink
              to="/"
              end
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => navLinkClass(isActive)}
            >
              Tableau de bord
            </NavLink>
          </div>

          {primaryNav.map((group) => (
            <div key={group.section}>
              <div className="px-3 text-[10px] uppercase tracking-wider text-muted mb-1">{group.section}</div>
              <div className="space-y-0.5">
                {group.links.map((l) => {
                  const otherActive =
                    l.to === '/other' &&
                    otherModulePaths.some(
                      (p) => location.pathname === p || location.pathname.startsWith(`${p}/`)
                    )
                  const billingActive = location.pathname.startsWith('/billing')
                  if (l.to === '/billing/projects') {
                    return (
                      <NavLink
                        key={l.to}
                        to={l.to}
                        end={l.end}
                        onClick={() => setMenuOpen(false)}
                        className={navLinkClass(billingActive)}
                      >
                        {l.label}
                      </NavLink>
                    )
                  }
                  const compensationActive = location.pathname.startsWith('/compensation')
                  if (l.to === '/compensation/payroll') {
                    return (
                      <NavLink
                        key={l.to}
                        to={l.to}
                        end={l.end}
                        onClick={() => setMenuOpen(false)}
                        className={navLinkClass(compensationActive)}
                      >
                        {l.label}
                      </NavLink>
                    )
                  }
                  if (l.to === '/other') {
                    return (
                      <NavLink
                        key={l.to}
                        to={l.to}
                        end={l.end}
                        onClick={() => setMenuOpen(false)}
                        className={navLinkClass(otherActive)}
                      >
                        {l.label}
                      </NavLink>
                    )
                  }
                  return (
                    <NavLink
                      key={l.to}
                      to={l.to}
                      end={l.end}
                      onClick={() => setMenuOpen(false)}
                      className={({ isActive }) => navLinkClass(isActive)}
                    >
                      {l.label}
                    </NavLink>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-border safe-bottom shrink-0 space-y-1">
          <NavLink
            to="/settings"
            onClick={() => setMenuOpen(false)}
            className={({ isActive }) => `${navLinkClass(isActive)} w-full`}
          >
            Paramètres
          </NavLink>
          <Button variant="ghost" className="w-full text-xs" onClick={signOut}>
            Déconnexion
          </Button>
        </div>
      </aside>

      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden min-w-0 w-full max-w-[90rem] mx-auto">
        <Outlet />
      </main>
    </div>
  )
}
