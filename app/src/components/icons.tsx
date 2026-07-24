import type { LucideIcon, LucideProps } from 'lucide-react'
import {
  Briefcase,
  Eye,
  EyeOff,
  Landmark,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Menu,
  Settings,
  Users,
  Wallet,
  X,
} from 'lucide-react'

/** Shared stroke weights — keeps nav, controls, and chrome visually aligned. */
export const ICON_STROKE = {
  /** Sidebar links, footer actions */
  nav: 1.75,
  /** Settings gear, profile controls */
  control: 1.75,
  /** Hamburger / close — slightly heavier for small UI targets */
  menu: 2,
} as const

/** Pixel sizes on Lucide’s 24×24 grid — use tokens instead of ad-hoc classes. */
export const ICON_SIZE = {
  nav: 18,
  control: 20,
  menu: 24,
} as const

type IconSize = keyof typeof ICON_SIZE | number
type IconStroke = keyof typeof ICON_STROKE | number

function resolveSize(size: IconSize) {
  return typeof size === 'number' ? size : ICON_SIZE[size]
}

function resolveStroke(stroke: IconStroke) {
  return typeof stroke === 'number' ? stroke : ICON_STROKE[stroke]
}

type AppIconProps = Omit<LucideProps, 'size' | 'strokeWidth'> & {
  icon: LucideIcon
  size?: IconSize
  stroke?: IconStroke
  /** De-emphasize inactive sidebar items without shrinking the glyph. */
  muted?: boolean
}

export function AppIcon({
  icon: Icon,
  size = 'nav',
  stroke = 'nav',
  muted = false,
  className = '',
  ...props
}: AppIconProps) {
  return (
    <Icon
      size={resolveSize(size)}
      strokeWidth={resolveStroke(stroke)}
      className={`shrink-0 ${muted ? 'opacity-70' : ''} ${className}`.trim()}
      aria-hidden
      {...props}
    />
  )
}

/** Sidebar navigation glyphs — one import surface for Layout. */
export const navIcons = {
  dashboard: LayoutDashboard,
  partners: Users,
  prestations: Briefcase,
  bank: Landmark,
  compensation: Wallet,
  other: LayoutGrid,
} as const

export type NavIconKey = keyof typeof navIcons

export { Menu, X, Settings, LogOut, Eye, EyeOff }
