import { useEffect, useState, type ComponentType } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button } from './Button'
import {
  IconGrid,
  IconLandmark,
  IconLayoutDashboard,
  IconLogOut,
  IconMenu,
  IconReceipt,
  IconSettings,
  IconUsers,
  IconWallet,
} from './icons'

type NavItem = {
  to: string
  label: string
  end?: boolean
  icon: ComponentType<{ className?: string }>
}

const primaryNav: { section: string; links: NavItem[] }[] = [
  {
    section: 'Facturation',
    links: [
      { to: '/partners', label: 'Partenaires', icon: IconUsers },
      { to: '/billing/projects', label: 'Prestation → Encaissement', icon: IconReceipt },
    ],
  },
  {
    section: 'Finances',
    links: [
      { to: '/bank', label: 'Banque', icon: IconLandmark },
      { to: '/compensation/payroll', label: 'Rémunération', icon: IconWallet },
      { to: '/other', label: 'Autre', icon: IconGrid },
    ],
  },
]

const otherModulePaths = [
  '/other',
  '/sales-tax',
  '/corporate-tax',
  '/employee-expenses',
  '/ledger',
  '/financial-reports',
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

function profileInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function sectionHeaderClass(isFirst: boolean) {
  return `px-3 mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 ${
    isFirst ? '' : 'pt-4 mt-2 border-t border-border'
  }`
}

function navLinkClass(isActive: boolean) {
  return `flex items-center gap-2.5 px-3 py-2.5 md:py-2 rounded-lg text-sm transition-colors min-h-[44px] md:min-h-0 ${
    isActive
      ? 'bg-yuzu-light text-ink font-medium'
      : 'text-stone-600 hover:bg-stone-50 hover:text-ink active:bg-stone-100'
  }`
}

function navGroupClass() {
  return 'space-y-0.5 border-l-2 border-stone-200 ml-3 pl-1.5'
}

function settingsLinkClass(isActive: boolean) {
  return `flex items-center justify-center shrink-0 min-h-[44px] min-w-[44px] md:min-h-9 md:min-w-9 rounded-lg transition-colors ${
    isActive ? 'bg-yuzu-light text-ink' : 'text-stone-500 hover:bg-stone-100 hover:text-ink active:bg-stone-200'
  }`
}

function isNavItemActive(to: string, pathname: string) {
  if (to === '/') return pathname === '/'
  if (to === '/billing/projects') return pathname.startsWith('/billing')
  if (to === '/compensation/payroll') return pathname.startsWith('/compensation')
  if (to === '/other') {
    return otherModulePaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  }
  return pathname === to || pathname.startsWith(`${to}/`)
}

function ProfileHeader({
  profileName,
  settingsActive,
  onNavigate,
  compact,
}: {
  profileName: string
  settingsActive: boolean
  onNavigate?: () => void
  compact?: boolean
}) {
  return (
    <div className={`flex items-center gap-2 ${compact ? 'px-1' : ''}`}>
      <div
        className={`${compact ? 'w-8 h-8 text-xs' : 'w-9 h-9 text-sm'} rounded-full bg-yuzu-light text-yuzu-dark flex items-center justify-center font-semibold shrink-0`}
        aria-hidden
      >
        {profileInitials(profileName)}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`font-semibold truncate ${compact ? 'text-sm' : 'text-sm leading-tight'}`}>{profileName}</div>
        {!compact && <div className="text-xs text-muted truncate">Yuzu Finance</div>}
      </div>
      <NavLink
        to="/settings"
        onClick={onNavigate}
        className={settingsLinkClass(settingsActive)}
        aria-label="Paramètres"
        title="Paramètres"
      >
        <IconSettings />
      </NavLink>
    </div>
  )
}

export function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileName, setProfileName] = useState('Compte')
  const pageTitle = mobileTitle(location.pathname)
  const settingsActive = location.pathname === '/settings'

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  useEffect(() => {
    async function loadProfile() {
      const { data: session } = await supabase.auth.getSession()
      const user = session.session?.user
      if (!user) return

      const { data: settings } = await supabase
        .from('organization_settings')
        .select('company_operating_name, email')
        .maybeSingle()

      const metadataName =
        typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : ''
      const operatingName = settings?.company_operating_name?.trim() ?? ''
      const emailName = user.email?.split('@')[0] ?? ''
      const name = operatingName || metadataName || emailName || 'Compte'
      setProfileName(name)
    }

    loadProfile()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col md:flex-row">
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-2 px-3 py-2 bg-white border-b border-border safe-top">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg hover:bg-stone-100 active:bg-stone-200"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
        >
          <IconMenu open={menuOpen} />
        </button>
        <div className="flex flex-col items-center min-w-0 flex-1 px-1">
          <span className="font-semibold text-sm truncate w-full text-center">{pageTitle}</span>
        </div>
        <NavLink
          to="/settings"
          className={settingsLinkClass(settingsActive)}
          aria-label="Paramètres"
          title="Paramètres"
        >
          <IconSettings />
        </NavLink>
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
        <div className="hidden md:block px-4 py-4 border-b border-border shrink-0">
          <ProfileHeader profileName={profileName} settingsActive={settingsActive} />
        </div>
        <div className="md:hidden flex flex-col gap-3 px-4 py-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">Navigation</span>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-stone-100"
              aria-label="Fermer"
            >
              <IconMenu open />
            </button>
          </div>
          <ProfileHeader
            profileName={profileName}
            settingsActive={settingsActive}
            onNavigate={() => setMenuOpen(false)}
            compact
          />
        </div>
        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 space-y-1">
          <div>
            <div className={sectionHeaderClass(true)}>Vue d&apos;ensemble</div>
            <div className={navGroupClass()}>
              <NavLink
                to="/"
                end
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) => navLinkClass(isActive)}
              >
                <IconLayoutDashboard className={location.pathname === '/' ? 'opacity-100' : 'opacity-70'} />
                Tableau de bord
              </NavLink>
            </div>
          </div>

          {primaryNav.map((group) => (
            <div key={group.section}>
              <div className={sectionHeaderClass(false)}>{group.section}</div>
              <div className={navGroupClass()}>
                {group.links.map((l) => {
                  const active = isNavItemActive(l.to, location.pathname)
                  const Icon = l.icon
                  return (
                    <NavLink
                      key={l.to}
                      to={l.to}
                      end={l.end}
                      onClick={() => setMenuOpen(false)}
                      className={navLinkClass(active)}
                    >
                      <Icon className={active ? 'opacity-100' : 'opacity-70'} />
                      {l.label}
                    </NavLink>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-border safe-bottom shrink-0">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2.5 px-3 min-h-[44px] md:min-h-0 text-sm text-stone-600"
            onClick={signOut}
          >
            <IconLogOut className="opacity-70" />
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
