'use client'

import Link from 'next/link'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DriveImage } from '@/components/invoice/DriveImage'
import type { Role } from '@/types'

interface InvoiceRow {
  id:            string
  invoice_code:  string
  channel:       string | null
  template_type: string | null
  status:        string
  created_at:    string
  finalized_at:  string | null
  invoice_products?: { image_url?: string | null; seq?: number }[] | null
}

interface Props {
  rows:     InvoiceRow[]
  loading:  boolean
  role:     Role
  onDelete: (id: string, code: string) => void
}

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
  padding:       '0.75rem 1rem',
  borderBottom:  '1px solid var(--border-light)',
  fontSize:      'var(--text-sm)',
  color:         'var(--text-primary)',
  verticalAlign: 'middle',
}

function ActionBtn({
  href, onClick, danger, children,
}: {
  href?:    string
  onClick?: () => void
  danger?:  boolean
  children: React.ReactNode
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
    return <Link href={href} style={base} onMouseEnter={onEnter} onMouseLeave={onLeave}>{children}</Link>
  }
  return <button onClick={onClick} style={base} onMouseEnter={onEnter} onMouseLeave={onLeave}>{children}</button>
}

export function InvoiceTable({ rows, loading, role, onDelete }: Props) {
  if (loading) {
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {Array.from({ length: 6 }).map((_, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border-light)', animation: `fadeIn 0.3s ease-out ${i * 60}ms both` }}>
              <td style={{ padding: '6px 8px', width: 52 }}><span className="skeleton" style={{ width: 38, height: 38 }} /></td>
              <td style={{ padding: '0.75rem 1rem' }}><span className="skeleton" style={{ width: 110, height: 14 }} /></td>
              <td style={{ padding: '0.75rem 1rem' }}><span className="skeleton" style={{ width: 80, height: 20 }} /></td>
              <td style={{ padding: '0.75rem 1rem' }}><span className="skeleton" style={{ width: 60, height: 18 }} /></td>
              <td style={{ padding: '0.75rem 1rem' }}><span className="skeleton" style={{ width: 70, height: 12 }} /></td>
              <td style={{ padding: '0.75rem 1rem' }}><span className="skeleton" style={{ width: 90, height: 12 }} /></td>
              <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}><span className="skeleton" style={{ width: 50, height: 24 }} /></td>
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
              <th style={{ ...th, width: 52 }} />
              <th style={th}>Invoice Code</th>
              <th style={th}>Status</th>
              <th style={th}>Template</th>
              <th style={th}>Channel</th>
              <th style={th}>Created</th>
              <th style={{ ...th, textAlign: 'right' }} />
            </tr>
          </thead>
          <tbody className="stagger-children">
            {rows.map(row => {
              const isLocked = row.status === 'finalized'
              const firstImg = row.invoice_products
                ?.slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
                .find(i => i.image_url)?.image_url ?? null

              return (
                <tr
                  key={row.id}
                  style={{ transition: 'background 0.18s ease-out' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td style={{ ...td, padding: '6px 8px', width: 52 }}>
                    <DriveImage url={firstImg} alt={row.invoice_code} size={38} />
                  </td>
                  <td style={td}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                      {row.invoice_code}
                    </span>
                    {isLocked && (
                      <i className="fa-solid fa-lock" style={{ marginLeft: 7, fontSize: 9, color: 'var(--text-muted)' }} title="Finalized" />
                    )}
                  </td>
                  <td style={td}>
                    <StatusBadge status={row.status} />
                  </td>
                  <td style={{ ...td, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    {row.template_type ? (
                      <span style={{ border: '1px solid var(--border-base)', padding: '2px 6px', fontFamily: 'var(--font-mono)' }}>
                        {row.template_type}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ ...td, color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
                    {row.channel || '—'}
                  </td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {row.created_at.slice(0, 10)}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <ActionBtn href={`/invoices/${row.id}`}>
                        <i className="fa-regular fa-eye" style={{ fontSize: 10 }} /> View
                      </ActionBtn>
                      {canDelete && !isLocked && (
                        <ActionBtn danger onClick={() => onDelete(row.id, row.invoice_code)}>
                          <i className="fa-regular fa-trash-can" style={{ fontSize: 10 }} />
                        </ActionBtn>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="invoice-card-list">
        {rows.map(row => {
          const isLocked = row.status === 'finalized'
          return (
            <Link key={row.id} href={`/invoices/${row.id}`} className="invoice-card">
              <div className="invoice-card-row1">
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                  {isLocked && <i className="fa-solid fa-lock" style={{ fontSize: 9, marginRight: 5, color: 'var(--text-muted)' }} />}
                  {row.invoice_code}
                </span>
                <StatusBadge status={row.status} />
              </div>
              <div className="invoice-card-row2">
                {row.template_type && <span>{row.template_type}</span>}
                {row.channel && <span>{row.channel}</span>}
                <span>{row.created_at.slice(0, 10)}</span>
              </div>
            </Link>
          )
        })}
      </div>
    </>
  )
}
