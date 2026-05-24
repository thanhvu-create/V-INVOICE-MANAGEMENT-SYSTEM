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

const input: React.CSSProperties = {
  padding:      '0.4rem 0.6rem',
  border:       '1px solid var(--border-base)',
  borderRadius: 0,
  fontFamily:   'var(--font-body)',
  fontSize:     'var(--text-sm)',
  color:        'var(--text-primary)',
  background:   'var(--bg-surface)',
  outline:      'none',
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
        display:    'flex',
        flexWrap:   'wrap',
        gap:        '0.5rem',
        alignItems: 'flex-end',
        padding:    '0.75rem 1rem',
        background: 'var(--bg-surface)',
        border:     '1px solid var(--border-base)',
        marginBottom: '0.75rem',
      }}
    >
      <input
        type="text"
        placeholder="Search PO, MR, store..."
        value={local.search}
        onChange={e => setLocal(v => ({ ...v, search: e.target.value }))}
        style={{ ...input, minWidth: 200 }}
      />
      <select
        value={local.status}
        onChange={e => setLocal(v => ({ ...v, status: e.target.value }))}
        style={{ ...input, minWidth: 160 }}
      >
        {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <input type="date" value={local.dateFrom} onChange={e => setLocal(v => ({ ...v, dateFrom: e.target.value }))} style={input} />
      <span style={{ lineHeight: '34px', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>–</span>
      <input type="date" value={local.dateTo} onChange={e => setLocal(v => ({ ...v, dateTo: e.target.value }))} style={input} />
      <button type="submit" style={{ ...input, background: 'var(--text-primary)', color: 'var(--bg-base)', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
        Filter
      </button>
      <button type="button" onClick={clear} style={{ ...input, background: 'transparent', cursor: 'pointer' }}>
        Clear
      </button>
    </form>
  )
}
