'use client'

import { useState } from 'react'
import type { InvoiceFilters } from '@/types'

const STATUS_OPTIONS = [
  { value: '',                 label: 'All Statuses' },
  { value: 'draft',            label: 'Draft' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved',         label: 'Approved' },
  { value: 'invoiced',         label: 'Invoiced' },
]

interface Props {
  filters: InvoiceFilters
  onApply: (f: InvoiceFilters) => void
}

/* Bottom-border input — HP pattern */
const inputStyle: React.CSSProperties = {
  fontFamily:    'var(--font-body)',
  fontSize:      'var(--text-sm)',
  color:         'var(--text-primary)',
  background:    'transparent',
  border:        'none',
  borderBottom:  '1px solid var(--border-base)',
  borderRadius:  0,
  outline:       'none',
  padding:       '5px 2px',
  minWidth:      0,
}

export function FilterBar({ filters, onApply }: Props) {
  const [local, setLocal] = useState<InvoiceFilters>(filters)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    onApply(local)
  }

  function clear() {
    const empty: InvoiceFilters = { search: '', status: '', dateFrom: '', dateTo: '', rateId: '' }
    setLocal(empty)
    onApply(empty)
  }

  return (
    <form
      onSubmit={submit}
      style={{
        display:      'flex',
        flexWrap:     'wrap',
        gap:          '1.5rem',
        alignItems:   'flex-end',
        padding:      '1rem 1.25rem',
        background:   'var(--bg-surface)',
        border:       '1px solid var(--border-light)',
        marginBottom: '1rem',
      }}
    >
      {/* Search */}
      <div style={{ flex: '1 1 180px' }}>
        <label className="form-label">Search</label>
        <input
          type="text"
          placeholder="PO, MR, store…"
          value={local.search}
          onChange={e => setLocal(v => ({ ...v, search: e.target.value }))}
          style={inputStyle}
        />
      </div>

      {/* Status */}
      <div style={{ flex: '0 1 160px' }}>
        <label className="form-label">Status</label>
        <select
          value={local.status}
          onChange={e => setLocal(v => ({ ...v, status: e.target.value }))}
          style={inputStyle}
        >
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Date range */}
      <div style={{ flex: '0 1 130px' }}>
        <label className="form-label">From</label>
        <input
          type="date"
          value={local.dateFrom}
          onChange={e => setLocal(v => ({ ...v, dateFrom: e.target.value }))}
          style={inputStyle}
        />
      </div>

      <div style={{ flex: '0 1 130px' }}>
        <label className="form-label">To</label>
        <input
          type="date"
          value={local.dateTo}
          onChange={e => setLocal(v => ({ ...v, dateTo: e.target.value }))}
          style={inputStyle}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
        <button
          type="submit"
          className="btn-primary"
          style={{ padding: '6px 20px' }}
        >
          Filter
        </button>
        <button
          type="button"
          onClick={clear}
          className="btn-outline"
          style={{ padding: '5px 16px' }}
        >
          Clear
        </button>
      </div>
    </form>
  )
}
