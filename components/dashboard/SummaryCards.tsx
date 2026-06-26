import { templateLabel } from '@/lib/templates'

interface Stats {
  by_status:            Record<string, number>
  by_template?:         Record<string, number>
  total_items:          number
  month_cif?:           number
  month_invoice_count?: number
}

function formatUSD(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
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

const TEMPLATE_COLORS: Record<string, string> = {
  CH1:      '#92400E',
  CH2:      '#1E40AF',
  ADM:      '#065F46',
  CH1_AG3:  '#6B21A8',
  VNSI_AG3: '#9F1239',
}

function monthShortLabel(selectedMonth: string): string {
  const now = new Date()
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  if (selectedMonth === cur) return 'Tháng này'
  const [y, m] = selectedMonth.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })
}

export function SummaryCards({ stats, loading, selectedMonth }: { stats: Stats | null; loading: boolean; selectedMonth: string }) {
  const byTemplate  = stats?.by_template ?? {}
  const totalInvAll = Object.values(stats?.by_status ?? {}).reduce((a, b) => a + b, 0)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>

      {/* CIF selected month */}
      <div style={cardStyle}>
        <div style={labelStyle}>CIF — {monthShortLabel(selectedMonth)}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xl)', fontWeight: 500, color: 'var(--text-primary)' }}>
          {loading ? '—' : formatUSD(stats?.month_cif ?? 0)}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
          {loading ? '' : `${(stats?.month_invoice_count ?? 0).toLocaleString()} invoices`}
        </div>
      </div>

      {/* Total Line Items */}
      <div style={cardStyle}>
        <div style={labelStyle}>Total Line Items</div>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-3xl)', fontWeight: 400, color: 'var(--text-primary)' }}>
          {loading ? '—' : (stats?.total_items ?? 0).toLocaleString()}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
          across {totalInvAll} invoices
        </div>
      </div>

      {/* Template breakdown */}
      {!loading && Object.keys(byTemplate).length > 0 && (
        <div style={cardStyle}>
          <div style={labelStyle}>By Template</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {Object.entries(byTemplate)
              .sort((a, b) => b[1] - a[1])
              .map(([tmpl, cnt]) => (
                <div key={tmpl} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                    color: TEMPLATE_COLORS[tmpl] ?? 'var(--text-secondary)',
                    minWidth: 72,
                  }}>
                    {templateLabel(tmpl)}
                  </span>
                  <div style={{ flex: 1, height: 4, background: 'var(--border-light)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${totalInvAll > 0 ? Math.round(cnt / totalInvAll * 100) : 0}%`,
                      background: TEMPLATE_COLORS[tmpl] ?? 'var(--text-secondary)',
                      borderRadius: 2,
                      transition: 'width 0.5s ease-out',
                    }} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', minWidth: 20, textAlign: 'right' }}>{cnt}</span>
                </div>
              ))
            }
          </div>
        </div>
      )}

    </div>
  )
}
