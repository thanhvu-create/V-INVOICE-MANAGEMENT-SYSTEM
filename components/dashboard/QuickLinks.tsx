interface LinkDef {
  href:  string
  label: string
  icon:  string
  roles: string[]
}

const LINKS: LinkDef[] = [
  { href: '/invoices/new',      label: 'New Invoice',  icon: 'fa-file-plus', roles: ['admin', 'manager', 'user']           },
  { href: '/invoices',          label: 'All Invoices', icon: 'fa-list',      roles: ['admin', 'manager', 'user', 'viewer'] },
  { href: '/admin/metal-rates', label: 'NVL Prices',   icon: 'fa-coins',     roles: ['admin', 'manager']                   },
  { href: '/admin/gem-catalog', label: 'Gem Catalog',  icon: 'fa-gem',       roles: ['admin', 'manager']                   },
  { href: '/admin/users',       label: 'Users',        icon: 'fa-users',     roles: ['admin']                              },
]

export function QuickLinks({ role }: { role: string }) {
  const visible = LINKS.filter(l => l.roles.includes(role))
  if (!visible.length) return null

  return (
    <section>
      <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '0 0 0.75rem' }}>
        Quick Links
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
        {visible.map(link => (
          <a
            key={link.href}
            href={link.href}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 1.25rem',
              border: '1px solid var(--border-base)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-sm)',
              textDecoration: 'none',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-hover)')}
            onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-surface)')}
          >
            <i className={`fa-solid ${link.icon}`} style={{ fontSize: 12 }} />
            {link.label}
          </a>
        ))}
      </div>
    </section>
  )
}
