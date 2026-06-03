import type { ValidationError } from '@/types'

export function ImportErrorTable({ errors }: { errors: ValidationError[] }) {
  if (!errors.length) return null

  const hardErrors = errors.filter(e => !e.warn)
  const warnings   = errors.filter(e =>  e.warn)

  return (
    <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

      {/* Warnings — import proceeds, fees = 0 */}
      {warnings.length > 0 && (
        <div>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-warning)', marginBottom: '0.5rem' }}>
            <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 5 }} />
            {warnings.length} row{warnings.length !== 1 ? 's' : ''} — SKU not in catalog (will import with fees = 0)
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Row', 'SKU', 'Note'].map(h => (
                  <th key={h} style={{ padding: '0.4rem 0.6rem', textAlign: 'left', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-base)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {warnings.map((err, i) => (
                <tr key={i}>
                  <td style={{ padding: '0.4rem 0.6rem', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--color-warning)', borderBottom: '1px solid var(--border-light)' }}>{err.row}</td>
                  <td style={{ padding: '0.4rem 0.6rem', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', borderBottom: '1px solid var(--border-light)' }}>{err.sku}</td>
                  <td style={{ padding: '0.4rem 0.6rem', fontSize: 'var(--text-sm)', color: 'var(--color-warning)', borderBottom: '1px solid var(--border-light)' }}>{err.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Hard errors — rows will be skipped */}
      {hardErrors.length > 0 && (
        <div>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-danger)', marginBottom: '0.5rem' }}>
            <i className="fa-solid fa-circle-xmark" style={{ marginRight: 5 }} />
            {hardErrors.length} row{hardErrors.length !== 1 ? 's' : ''} with errors (will be skipped)
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Row', 'SKU', 'Error'].map(h => (
                  <th key={h} style={{ padding: '0.4rem 0.6rem', textAlign: 'left', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-base)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hardErrors.map((err, i) => (
                <tr key={i}>
                  <td style={{ padding: '0.4rem 0.6rem', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--color-danger)', borderBottom: '1px solid var(--border-light)' }}>{err.row}</td>
                  <td style={{ padding: '0.4rem 0.6rem', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', borderBottom: '1px solid var(--border-light)' }}>{err.sku}</td>
                  <td style={{ padding: '0.4rem 0.6rem', fontSize: 'var(--text-sm)', color: 'var(--color-danger)', borderBottom: '1px solid var(--border-light)' }}>{err.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}
