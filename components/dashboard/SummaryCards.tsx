interface Stats {
  by_status: Record<string, number>
  total_items: number
  month_cif?: number
  month_invoice_count?: number
}

function formatUSD(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)
}

const cardStyle: React.CSSProperties = {
  padding: '1.25rem 1.5rem',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-base)',
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600,
  letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem',
}

const subStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4,
}

export function SummaryCards({ stats, loading }: { stats: Stats | null; loading: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
      <div style={cardStyle}>
        <div style={labelStyle}>CIF — This Month</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xl)', fontWeight: 500, color: 'var(--text-primary)' }}>
          {loading ? '—' : formatUSD(stats?.month_cif ?? 0)}
        </div>
        <div style={subStyle}>
          {loading ? '' : `${(stats?.month_invoice_count ?? 0).toLocaleString()} invoices`}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={labelStyle}>Total Line Items</div>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-3xl)', fontWeight: 400, color: 'var(--text-primary)' }}>
          {loading ? '—' : (stats?.total_items ?? 0).toLocaleString()}
        </div>
        <div style={subStyle}>all time</div>
      </div>
    </div>
  )
}
