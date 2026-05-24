# Dashboard Module — V-Invoice

> **Route:** `/` (redirects to `/dashboard`) or `/dashboard`
> **Access:** All roles
> **Purpose:** High-level stats snapshot — invoice counts by status, recent activity, quick links

---

## 1. PAGE OVERVIEW

```
┌──────────────────────────────────────────────────────────────────┐
│ Good morning, Alice.                        May 23, 2026         │
├──────────────────────────────────────────────────────────────────┤
│ STAT CARDS (row)                                                 │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │   DRAFT    │  │  PENDING   │  │  APPROVED  │  │  INVOICED  │ │
│  │     12     │  │     3      │  │     7      │  │    248     │ │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘ │
├──────────────────────────────────────────────────────────────────┤
│ SUMMARY CARDS (admin + manager only)                             │
│  ┌───────────────────────┐  ┌───────────────────────┐           │
│  │  Total CIF This Month │  │  Total Items (All)    │           │
│  │      $128,450.00      │  │         1,842         │           │
│  └───────────────────────┘  └───────────────────────┘           │
├──────────────────────────────────────────────────────────────────┤
│ RECENT INVOICES                                      [View All →]│
│  PO-2026-003  VN SR        May 23  DRAFT      3 items           │
│  PO-2026-002  US Online    May 21  APPROVED  12 items           │
│  PO-2026-001  HP Store     May 20  INVOICED  18 items           │
├──────────────────────────────────────────────────────────────────┤
│ QUICK LINKS                                                      │
│  [+ New Invoice]  [Import Items]  [Metal Rates]  [Products]     │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. DATABASE — STATS RPC

```sql
-- Function: get_dashboard_stats
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'by_status', (
      SELECT json_object_agg(status, cnt)
      FROM (
        SELECT status, COUNT(*) AS cnt
        FROM invoice_headers
        GROUP BY status
      ) s
    ),
    'total_items', (
      SELECT COUNT(*) FROM invoice_items
    ),
    'month_cif', (
      SELECT COALESCE(SUM(i.cif_price), 0)
      FROM invoice_items i
      JOIN invoice_headers h ON h.id = i.invoice_id
      WHERE DATE_TRUNC('month', h.invoice_date) = DATE_TRUNC('month', CURRENT_DATE)
    ),
    'month_invoice_count', (
      SELECT COUNT(*)
      FROM invoice_headers
      WHERE DATE_TRUNC('month', invoice_date) = DATE_TRUNC('month', CURRENT_DATE)
    )
  ) INTO result;

  RETURN result;
END;
$$;
```

---

## 3. API ROUTE

### `GET /api/dashboard/stats`

```typescript
// app/api/dashboard/stats/route.ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'

export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

    const db = createServiceClient()
    const canSeePrice = ctx.role === 'admin' || ctx.role === 'manager'

    const { data, error } = await db.rpc('get_dashboard_stats')
    if (error) throw error

    const stats = data as {
      by_status:           Record<string, number>
      total_items:         number
      month_cif:           number
      month_invoice_count: number
    }

    // Mask price data for non-privileged roles
    return NextResponse.json({
      success: true,
      data: {
        by_status:  stats.by_status ?? {},
        total_items: stats.total_items,
        ...(canSeePrice ? {
          month_cif:           stats.month_cif,
          month_invoice_count: stats.month_invoice_count,
        } : {}),
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
```

### `GET /api/dashboard/recent`

```typescript
// app/api/dashboard/recent/route.ts
export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

  const db = createServiceClient()

  const { data } = await db
    .from('invoice_headers')
    .select(`
      id, po_number, customer_name, invoice_date, status, is_locked,
      item_count:invoice_items(count)
    `)
    .order('created_at', { ascending: false })
    .limit(5)

  return NextResponse.json({ success: true, data: data ?? [] })
}
```

---

## 4. CLIENT PAGE COMPONENT

```tsx
// app/(dashboard)/dashboard/page.tsx
import { DashboardClient } from '@/components/dashboard/DashboardClient'
export const metadata = { title: 'Dashboard — V-Invoice' }
export default function DashboardPage() {
  return <DashboardClient />
}
```

```tsx
// components/dashboard/DashboardClient.tsx
'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@/contexts/UserContext'
import { StatCards } from './StatCards'
import { SummaryCards } from './SummaryCards'
import { RecentInvoices } from './RecentInvoices'
import { QuickLinks } from './QuickLinks'

interface Stats {
  by_status:           Record<string, number>
  total_items:         number
  month_cif?:          number
  month_invoice_count?: number
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

export function DashboardClient() {
  const { user } = useUser()
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [recent,  setRecent]  = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard/stats').then(r => r.json()),
      fetch('/api/dashboard/recent').then(r => r.json()),
    ]).then(([statsRes, recentRes]) => {
      if (statsRes.success)  setStats(statsRes.data)
      if (recentRes.success) setRecent(recentRes.data)
    }).finally(() => setLoading(false))
  }, [])

  const canSeePrice = user.role === 'admin' || user.role === 'manager'

  return (
    <div>
      {/* Greeting header */}
      <div
        style={{
          display:        'flex',
          justifyContent: 'space-between',
          alignItems:     'baseline',
          marginBottom:   '2rem',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize:   'var(--text-3xl)',
            fontWeight: 400,
            color:      'var(--text-primary)',
            margin:     0,
          }}
        >
          {greeting()}, {user.full_name.split(' ')[0]}.
        </h1>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          {formatDate(new Date())}
        </span>
      </div>

      {/* Status stat cards */}
      <StatCards stats={stats} loading={loading} />

      {/* Financial summary (admin + manager only) */}
      {canSeePrice && (
        <SummaryCards stats={stats} loading={loading} />
      )}

      {/* Recent invoices */}
      <RecentInvoices rows={recent} loading={loading} />

      {/* Quick links */}
      <QuickLinks role={user.role} />
    </div>
  )
}
```

---

## 5. STAT CARDS COMPONENT

```tsx
// components/dashboard/StatCards.tsx

const STATUS_CARDS = [
  { key: 'draft',            label: 'Draft',           color: 'var(--text-secondary)' },
  { key: 'pending_approval', label: 'Pending Approval', color: 'var(--color-warning)'  },
  { key: 'approved',         label: 'Approved',         color: 'var(--color-success)'  },
  { key: 'invoiced',         label: 'Invoiced',         color: 'var(--text-primary)'   },
]

export function StatCards({ stats, loading }: { stats: any; loading: boolean }) {
  return (
    <div
      style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap:                 '1rem',
        marginBottom:        '1.5rem',
      }}
    >
      {STATUS_CARDS.map(({ key, label, color }) => (
        <a
          key={key}
          href={`/invoices?status=${key}`}
          style={{ textDecoration: 'none' }}
        >
          <div
            style={{
              padding:    '1.25rem 1.5rem',
              background: 'var(--bg-surface)',
              border:     `1px solid var(--border-base)`,
              borderTop:  `3px solid ${color}`,
              cursor:     'pointer',
            }}
          >
            <div
              style={{
                fontFamily:    'var(--font-body)',
                fontSize:      'var(--text-xs)',
                fontWeight:    600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color:         color,
                marginBottom:  '0.5rem',
              }}
            >
              {label}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize:   'var(--text-3xl)',
                fontWeight: 400,
                color:      'var(--text-primary)',
              }}
            >
              {loading ? '—' : (stats?.by_status?.[key] ?? 0).toLocaleString()}
            </div>
          </div>
        </a>
      ))}
    </div>
  )
}
```

---

## 6. SUMMARY CARDS COMPONENT

```tsx
// components/dashboard/SummaryCards.tsx

function formatUSD(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2,
  }).format(n)
}

export function SummaryCards({ stats, loading }: { stats: any; loading: boolean }) {
  return (
    <div
      style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap:                 '1rem',
        marginBottom:        '2rem',
      }}
    >
      {/* CIF this month */}
      <div
        style={{
          padding:    '1.25rem 1.5rem',
          background: 'var(--bg-surface)',
          border:     '1px solid var(--border-base)',
        }}
      >
        <div
          style={{
            fontFamily:    'var(--font-body)',
            fontSize:      'var(--text-xs)',
            fontWeight:    600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color:         'var(--text-secondary)',
            marginBottom:  '0.5rem',
          }}
        >
          CIF — This Month
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize:   'var(--text-2xl)',
            fontWeight: 500,
            color:      'var(--text-primary)',
          }}
        >
          {loading ? '—' : formatUSD(stats?.month_cif ?? 0)}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
          {loading ? '' : `${(stats?.month_invoice_count ?? 0)} invoices`}
        </div>
      </div>

      {/* Total items all-time */}
      <div
        style={{
          padding:    '1.25rem 1.5rem',
          background: 'var(--bg-surface)',
          border:     '1px solid var(--border-base)',
        }}
      >
        <div
          style={{
            fontFamily:    'var(--font-body)',
            fontSize:      'var(--text-xs)',
            fontWeight:    600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color:         'var(--text-secondary)',
            marginBottom:  '0.5rem',
          }}
        >
          Total Line Items
        </div>
        <div
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize:   'var(--text-3xl)',
            fontWeight: 400,
            color:      'var(--text-primary)',
          }}
        >
          {loading ? '—' : (stats?.total_items ?? 0).toLocaleString()}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
          all time
        </div>
      </div>
    </div>
  )
}
```

---

## 7. RECENT INVOICES COMPONENT

```tsx
// components/dashboard/RecentInvoices.tsx
import { StatusBadge } from '@/components/ui/StatusBadge'

export function RecentInvoices({ rows, loading }: { rows: any[]; loading: boolean }) {
  return (
    <section style={{ marginBottom: '2rem' }}>
      <div
        style={{
          display:        'flex',
          justifyContent: 'space-between',
          alignItems:     'baseline',
          marginBottom:   '0.75rem',
        }}
      >
        <h2
          style={{
            fontFamily:    'var(--font-body)',
            fontSize:      'var(--text-xs)',
            fontWeight:    600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color:         'var(--text-secondary)',
            margin:        0,
          }}
        >
          Recent Invoices
        </h2>
        <a
          href="/invoices"
          style={{
            fontSize:       'var(--text-xs)',
            color:          'var(--text-secondary)',
            textDecoration: 'none',
          }}
        >
          View All →
        </a>
      </div>

      <div
        style={{
          background: 'var(--bg-surface)',
          border:     '1px solid var(--border-base)',
        }}
      >
        {loading && (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 8 }} />
            Loading...
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            No invoices yet.
          </div>
        )}

        {rows.map((row, idx) => (
          <a
            key={row.id}
            href={`/invoices/${row.id}`}
            style={{
              display:        'flex',
              alignItems:     'center',
              gap:            '1rem',
              padding:        '0.75rem 1rem',
              borderBottom:   idx < rows.length - 1 ? '1px solid var(--border-base)' : 'none',
              textDecoration: 'none',
              color:          'inherit',
            }}
          >
            {/* PO */}
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize:   'var(--text-sm)',
                fontWeight: 500,
                color:      'var(--text-primary)',
                minWidth:   120,
              }}
            >
              {row.po_number}
            </span>

            {/* Customer */}
            <span
              style={{
                flex:     1,
                fontSize: 'var(--text-sm)',
                color:    'var(--text-secondary)',
              }}
            >
              {row.customer_name}
            </span>

            {/* Date */}
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {new Date(row.invoice_date).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric',
              })}
            </span>

            {/* Status */}
            <StatusBadge status={row.status} />

            {/* Items count */}
            <span
              style={{
                fontSize:   'var(--text-xs)',
                color:      'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                minWidth:   50,
                textAlign:  'right',
              }}
            >
              {row.item_count?.[0]?.count ?? 0} items
            </span>
          </a>
        ))}
      </div>
    </section>
  )
}
```

---

## 8. QUICK LINKS COMPONENT

```tsx
// components/dashboard/QuickLinks.tsx
import { useUser } from '@/contexts/UserContext'

interface LinkDef {
  href:   string
  label:  string
  icon:   string
  roles:  string[]
}

const LINKS: LinkDef[] = [
  { href: '/invoices/new',             label: 'New Invoice',    icon: 'fa-file-plus',      roles: ['admin','manager','user'] },
  { href: '/invoices',                 label: 'All Invoices',   icon: 'fa-list',            roles: ['admin','manager','user','viewer'] },
  { href: '/admin/metal-rates',        label: 'Metal Rates',    icon: 'fa-coins',           roles: ['admin','manager'] },
  { href: '/admin/pricing-rules',      label: 'Pricing Rules',  icon: 'fa-sliders',         roles: ['admin'] },
  { href: '/admin/products',           label: 'Products',       icon: 'fa-gem',             roles: ['admin'] },
  { href: '/admin/users',              label: 'Users',          icon: 'fa-users',           roles: ['admin'] },
]

export function QuickLinks({ role }: { role: string }) {
  const visible = LINKS.filter(l => l.roles.includes(role))

  if (visible.length === 0) return null

  return (
    <section>
      <h2
        style={{
          fontFamily:    'var(--font-body)',
          fontSize:      'var(--text-xs)',
          fontWeight:    600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color:         'var(--text-secondary)',
          margin:        '0 0 0.75rem',
        }}
      >
        Quick Links
      </h2>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
        {visible.map(link => (
          <a
            key={link.href}
            href={link.href}
            style={{
              display:        'inline-flex',
              alignItems:     'center',
              gap:            '0.5rem',
              padding:        '0.5rem 1.25rem',
              border:         '1px solid var(--border-base)',
              background:     'var(--bg-surface)',
              color:          'var(--text-primary)',
              fontFamily:     'var(--font-body)',
              fontSize:       'var(--text-sm)',
              textDecoration: 'none',
              borderRadius:   0,
            }}
          >
            <i className={`fa-solid ${link.icon}`} style={{ fontSize: 12 }} />
            {link.label}
          </a>
        ))}
      </div>
    </section>
  )
}
```

---

## 9. ROOT REDIRECT

```typescript
// app/page.tsx
import { redirect } from 'next/navigation'
export default function RootPage() {
  redirect('/dashboard')
}
```

---

## 10. COMPONENT STRUCTURE

```
app/
  page.tsx                              ← redirect('/dashboard')
  (dashboard)/
    dashboard/
      page.tsx                          ← Server wrapper
components/
  dashboard/
    DashboardClient.tsx                 ← Orchestrator
    StatCards.tsx                       ← Status count cards
    SummaryCards.tsx                    ← CIF + items totals (admin+mgr)
    RecentInvoices.tsx                  ← Last 5 invoices
    QuickLinks.tsx                      ← Role-filtered shortcut buttons
```

---

## 11. CONSTRAINTS

```
✓ Stats fetched via RPC — no full table scans in component code
✓ month_cif + month_invoice_count masked for user/viewer roles
✓ Stat cards are clickable links → /invoices?status={key}
✓ Greeting uses local time (Asia/Ho_Chi_Minh via browser timezone)
✓ Recent invoices limited to 5 rows — separate lightweight query
✓ QuickLinks filtered by role — viewer sees only "All Invoices"
✓ Stats and recent load in parallel (Promise.all)
✓ Loading state shows "—" for numbers, spinner for lists
```
