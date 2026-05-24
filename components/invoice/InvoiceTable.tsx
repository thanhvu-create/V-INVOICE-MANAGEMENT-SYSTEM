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

const th: React.CSSProperties = {
  padding: '0.55rem 0.75rem', textAlign: 'left', fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
  color: 'var(--text-secondary)', borderBottom: '2px solid var(--border-base)',
  background: 'var(--bg-surface)', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  padding: '0.65rem 0.75rem', borderBottom: '1px solid var(--border-light)',
  fontSize: 'var(--text-sm)', color: 'var(--text-primary)', verticalAlign: 'middle',
}
const actionBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px',
  border: '1px solid var(--border-base)', color: 'var(--text-primary)',
  textDecoration: 'none', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)',
  background: 'transparent', borderRadius: 0,
}

export function InvoiceTable({ rows, loading, role, onDelete }: Props) {
  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 8 }} />
        Loading invoices...
      </div>
    )
  }
  if (!rows.length) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No invoices found.</div>
  }

  const canDelete = role === 'admin'

  return (
    <>
      {/* Desktop table (hidden < 640px via CSS) */}
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
              <th style={th}>Created By</th>
              <th style={th}>Date</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr
                key={row.id}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <td style={td}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{row.po_number}</span>
                  {row.is_locked && <i className="fa-solid fa-lock" style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)' }} title="Locked" />}
                </td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{row.mr_number || '—'}</td>
                <td style={td}><StatusBadge status={row.status} /></td>
                <td style={td}>{row.store || '—'}</td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{row.daily_metal_rates?.rate_date || '—'}</td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{row.pricing_rules?.name || '—'}</td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{row.created_by}</td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>{row.created_at.slice(0, 10)}</td>
                <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <Link href={`/invoices/${row.id}`} style={actionBtn}>
                      <i className="fa-solid fa-eye" style={{ fontSize: 10 }} /> View
                    </Link>
                    {!row.is_locked && (role === 'admin' || role === 'manager' || (role === 'user' && row.status === 'draft')) && (
                      <Link href={`/invoices/${row.id}/edit`} style={actionBtn}>
                        <i className="fa-solid fa-pen" style={{ fontSize: 10 }} /> Edit
                      </Link>
                    )}
                    {canDelete && !row.is_locked && (
                      <button onClick={() => onDelete(row.id, row.po_number)} style={{ ...actionBtn, border: '1px solid var(--color-danger)', color: 'var(--color-danger)', cursor: 'pointer' }}>
                        <i className="fa-solid fa-trash" style={{ fontSize: 10 }} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list (hidden >= 640px via CSS) */}
      <div className="invoice-card-list">
        {rows.map(row => (
          <Link key={row.id} href={`/invoices/${row.id}`} className="invoice-card">
            <div className="invoice-card-row1">
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                {row.is_locked && <i className="fa-solid fa-lock" style={{ fontSize: 9, marginRight: 5, color: 'var(--text-muted)' }} />}
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
