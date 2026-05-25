'use client'

interface Props {
  page:         number
  totalPages:   number
  total:        number
  pageSize:     number
  onPageChange: (page: number) => void
}

export function Pagination({ page, totalPages, total, pageSize, onPageChange }: Props) {
  if (totalPages <= 1) return null

  const from = (page - 1) * pageSize + 1
  const to   = Math.min(page * pageSize, total)

  const btn = (active: boolean, disabled: boolean): React.CSSProperties => ({
    padding:      '4px 10px',
    border:       '1px solid var(--border-base)',
    background:   active   ? 'var(--text-primary)' : 'transparent',
    color:        active   ? 'var(--bg-base)'
                : disabled ? 'var(--text-muted)'
                : 'var(--text-primary)',
    fontSize:     'var(--text-xs)',
    fontFamily:   'var(--font-mono)',
    cursor:       disabled ? 'not-allowed' : 'pointer',
    borderRadius: 0,
    minWidth:     32,
    textAlign:    'center',
  })

  function pageWindows(): (number | '…')[] {
    const pages: (number | '…')[] = [1]
    const lo = Math.max(2, page - 1)
    const hi = Math.min(totalPages - 1, page + 1)
    if (lo > 2) pages.push('…')
    for (let i = lo; i <= hi; i++) pages.push(i)
    if (hi < totalPages - 1) pages.push('…')
    if (totalPages > 1) pages.push(totalPages)
    return pages
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem' }}>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        Showing {from}–{to} of {total.toLocaleString()}
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        <button style={btn(false, page === 1)} disabled={page === 1} onClick={() => onPageChange(page - 1)}>←</button>
        {pageWindows().map((p, i) =>
          p === '…'
            ? <span key={`e${i}`} style={{ padding: '4px 4px', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>…</span>
            : <button key={p} style={btn(p === page, false)} onClick={() => onPageChange(p as number)}>{p}</button>
        )}
        <button style={btn(false, page === totalPages)} disabled={page === totalPages} onClick={() => onPageChange(page + 1)}>→</button>
      </div>
    </div>
  )
}
