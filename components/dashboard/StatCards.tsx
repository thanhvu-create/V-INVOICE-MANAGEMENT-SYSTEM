interface Stats {
  by_status: Record<string, number>
  total_items: number
  month_cif?: number
  month_invoice_count?: number
}

const STATUS_CARDS = [
  { key: 'draft',            label: 'Draft',            color: 'var(--text-secondary)',    borderColor: 'var(--border-base)' },
  { key: 'pending_approval', label: 'Pending Approval', color: 'var(--color-warning)',     borderColor: 'var(--color-warning)' },
  { key: 'approved',         label: 'Approved',         color: 'var(--color-success)',     borderColor: 'var(--color-success)' },
  { key: 'invoiced',         label: 'Invoiced',         color: 'var(--text-primary)',      borderColor: 'var(--text-primary)' },
]

export function StatCards({ stats, loading }: { stats: Stats | null; loading: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
      {STATUS_CARDS.map(({ key, label, color, borderColor }) => (
        <a key={key} href={`/invoices?status=${key}`} style={{ textDecoration: 'none' }}>
          <div
            style={{
              padding: '1.25rem 1.5rem',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-base)',
              borderTop: `3px solid ${borderColor}`,
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)')}
            onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = 'var(--bg-surface)')}
          >
            <div style={{
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600,
              letterSpacing: '0.1em', textTransform: 'uppercase', color, marginBottom: '0.5rem',
            }}>
              {label}
            </div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-3xl)', fontWeight: 400, color: 'var(--text-primary)' }}>
              {loading ? '—' : (stats?.by_status?.[key] ?? 0).toLocaleString()}
            </div>
          </div>
        </a>
      ))}
    </div>
  )
}
