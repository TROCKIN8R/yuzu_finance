type IconProps = { className?: string }

const defaults = 'w-[18px] h-[18px] shrink-0'

export function IconLayoutDashboard({ className = defaults }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z" />
    </svg>
  )
}

export function IconUsers({ className = defaults }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 19v-1a4 4 0 00-4-4H8a4 4 0 00-4 4v1M12 11a4 4 0 100-8 4 4 0 000 8zM20 8v6M23 11h-6" />
    </svg>
  )
}

export function IconReceipt({ className = defaults }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3h6l1 2h3v16l-3-2-3 2-3-2-3 2V5h3l1-2zM9 9h6M9 13h6" />
    </svg>
  )
}

export function IconLandmark({ className = defaults }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M5 10V20M9 10V20M15 10V20M19 10V20M2 20h20M12 3l7 5H5l7-5z" />
    </svg>
  )
}

export function IconWallet({ className = defaults }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h11a3 3 0 013 3v1H5a2 2 0 00-2 2v8a2 2 0 002 2h14a2 2 0 002-2v-5M17 14h.01M16 7V5a2 2 0 012-2h1" />
    </svg>
  )
}

export function IconGrid({ className = defaults }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
    </svg>
  )
}

export function IconSettings({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.3 4.3l1.2-.7 1.2.7 1.4-.2.8 1.2 1.3.3.2 1.4 1 1-1 1-.2 1.4-1.3.3-.8 1.2-1.4-.2-1.2.7-1.2-.7-1.4.2-.8-1.2-1.3-.3-.2-1.4-1-1 1-1 .2-1.4 1.3-.3.8-1.2 1.4.2z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  )
}

export function IconLogOut({ className = defaults }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" />
    </svg>
  )
}

export function IconMenu({ className = 'w-6 h-6', open }: IconProps & { open?: boolean }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      {open ? (
        <path strokeLinecap="round" d="M6 6l12 12M6 18L18 6" />
      ) : (
        <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
      )}
    </svg>
  )
}
