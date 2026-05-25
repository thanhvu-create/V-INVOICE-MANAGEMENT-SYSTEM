'use client'

import Link from 'next/link'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { Role } from '@/types'

interface InvoiceRow {
  id:                string
  po_number:         string
  mr_number:         string | null
  status:            string
  is_locked:         boolean
  store:             string | null
  created_by:        string
  created_at:        string
  daily_metal_rates: { rate_date: string } | null
  pricing_rules:     { name: string } | null
}

interface Props {
  rows:     InvoiceRow[]
  loading:  boolean
  role:     Role
  onDelete: (id: string, po: string) => void
}

/* Table header cell — uses --bg-muted (HP inset) */
const th: React.CSSProperties = {
  padding:        '0.6rem 1rem',
  textAlign:      'left',
  fontFamily:     'var(--font-body)',
  fontSize:       'var(--text-xs)',
  fontWeight:     600,
  letterSpacing:  '0.12em',
  textTransform:  'uppercase',
  color:          'var(--text-muted)',
  borderBottom:   '1px solid var(--border-base)',
  background:     'var(--bg-muted)',
  whiteSpace:     'nowrap',
}

const td: React.CSSProperties = {
  padding:      '0.75rem 1rem',
  borderBottom: '1px solid var(--border-light)',
  fontSize:     'var(--text-sm)',
  color:        'var(--text-primary)',
  verticalAlign: 'middle',
}

function ActionBtn({
  href, onClick, danger, children,
}: {
  href?:     string
  onClick?:  () => void
  danger?:   boolean
  children:  React.ReactNode
}) {
  const base: React.CSSProperties = {
    display:        'inline-flex',
    alignItems:     'center',
    gap:            4,
    padding:        '4px 12px',
    border:         danger ? '1px solid var(--color-danger)' : '1px solid var(--border-base)',
    color:          danger ? 'var(--color-danger)' : 'var(--text-secondary)',
    textDecoration: 'none',
    fontSize:       'var(--text-xs)',
    fontFamily:     'var(--font-body)',
    letterSpacing:  '0.06em',
    textTransform:  'uppercase',
    background:     'transparent',
    borderRadius:   0,
    cursor:         'pointer',
    transition:     'background 0.15s, color 0.15s, border-color 0.15s',
  }

  function onEnter(e: React.MouseEvent<HTMLElement>) {
    const el = e.currentTarget as HTMLElement
    el.style.background  = 'var(--border-strong)'
    el.style.color       = 'var(--text-inverse)'
    el.style.borderColor = 'var(--border-strong)'
  }
  function onLeave(e: React.MouseEvent<HTMLElement>) {
    const el = e.currentTarget as HTMLElement
    el.style.background  = 'transparent'
    el.style.color       = danger ? 'var(--color-danger)' : 'var(--text-secondary)'
    el.style.borderColor = danger ? 'var(--color-danger)' : 'var(--border-base)'
  }

  if (href) {
    return (
      <Link href={href} style={base} onMouseEnter={onEnter} onMouseLeave={onLeave}>
        {children}
      </Link>
    )
  }
  return (
    <button onClick={onClick} style={base} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {children}
    </button>
  )
}

export function InvoiceTable({ rows, loading, role, onDelete }: Props) {
  if (loading) {
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {Array.from({ length: 6 }).map((_, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border-light)', animation: `fadeIn 0.3s ease-out ${i * 60}ms both` }}>
              <td style={{ padding: '0.75rem 1rem' }}>
                <span className="skeleton" style={{ width: 110, height: 14 }} />
              </td>
              <td style={{ padding: '0.75rem 1rem' }}>
                <span className="skeleton" style={{ width: 60, height: 12 }} />
              </td>
              <td style={{ padding: '0.75rem 1rem' }}>
                <span className="skeleton" style={{ width: 80, height: 20 }} />
              </td>
              <td style={{ padding: '0.75rem 1rem' }}>
                <span className="skeleton" style={{ width: 70, height: 12 }} />
              </td>
              <td style={{ padding: '0.75rem 1rem' }}>
                <span className="skeleton" style={{ width: 90, height: 12 }} />
              </td>
              <td style={{ padding: '0.75rem 1rem' }}>
                <span className="skeleton" style={{ width: 100, height: 12 }} />
              </td>
              <td style={{ padding: '0.75rem 1rem' }}>
                <span className="skeleton" style={{ width: 72, height: 12 }} />
              </td>
              <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                <span className="skeleton" style={{ width: 50, height: 24 }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  if (!rows.length) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          No invoices found
        </p>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          Adjust your filters or create a new invoice.
        </p>
      </div>
    )
  }

  const canDelete = role === 'admin'

  return (
    <>
      {/* Desktop table */}
      <div className="invoice-table-wrap" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>PO Number</th>
              <th style={th}>MR</th>
              <th style={th}>Status</th>
              <th style={th}>Store</th>
              <th style={th}>Rate Date</th>
              <th style={th}>Pricing Rule</th>
              <th style={th}>Created</th>
              <th style={{ ...th, textAlign: 'right' }} />
            </tr>
          </thead>
          <tbody className="stagger-children">
            {rows.map(row => (
              <tr
                key={row.id}
                style={{ transition: 'background 0.18s ease-out' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <td style={td}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                    {row.po_number}
                  </span>
                  {row.is_locked && (
                    <i
                      className="fa-solid fa-lock"
                      style={{ marginLeft: 7, fontSize: 9, color: 'var(--text-muted)' }}
                      title="Locked"
                    />
                  )}
                </td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                  {row.mr_number || '—'}
                </td>
                <td style={td}>
                  <StatusBadge status={row.status} />
                </td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>
                  {row.store || '—'}
                </td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                  {row.daily_metal_rates?.rate_date || '—'}
                </td>
                <td style={{ ...td, color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
                  {row.pricing_rules?.name || '—'}
                </td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {row.created_at.slice(0, 10)}
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <ActionBtn href={`/invoices/${row.id}`}>
                      <i className="fa-regular fa-eye" style={{ fontSize: 10 }} /> View
                    </ActionBtn>
                    {!row.is_locked && (role === 'admin' || role === 'manager' || (role === 'user' && row.status === 'draft')) && (
                      <ActionBtn href={`/invoices/${row.id}/edit`}>
                        <i className="fa-regular fa-pen-to-square" style={{ fontSize: 10 }} /> Edit
                      </ActionBtn>
                    )}
                    {canDelete && !row.is_locked && (
                      <ActionBtn danger onClick={() => onDelete(row.id, row.po_number)}>
                        <i className="fa-regular fa-trash-can" style={{ fontSize: 10 }} />
                      </ActionBtn>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="invoice-card-list">
        {rows.map(row => (
          <Link key={row.id} href={`/invoices/${row.id}`} className="invoice-card">
            <div className="invoice-card-row1">
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                {row.is_locked && (
                  <i className="fa-solid fa-lock" style={{ fontSize: 9, marginRight: 5, color: 'var(--text-muted)' }} />
                )}
                {row.po_number}
              </span>
              <StatusBadge status={row.status} />
            </div>
            <div className="invoice-card-row2">
              {row.mr_number && <span>MR: {row.mr_number}</span>}
              {row.store && <span>{row.store}</span>}
              <span>{row.created_at.slice(0, 10)}</span>
              {row.daily_metal_rates?.rate_date && <span>Rate: {row.daily_metal_rates.rate_date}</span>}
            </div>
          </Link>
        ))}
      </div>
    </>
  )
}
