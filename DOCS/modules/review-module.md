# Review Module — V-Invoice

> **Route:** `/invoices`
> **Access:** All roles (admin / manager / user / viewer)
> **Purpose:** Invoice list with filters, search, pagination, and quick-action buttons

---

## 1. PAGE OVERVIEW

```
┌──────────────────────────────────────────────────────────────────┐
│ PAGE HEADER                                                      │
│  Invoices                       [+ New Invoice]  (admin/mgr/usr) │
├──────────────────────────────────────────────────────────────────┤
│ FILTER BAR                                                       │
│  [Search PO / Customer...]  [Status ▾]  [Metal Rate ▾]          │
│  [Date From] – [Date To]    [Clear Filters]                      │
├──────────────────────────────────────────────────────────────────┤
│ RESULTS COUNT: 24 invoices found                                 │
├──────────────────────────────────────────────────────────────────┤
│ TABLE                                                            │
│  PO Number   Customer   Date     Status    Items  Total   Actions│
│  ──────────────────────────────────────────────────────────────  │
│  PO-2026-001 HP Store   May 20   INVOICED  18     $4,250  [View] │
│  PO-2026-002 US Online  May 21   APPROVED  12     $2,180  [View] │
│  PO-2026-003 VN SR      May 23   DRAFT      3     $  620  [Edit] │
│  ...                                                             │
├──────────────────────────────────────────────────────────────────┤
│ PAGINATION: ← 1 2 3 ... 8 →                Showing 1–20 of 154  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. DATABASE QUERY

### Base query

```typescript
// GET /api/invoices
const { data, count } = await db
  .from('invoice_headers')
  .select(`
    id,
    po_number,
    customer_name,
    invoice_date,
    status,
    is_locked,
    metal_rate_id,
    pricing_rule_id,
    created_by,
    created_at,
    item_count:invoice_items(count),
    total_cif:invoice_items(cif_price.sum())
  `, { count: 'exact' })
  .order('created_at', { ascending: false })
  .range(offset, offset + pageSize - 1)
```

### Aggregates via RPC (preferred over subqueries)

```sql
-- Function: get_invoice_list
CREATE OR REPLACE FUNCTION get_invoice_list(
  p_status      TEXT    DEFAULT NULL,
  p_search      TEXT    DEFAULT NULL,
  p_date_from   DATE    DEFAULT NULL,
  p_date_to     DATE    DEFAULT NULL,
  p_rate_id     UUID    DEFAULT NULL,
  p_offset      INT     DEFAULT 0,
  p_limit       INT     DEFAULT 20
)
RETURNS TABLE (
  id            UUID,
  po_number     TEXT,
  customer_name TEXT,
  invoice_date  DATE,
  status        TEXT,
  is_locked     BOOLEAN,
  item_count    BIGINT,
  total_hpusa   NUMERIC,
  total_cif     NUMERIC,
  created_at    TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
  SELECT
    h.id,
    h.po_number,
    h.customer_name,
    h.invoice_date,
    h.status,
    h.is_locked,
    COUNT(i.id)         AS item_count,
    SUM(i.hpusa)        AS total_hpusa,
    SUM(i.cif_price)    AS total_cif,
    h.created_at
  FROM invoice_headers h
  LEFT JOIN invoice_items i ON i.invoice_id = h.id
  WHERE
    (p_status    IS NULL OR h.status        = p_status)
    AND (p_search    IS NULL OR h.po_number ILIKE '%' || p_search || '%'
                             OR h.customer_name ILIKE '%' || p_search || '%')
    AND (p_date_from IS NULL OR h.invoice_date >= p_date_from)
    AND (p_date_to   IS NULL OR h.invoice_date <= p_date_to)
    AND (p_rate_id   IS NULL OR h.metal_rate_id = p_rate_id)
  GROUP BY h.id
  ORDER BY h.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;
```

### Count query (separate for pagination)

```sql
-- Function: count_invoices
CREATE OR REPLACE FUNCTION count_invoices(
  p_status    TEXT  DEFAULT NULL,
  p_search    TEXT  DEFAULT NULL,
  p_date_from DATE  DEFAULT NULL,
  p_date_to   DATE  DEFAULT NULL,
  p_rate_id   UUID  DEFAULT NULL
)
RETURNS BIGINT LANGUAGE sql STABLE AS $$
  SELECT COUNT(DISTINCT h.id)
  FROM invoice_headers h
  WHERE
    (p_status    IS NULL OR h.status           = p_status)
    AND (p_search    IS NULL OR h.po_number    ILIKE '%' || p_search || '%'
                             OR h.customer_name ILIKE '%' || p_search || '%')
    AND (p_date_from IS NULL OR h.invoice_date >= p_date_from)
    AND (p_date_to   IS NULL OR h.invoice_date <= p_date_to)
    AND (p_rate_id   IS NULL OR h.metal_rate_id = p_rate_id);
$$;
```

---

## 3. API ROUTE

### `GET /api/invoices`

```typescript
// app/api/invoices/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

    const { searchParams } = req.nextUrl
    const page     = Math.max(1, parseInt(searchParams.get('page')   ?? '1'))
    const pageSize = Math.min(100, parseInt(searchParams.get('limit') ?? '20'))
    const offset   = (page - 1) * pageSize

    const params = {
      p_status:    searchParams.get('status')    || null,
      p_search:    searchParams.get('search')    || null,
      p_date_from: searchParams.get('dateFrom')  || null,
      p_date_to:   searchParams.get('dateTo')    || null,
      p_rate_id:   searchParams.get('rateId')    || null,
      p_offset:    offset,
      p_limit:     pageSize,
    }

    const db = createServiceClient()

    const [{ data: rows }, { data: total }] = await Promise.all([
      db.rpc('get_invoice_list', params),
      db.rpc('count_invoices', {
        p_status:    params.p_status,
        p_search:    params.p_search,
        p_date_from: params.p_date_from,
        p_date_to:   params.p_date_to,
        p_rate_id:   params.p_rate_id,
      }),
    ])

    return NextResponse.json({
      success: true,
      data: rows ?? [],
      pagination: {
        page,
        pageSize,
        total: Number(total ?? 0),
        totalPages: Math.ceil(Number(total ?? 0) / pageSize),
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
```

---

## 4. FILTER STATE

```typescript
interface InvoiceFilters {
  search:   string       // PO number or customer name
  status:   string       // '' | 'draft' | 'pending_approval' | 'approved' | 'invoiced'
  dateFrom: string       // yyyy-MM-dd
  dateTo:   string       // yyyy-MM-dd
  rateId:   string       // metal_rate.id UUID
}

const DEFAULT_FILTERS: InvoiceFilters = {
  search:   '',
  status:   '',
  dateFrom: '',
  dateTo:   '',
  rateId:   '',
}
```

Filters are synced to URL search params so the list is bookmarkable/shareable:

```typescript
// On filter change:
const params = new URLSearchParams()
if (filters.search)   params.set('search',   filters.search)
if (filters.status)   params.set('status',   filters.status)
if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
if (filters.dateTo)   params.set('dateTo',   filters.dateTo)
if (filters.rateId)   params.set('rateId',   filters.rateId)
params.set('page', '1')
router.push(`/invoices?${params.toString()}`)
```

---

## 5. TABLE COLUMNS

### Column config by role

```typescript
// admin / manager: see total_hpusa + total_cif
// user / viewer:   see only item_count (no price totals)

interface InvoiceRow {
  id:            string
  po_number:     string
  customer_name: string
  invoice_date:  string
  status:        string
  is_locked:     boolean
  item_count:    number
  total_hpusa:   number | null  // admin + manager only
  total_cif:     number | null  // admin + manager only
  created_at:    string
}

const columns = [
  { key: 'po_number',     label: 'PO Number',   mono: true  },
  { key: 'customer_name', label: 'Customer'               },
  { key: 'invoice_date',  label: 'Date'                   },
  { key: 'status',        label: 'Status',      badge: true },
  { key: 'item_count',    label: 'Items',       align: 'right' },
  // Conditional columns:
  { key: 'total_hpusa',   label: 'HPUSA Total', align: 'right', roles: ['admin','manager'] },
  { key: 'total_cif',     label: 'CIF Total',   align: 'right', roles: ['admin','manager'] },
  { key: 'actions',       label: '',            align: 'right' },
]
```

---

## 6. ACTION BUTTONS PER ROW

```typescript
// Determine available actions for each invoice row:
function getRowActions(invoice: InvoiceRow, role: string) {
  const actions: RowAction[] = []

  // View: always available for all roles
  actions.push({ label: 'View', href: `/invoices/${invoice.id}`, icon: 'fa-eye' })

  // Edit: available for non-locked invoices with write permissions
  if (!invoice.is_locked && (role === 'admin' || role === 'manager' || role === 'user')) {
    if (invoice.status === 'draft') {
      actions.push({ label: 'Edit', href: `/invoices/${invoice.id}/edit`, icon: 'fa-pen' })
    }
  }

  // Import: draft + not locked
  if (!invoice.is_locked && invoice.status === 'draft'
      && (role === 'admin' || role === 'manager' || role === 'user')) {
    actions.push({
      label: 'Import',
      href:  `/import?invoiceId=${invoice.id}`,
      icon:  'fa-file-import',
    })
  }

  return actions
}
```

---

## 7. CLIENT COMPONENT

```tsx
// app/(dashboard)/invoices/page.tsx
import { Suspense } from 'react'
import { InvoiceListClient } from '@/components/invoice/InvoiceListClient'

export const metadata = { title: 'Invoices — V-Invoice' }

export default function InvoicesPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <InvoiceListClient />
    </Suspense>
  )
}
```

```tsx
// components/invoice/InvoiceListClient.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { FilterBar } from './FilterBar'
import { InvoiceTable } from './InvoiceTable'
import { Pagination } from '@/components/ui/Pagination'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { InvoiceRow, InvoiceFilters } from '@/types'

export function InvoiceListClient() {
  const { user, canDo } = useUser()
  const router          = useRouter()
  const searchParams    = useSearchParams()

  const [rows,       setRows]       = useState<InvoiceRow[]>([])
  const [total,      setTotal]      = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading,    setLoading]    = useState(false)

  // Read filters from URL
  const page    = parseInt(searchParams.get('page')   ?? '1')
  const filters: InvoiceFilters = {
    search:   searchParams.get('search')   ?? '',
    status:   searchParams.get('status')   ?? '',
    dateFrom: searchParams.get('dateFrom') ?? '',
    dateTo:   searchParams.get('dateTo')   ?? '',
    rateId:   searchParams.get('rateId')   ?? '',
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (filters.search)   params.set('search',   filters.search)
      if (filters.status)   params.set('status',   filters.status)
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
      if (filters.dateTo)   params.set('dateTo',   filters.dateTo)
      if (filters.rateId)   params.set('rateId',   filters.rateId)

      const res  = await fetch(`/api/invoices?${params}`)
      const json = await res.json()
      if (json.success) {
        setRows(json.data)
        setTotal(json.pagination.total)
        setTotalPages(json.pagination.totalPages)
      }
    } finally {
      setLoading(false)
    }
  }, [searchParams])

  useEffect(() => { fetchData() }, [fetchData])

  function applyFilters(next: InvoiceFilters) {
    const params = new URLSearchParams()
    Object.entries(next).forEach(([k, v]) => { if (v) params.set(k, v) })
    params.set('page', '1')
    router.push(`/invoices?${params}`)
  }

  return (
    <div>
      {/* Page header */}
      <div
        style={{
          display:        'flex',
          justifyContent: 'space-between',
          alignItems:     'center',
          marginBottom:   '1.5rem',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize:   'var(--text-2xl)',
            fontWeight: 400,
            color:      'var(--text-primary)',
            margin:     0,
          }}
        >
          Invoices
        </h1>
        {canDo('create') && (
          <a
            href="/invoices/new"
            style={{
              display:        'inline-flex',
              alignItems:     'center',
              gap:            '0.5rem',
              padding:        '0.5rem 1.25rem',
              background:     'var(--text-primary)',
              color:          'var(--bg-base)',
              fontFamily:     'var(--font-body)',
              fontSize:       'var(--text-sm)',
              fontWeight:     500,
              letterSpacing:  '0.05em',
              textDecoration: 'none',
              borderRadius:   0,
            }}
          >
            <i className="fa-solid fa-plus" />
            New Invoice
          </a>
        )}
      </div>

      {/* Filters */}
      <FilterBar filters={filters} onApply={applyFilters} />

      {/* Count */}
      {!loading && (
        <p
          style={{
            fontSize:     'var(--text-sm)',
            color:        'var(--text-muted)',
            margin:       '1rem 0 0.75rem',
          }}
        >
          {total.toLocaleString()} invoice{total !== 1 ? 's' : ''} found
        </p>
      )}

      {/* Table */}
      <InvoiceTable
        rows={rows}
        loading={loading}
        role={user.role}
        canSeePrice={user.role === 'admin' || user.role === 'manager'}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={20}
          onPageChange={(p) => {
            const params = new URLSearchParams(searchParams.toString())
            params.set('page', String(p))
            router.push(`/invoices?${params}`)
          }}
        />
      )}
    </div>
  )
}
```

---

## 8. FILTER BAR COMPONENT

```tsx
// components/invoice/FilterBar.tsx
'use client'

import { useState } from 'react'
import type { InvoiceFilters } from '@/types'

const STATUS_OPTIONS = [
  { value: '',                  label: 'All Statuses' },
  { value: 'draft',             label: 'Draft' },
  { value: 'pending_approval',  label: 'Pending Approval' },
  { value: 'approved',          label: 'Approved' },
  { value: 'invoiced',          label: 'Invoiced' },
]

interface Props {
  filters:  InvoiceFilters
  onApply: (f: InvoiceFilters) => void
}

export function FilterBar({ filters, onApply }: Props) {
  const [local, setLocal] = useState<InvoiceFilters>(filters)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onApply(local)
  }

  function handleClear() {
    const empty: InvoiceFilters = { search: '', status: '', dateFrom: '', dateTo: '', rateId: '' }
    setLocal(empty)
    onApply(empty)
  }

  const inputStyle: React.CSSProperties = {
    padding:      '0.4rem 0.6rem',
    border:       '1px solid var(--border-base)',
    borderRadius: 0,
    fontFamily:   'var(--font-body)',
    fontSize:     'var(--text-sm)',
    color:        'var(--text-primary)',
    background:   'var(--bg-surface)',
    outline:      'none',
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display:         'flex',
        flexWrap:        'wrap',
        gap:             '0.5rem',
        alignItems:      'flex-end',
        padding:         '1rem',
        background:      'var(--bg-surface)',
        border:          '1px solid var(--border-base)',
      }}
    >
      {/* Search */}
      <input
        type="text"
        placeholder="Search PO / Customer..."
        value={local.search}
        onChange={e => setLocal(v => ({ ...v, search: e.target.value }))}
        style={{ ...inputStyle, minWidth: 200 }}
      />

      {/* Status */}
      <select
        value={local.status}
        onChange={e => setLocal(v => ({ ...v, status: e.target.value }))}
        style={{ ...inputStyle, minWidth: 160 }}
      >
        {STATUS_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Date range */}
      <input
        type="date"
        value={local.dateFrom}
        onChange={e => setLocal(v => ({ ...v, dateFrom: e.target.value }))}
        style={inputStyle}
      />
      <span style={{ lineHeight: '34px', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
        –
      </span>
      <input
        type="date"
        value={local.dateTo}
        onChange={e => setLocal(v => ({ ...v, dateTo: e.target.value }))}
        style={inputStyle}
      />

      {/* Apply */}
      <button
        type="submit"
        style={{
          padding:       '0.4rem 1rem',
          background:    'var(--text-primary)',
          color:         'var(--bg-base)',
          border:        'none',
          borderRadius:  0,
          fontFamily:    'var(--font-body)',
          fontSize:      'var(--text-sm)',
          cursor:        'pointer',
        }}
      >
        Filter
      </button>

      {/* Clear */}
      <button
        type="button"
        onClick={handleClear}
        style={{
          padding:       '0.4rem 0.75rem',
          background:    'transparent',
          color:         'var(--text-secondary)',
          border:        '1px solid var(--border-base)',
          borderRadius:  0,
          fontFamily:    'var(--font-body)',
          fontSize:      'var(--text-sm)',
          cursor:        'pointer',
        }}
      >
        Clear
      </button>
    </form>
  )
}
```

---

## 9. TABLE COMPONENT

```tsx
// components/invoice/InvoiceTable.tsx
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { InvoiceRow } from '@/types'

interface Props {
  rows:         InvoiceRow[]
  loading:      boolean
  role:         string
  canSeePrice:  boolean
}

function formatUSD(n: number | null): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2,
  }).format(n)
}

function formatDate(d: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  }).format(new Date(d))
}

export function InvoiceTable({ rows, loading, role, canSeePrice }: Props) {
  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 8 }} />
        Loading invoices...
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        No invoices found.
      </div>
    )
  }

  const thStyle: React.CSSProperties = {
    padding:       '0.6rem 0.75rem',
    textAlign:     'left',
    fontFamily:    'var(--font-body)',
    fontSize:      'var(--text-xs)',
    fontWeight:    600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color:         'var(--text-secondary)',
    borderBottom:  '2px solid var(--border-base)',
    background:    'var(--bg-surface)',
    whiteSpace:    'nowrap',
  }

  const tdStyle: React.CSSProperties = {
    padding:      '0.7rem 0.75rem',
    borderBottom: '1px solid var(--border-base)',
    fontSize:     'var(--text-sm)',
    color:        'var(--text-primary)',
    verticalAlign:'middle',
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>PO Number</th>
            <th style={thStyle}>Customer</th>
            <th style={thStyle}>Date</th>
            <th style={thStyle}>Status</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Items</th>
            {canSeePrice && (
              <>
                <th style={{ ...thStyle, textAlign: 'right' }}>HPUSA</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>CIF Total</th>
              </>
            )}
            <th style={thStyle} />
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={row.id}
              style={{ cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                {row.po_number}
                {row.is_locked && (
                  <i
                    className="fa-solid fa-lock"
                    style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)' }}
                    title="Locked"
                  />
                )}
              </td>
              <td style={tdStyle}>{row.customer_name}</td>
              <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDate(row.invoice_date)}</td>
              <td style={tdStyle}><StatusBadge status={row.status} /></td>
              <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                {row.item_count}
              </td>
              {canSeePrice && (
                <>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {formatUSD(row.total_hpusa)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {formatUSD(row.total_cif)}
                  </td>
                </>
              )}
              <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                <a
                  href={`/invoices/${row.id}`}
                  style={{
                    display:        'inline-flex',
                    alignItems:     'center',
                    gap:            4,
                    padding:        '3px 10px',
                    border:         '1px solid var(--border-base)',
                    color:          'var(--text-primary)',
                    textDecoration: 'none',
                    fontSize:       'var(--text-xs)',
                    fontFamily:     'var(--font-body)',
                    background:     'transparent',
                  }}
                >
                  <i className="fa-solid fa-eye" style={{ fontSize: 10 }} />
                  View
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

---

## 10. PAGINATION COMPONENT

```tsx
// components/ui/Pagination.tsx
interface Props {
  page:         number
  totalPages:   number
  total:        number
  pageSize:     number
  onPageChange: (page: number) => void
}

export function Pagination({ page, totalPages, total, pageSize, onPageChange }: Props) {
  const from = (page - 1) * pageSize + 1
  const to   = Math.min(page * pageSize, total)

  const btnStyle = (active: boolean, disabled: boolean): React.CSSProperties => ({
    padding:    '0.3rem 0.65rem',
    border:     '1px solid var(--border-base)',
    background: active  ? 'var(--text-primary)' : 'transparent',
    color:      active  ? 'var(--bg-base)'
               : disabled ? 'var(--text-muted)'
               : 'var(--text-primary)',
    fontSize:   'var(--text-sm)',
    cursor:     disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--font-mono)',
    borderRadius: 0,
  })

  // Build page window: always show first, last, current±1, with ellipsis
  function pageWindows(): (number | '…')[] {
    const pages: (number | '…')[] = []
    const delta = 1
    const range: number[] = []
    for (let i = Math.max(2, page - delta); i <= Math.min(totalPages - 1, page + delta); i++) {
      range.push(i)
    }
    pages.push(1)
    if (range[0] > 2) pages.push('…')
    pages.push(...range)
    if (range[range.length - 1] < totalPages - 1) pages.push('…')
    if (totalPages > 1) pages.push(totalPages)
    return pages
  }

  return (
    <div
      style={{
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
        marginTop:      '1.25rem',
      }}
    >
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        Showing {from}–{to} of {total.toLocaleString()}
      </span>

      <div style={{ display: 'flex', gap: 4 }}>
        <button
          style={btnStyle(false, page === 1)}
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
        >
          ←
        </button>

        {pageWindows().map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} style={{ padding: '0.3rem 0.4rem', color: 'var(--text-muted)' }}>
              …
            </span>
          ) : (
            <button
              key={p}
              style={btnStyle(p === page, false)}
              onClick={() => onPageChange(p as number)}
            >
              {p}
            </button>
          )
        )}

        <button
          style={btnStyle(false, page === totalPages)}
          disabled={page === totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          →
        </button>
      </div>
    </div>
  )
}
```

---

## 11. COMPONENT STRUCTURE

```
app/
  (dashboard)/
    invoices/
      page.tsx                      ← Server wrapper with Suspense
components/
  invoice/
    InvoiceListClient.tsx           ← Main list orchestrator
    FilterBar.tsx                   ← Search + filter controls
    InvoiceTable.tsx                ← Table with role-aware columns
  ui/
    Pagination.tsx                  ← Reusable pagination
    StatusBadge.tsx                 ← Status chip (shared with detail)
types/
  invoice.ts                        ← InvoiceRow, InvoiceFilters types
```

---

## 12. CONSTRAINTS

```
✓ URL-persisted filters — browser back/forward works correctly
✓ canSeePrice gate — total_hpusa + total_cif columns hidden for user/viewer
✓ is_locked icon shown inline with PO number
✓ Row hover highlight — var(--bg-hover) consistent with design system
✓ Pagination: show ellipsis for large page counts
✓ Table is horizontally scrollable on small viewports
✓ Empty state shown when no results match filters
✓ Loading skeleton while fetching (spinner centered)
✓ Page resets to 1 when filters change
✓ Aggregates (item_count, total_cif) via DB-side RPC — no N+1 queries
```
