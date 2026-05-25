import { StatusBadge } from '@/components/ui/StatusBadge'

interface RecentRow {
  id:         string
  po_number:  string
  store:      string | null
  created_at: string
  status:     string
  is_locked:  boolean
  item_count: { count: number }[]
}

export function RecentInvoices({ rows, loading }: { rows: RecentRow[]; loading: boolean }) {
  return (
    <section style={{ marginBottom: '2rem' }}>
      {/* Section header — HP eyebrow + hairline */}
      <div style={{
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'baseline',
        marginBottom:   '0.75rem',
      }}>
        <span style={{
          fontFamily:    'var(--font-body)',
          fontSize:      'var(--text-xs)',
          fontWeight:    600,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color:         'var(--text-muted)',
        }}>
          Recent Invoices
        </span>
        <a
          href="/invoices"
          style={{
            fontSize:      'var(--text-xs)',
            letterSpacing: '0.06em',
            color:         'var(--text-muted)',
            textDecoration: 'none',
            transition:    'color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          View all →
        </a>
      </div>

      {/* Hairline */}
      <div style={{ height: 1, background: 'var(--border-base)', marginBottom: '0' }} />

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderTop: 'none' }}>
        {loading && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 8 }} />
            Loading…
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            No invoices yet.
          </div>
        )}

        {rows.map((row, idx) => (
          <a
            key={row.id}
            href={`/invoices/${row.id}`}
            style={{
              display:        'flex',
              alignItems:     'center',
              gap:            '1rem',
              padding:        '0.8rem 1rem',
              borderBottom:   idx < rows.length - 1 ? '1px solid var(--border-light)' : 'none',
              textDecoration: 'none',
              color:          'inherit',
              background:     'transparent',
              transition:     'background 0.15s',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-hover)')}
            onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.background = 'transparent')}
          >
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize:   'var(--text-sm)',
              fontWeight: 600,
              color:      'var(--text-primary)',
              minWidth:   130,
            }}>
              {row.is_locked && (
                <i className="fa-solid fa-lock" style={{ fontSize: 9, marginRight: 5, color: 'var(--text-muted)' }} />
              )}
              {row.po_number}
            </span>

            <span style={{
              flex:         1,
              fontSize:     'var(--text-sm)',
              color:        'var(--text-secondary)',
              overflow:     'hidden',
              textOverflow: 'ellipsis',
              whiteSpace:   'nowrap',
            }}>
              {row.store ?? '—'}
            </span>

            <span style={{
              fontSize:   'var(--text-xs)',
              color:      'var(--text-muted)',
              whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>

            <StatusBadge status={row.status} />

            <span style={{
              fontSize:    'var(--text-xs)',
              color:       'var(--text-muted)',
              fontFamily:  'var(--font-mono)',
              minWidth:    56,
              textAlign:   'right',
            }}>
              {(row.item_count?.[0]?.count ?? 0)} items
            </span>
          </a>
        ))}
      </div>
    </section>
  )
}
