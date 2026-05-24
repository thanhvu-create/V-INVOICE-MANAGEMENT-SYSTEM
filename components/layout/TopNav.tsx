'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import type { Role } from '@/types'

interface NavItem {
  href:  string
  label: string
  roles: Role[]
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard',           label: 'Dashboard',     roles: ['admin', 'manager', 'user', 'viewer'] },
  { href: '/invoices',            label: 'Invoices',      roles: ['admin', 'manager', 'user', 'viewer'] },
  { href: '/import',              label: 'Import',        roles: ['admin', 'manager', 'user'] },
  { href: '/admin/metal-rates',   label: 'Metal Rates',   roles: ['admin', 'manager'] },
  { href: '/admin/pricing-rules', label: 'Pricing Rules', roles: ['admin'] },
  { href: '/admin/products',      label: 'Products',      roles: ['admin'] },
  { href: '/admin/users',         label: 'Users',         roles: ['admin'] },
]

const ROLE_BADGE: Record<Role, { bg: string; color: string }> = {
  admin:   { bg: '#1A1814', color: '#FAFAF7' },
  manager: { bg: '#1A1814', color: '#FAFAF7' },
  user:    { bg: '#4A6B8C', color: '#FAFAF7' },
  viewer:  { bg: '#8C7340', color: '#FAFAF7' },
}

export function TopNav() {
  const { user, loaded } = useUser()
  const pathname         = usePathname()
  const router           = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const visibleNav = NAV_ITEMS.filter(item => item.roles.includes(user.role))
  const roleBadge  = ROLE_BADGE[user.role] ?? ROLE_BADGE.viewer

  return (
    <header
      className="no-print"
      style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-base)', position: 'sticky', top: 0, zIndex: 100 }}
    >
      {/* Row 1: Brand + user info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 2rem', borderBottom: '1px solid var(--border-light)' }}>
        <span
          className="topnav-brand"
          style={{ fontFamily: 'var(--font-heading)', fontSize: '18px', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-primary)' }}
        >
          V-Invoice
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {loaded && user.email && (
            <>
              <span style={{ padding: '2px 8px', background: roleBadge.bg, color: roleBadge.color, fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {user.role}
              </span>
              <span className="topnav-username" style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                {user.fullName}
              </span>
              <button
                onClick={handleLogout}
                className="no-print"
                style={{ padding: '4px 12px', border: '1px solid var(--border-base)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: '12px', cursor: 'pointer', borderRadius: 0 }}
              >
                Logout
              </button>
            </>
          )}

          {/* Hamburger — visible only on mobile via CSS */}
          <button
            className="topnav-hamburger"
            onClick={() => setMenuOpen(v => !v)}
            aria-label="Toggle menu"
          >
            <i className={`fa-solid ${menuOpen ? 'fa-xmark' : 'fa-bars'}`} />
          </button>
        </div>
      </div>

      {/* Row 2: Navigation */}
      <nav className={`topnav-row2${menuOpen ? ' open' : ''}`} style={{ gap: 0, padding: '0 2rem', overflowX: 'auto' }}>
        {visibleNav.map(item => {
          const isActive = pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href))

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              style={{
                display: 'inline-block',
                padding: '0.65rem 1.25rem',
                fontFamily: 'var(--font-body)',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                textDecoration: 'none',
                borderBottom: isActive ? '2px solid var(--text-primary)' : '2px solid transparent',
                whiteSpace: 'nowrap',
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
