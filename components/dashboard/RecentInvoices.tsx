import { StatusBadge } from '@/components/ui/StatusBadge'

interface RecentRow {
  id:            string
  invoice_code:  string
  channel:       string | null
  template_type: string | null
  status:        string
  created_at:    string
  finalized_at:  string | null
  item_count:    { count: number }[]
}

const TEMPLATE_COLORS: Record<string, string> = {
  CH1:      '#92400E',
  CH2:      '#1E40AF',
  ADM:      '#065F46',
  CH1_AG3:  '#6B21A8',
  VNSI_AG3: '#9F1239',
}

export function RecentInvoices({ rows, loading }: { rows: RecentRow[]; loading: boolean }) {
  return (
    <section style={{ marginBottom: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          Recent Invoices
        </span>
        <a
          href="/invoices"
          style={{ fontSize: 'var(--text-xs)', letterSpacing: '0.06em', color: 'var(--text-muted)', textDecoration: 'none', transition: 'color 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          View all →
        </a>
      </div>

      <div style={{ height: 1, background: 'var(--border-base)' }} />

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderTop: 'none' }}>
        {loading && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 8 }} />Loading…
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            No invoices yet. <a href="/invoices/new" style={{ color: 'var(--text-primary)' }}>Create your first invoice →</a>
          </div>
        )}

        {rows.map((row, idx) => {
          const tmplColor = TEMPLATE_COLORS[row.template_type ?? ''] ?? 'var(--text-muted)'
          const itemCnt   = row.item_count?.[0]?.count ?? 0
          const dateLabel = (() => {
            const d = new Date(row.created_at)
            const now = new Date()
            const diffMs = now.getTime() - d.getTime()
            const diffDays = Math.floor(diffMs / 86400000)
            if (diffDays === 0) return 'Today'
            if (diffDays === 1) return 'Yesterday'
            if (diffDays < 7)  return `${diffDays}d ago`
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          })()

          return (
            <a
              key={row.id}
              href={`/invoices/${row.id}`}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.75rem 1rem',
                borderBottom: idx < rows.length - 1 ? '1px solid var(--border-light)' : 'none',
                textDecoration: 'none', color: 'inherit',
                background: 'transparent', transition: 'background 0.18s ease-out',
                animation: `fadeIn 0.3s ease-out ${idx * 55}ms both`,
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-hover)')}
              onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.background = 'transparent')}
            >
              {/* Invoice code */}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', minWidth: 110 }}>
                {row.invoice_code}
              </span>

              {/* Template badge */}
              {row.template_type && (
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                  color: tmplColor, border: `1px solid ${tmplColor}`,
                  padding: '1px 5px', whiteSpace: 'nowrap', letterSpacing: '0.04em',
                  flexShrink: 0,
                }}>
                  {row.template_type}
                </span>
              )}

              {/* Channel */}
              <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.channel ?? '—'}
              </span>

              {/* Date */}
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap', minWidth: 60, textAlign: 'right' }}>
                {dateLabel}
              </span>

              {/* Status */}
              <StatusBadge status={row.status} />

              {/* Item count */}
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', minWidth: 52, textAlign: 'right' }}>
                {itemCnt} {itemCnt === 1 ? 'item' : 'items'}
              </span>
            </a>
          )
        })}
      </div>
    </section>
  )
}
