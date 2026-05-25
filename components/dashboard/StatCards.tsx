import Link from 'next/link'

interface Stats {
  by_status: Record<string, number>
  total_items: number
  month_cif?: number
  month_invoice_count?: number
}

const STATUS_CARDS = [
  { key: 'draft',            label: 'Draft',            color: 'var(--text-muted)' },
  { key: 'pending_approval', label: 'Pending Approval', color: 'var(--color-warning)' },
  { key: 'approved',         label: 'Approved',         color: 'var(--color-success)' },
  { key: 'invoiced',         label: 'Invoiced',         color: 'var(--text-primary)' },
]

export function StatCards({ stats, loading }: { stats: Stats | null; loading: boolean }) {
  return (
    <div style={{
      display:             'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap:                 '1px',  /* hairline gaps via bg-muted container */
      background:          'var(--border-light)',
      border:              '1px solid var(--border-light)',
      marginBottom:        '2rem',
    }}>
      {STATUS_CARDS.map(({ key, label, color }) => (
        <Link
          key={key}
          href={`/invoices?status=${key}`}
          style={{ textDecoration: 'none' }}
        >
          <div
            style={{
              padding:    '1.5rem 1.5rem 1.25rem',
              background: 'var(--bg-surface)',
              transition: 'background 0.15s',
              height:     '100%',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)')}
            onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = 'var(--bg-surface)')}
          >
            {/* Eyebrow label */}
            <div style={{
              fontFamily:    'var(--font-body)',
              fontSize:      'var(--text-xs)',
              fontWeight:    600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color,
              marginBottom:  '0.75rem',
            }}>
              {label}
            </div>

            {/* Count — large serif number */}
            <div style={{
              fontFamily: 'var(--font-heading)',
              fontSize:   'var(--text-3xl)',
              fontWeight: 400,
              color:      'var(--text-primary)',
              lineHeight: 1,
            }}>
              {loading ? '—' : (stats?.by_status?.[key] ?? 0).toLocaleString()}
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}
