import type { ImportRow } from '@/types'

interface Props {
  rows: ImportRow[]
}

const th: React.CSSProperties = {
  padding: '0.5rem 0.6rem', background: 'var(--bg-surface)',
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
  fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'var(--text-secondary)', borderBottom: '2px solid var(--border-base)',
  whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  padding: '0.45rem 0.6rem', borderBottom: '1px solid var(--border-light)',
  fontSize: 'var(--text-sm)', verticalAlign: 'middle',
}

export function ImportPreview({ rows }: Props) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['#', 'SKU', 'SO-MO', 'Description', 'Qty', 'T.Phẩm (g)', 'Loại vàng', 'Class'].map(h => (
              <th key={h} style={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
              <td style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{row.rowNum}</td>
              <td style={{ ...td, fontFamily: 'var(--font-mono)', fontWeight: 600, background: 'var(--sku-highlight-bg)' }}>{row.sku}</td>
              <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{row.soMo || '—'}</td>
              <td style={td}>{row.description || '—'}</td>
              <td style={{ ...td, fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{row.qty}</td>
              <td style={{ ...td, fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{row.weightTotal.toFixed(4)}</td>
              <td style={td}>{row.loaiVang || '—'}</td>
              <td style={td}>{row.class || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
