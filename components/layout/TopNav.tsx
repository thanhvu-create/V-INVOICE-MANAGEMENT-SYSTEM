'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { HelpModal } from '@/components/ui/HelpModal'
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
  { href: '/admin/gem-catalog',   label: 'NVL Xoàn',     roles: ['admin'] },
  { href: '/admin/store-markup',  label: 'BG30 Markup',   roles: ['admin'] },
  { href: '/admin/products',      label: 'Products',      roles: ['admin'] },
  { href: '/admin/users',         label: 'Users',         roles: ['admin'] },
]

const ROLE_LABEL: Record<Role, string> = {
  admin:   'Admin',
  manager: 'Manager',
  user:    'User',
  viewer:  'Viewer',
}

export function TopNav() {
  const { user, loaded } = useUser()
  const pathname         = usePathname()
  const router           = useRouter()
  const [menuOpen,  setMenuOpen]  = useState(false)
  const [showHelp,  setShowHelp]  = useState(false)

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const visibleNav = NAV_ITEMS.filter(item => item.roles.includes(user.role))

  return (
    <header
      className="no-print"
      style={{
        background:   'var(--bg-surface)',
        borderBottom: '1px solid var(--border-base)',
        position:     'sticky',
        top:          0,
        zIndex:       100,
      }}
    >
      {/* Row 1: Brand + user */}
      <div style={{
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
        padding:        '0.75rem 2rem',
        borderBottom:   '1px solid var(--border-light)',
      }}>
        <Link
          href="/dashboard"
          className="topnav-brand"
          style={{
            fontFamily:     'var(--font-heading)',
            fontSize:       '18px',
            fontWeight:     400,
            letterSpacing:  '0.12em',
            textTransform:  'uppercase',
            color:          'var(--text-primary)',
            textDecoration: 'none',
          }}
        >
          V-Invoice
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {loaded && user.email && (
            <>
              {/* Role eyebrow chip */}
              <span style={{
                fontFamily:     'var(--font-body)',
                fontSize:       '10px',
                fontWeight:     600,
                letterSpacing:  '0.14em',
                textTransform:  'uppercase',
                color:          'var(--text-muted)',
              }}>
                {ROLE_LABEL[user.role]}
              </span>

              {/* Full name */}
              <span
                className="topnav-username"
                style={{
                  fontSize:   '13px',
                  color:      'var(--text-secondary)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {user.fullName}
              </span>

              {/* Help */}
              <button
                onClick={() => setShowHelp(true)}
                title="Hướng dẫn sử dụng"
                style={{
                  padding:      '4px 10px',
                  border:       '1px solid var(--border-base)',
                  background:   'transparent',
                  color:        'var(--text-muted)',
                  fontFamily:   'var(--font-body)',
                  fontSize:     '11px',
                  letterSpacing:'0.08em',
                  cursor:       'pointer',
                  borderRadius: 0,
                  transition:   'background 0.15s, color 0.15s',
                  display:      'inline-flex',
                  alignItems:   'center',
                  gap:          5,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--border-strong)'
                  e.currentTarget.style.color      = 'var(--text-inverse)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color      = 'var(--text-muted)'
                }}
              >
                <i className="fa-regular fa-circle-question" style={{ fontSize: 13 }} />
                <span className="topnav-username">Hướng dẫn</span>
              </button>

              {/* Logout */}
              <button
                onClick={handleLogout}
                className="no-print"
                style={{
                  padding:        '4px 14px',
                  border:         '1px solid var(--border-base)',
                  background:     'transparent',
                  color:          'var(--text-muted)',
                  fontFamily:     'var(--font-body)',
                  fontSize:       '11px',
                  letterSpacing:  '0.08em',
                  textTransform:  'uppercase',
                  cursor:         'pointer',
                  borderRadius:   0,
                  transition:     'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => {
                  const b = e.currentTarget
                  b.style.background = 'var(--border-strong)'
                  b.style.color      = 'var(--text-inverse)'
                }}
                onMouseLeave={e => {
                  const b = e.currentTarget
                  b.style.background = 'transparent'
                  b.style.color      = 'var(--text-muted)'
                }}
              >
                Sign Out
              </button>
            </>
          )}

          {/* Hamburger */}
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
      <nav
        className={`topnav-row2${menuOpen ? ' open' : ''}`}
        style={{ gap: 0, padding: '0 2rem', overflowX: 'auto' }}
      >
        {visibleNav.map(item => {
          const isActive = pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href))

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              style={{
                display:        'inline-block',
                padding:        '0.65rem 1rem',
                fontFamily:     'var(--font-body)',
                fontSize:       '11px',
                fontWeight:     isActive ? 600 : 400,
                letterSpacing:  '0.12em',
                textTransform:  'uppercase',
                color:          isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                textDecoration: 'none',
                /* Active = HP pink underline; inactive = transparent */
                borderBottom:   isActive
                  ? '2px solid var(--color-accent)'
                  : '2px solid transparent',
                whiteSpace:   'nowrap',
                transition:   'color 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => {
                if (!isActive) e.currentTarget.style.color = 'var(--text-secondary)'
              }}
              onMouseLeave={e => {
                if (!isActive) e.currentTarget.style.color = 'var(--text-muted)'
              }}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </header>
  )
}
