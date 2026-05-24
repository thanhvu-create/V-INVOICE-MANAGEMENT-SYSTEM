# Audit Log Module — V-Invoice

> **Route:** `/invoices/[id]` (timeline section within invoice detail)
> **API:** `GET /api/invoices/[id]/audit-log`
> **Access:** All roles that can view the invoice

---

## 1. PURPOSE

Track every status transition and significant action on an invoice — who did what, when, and any accompanying note. Provides full traceability for approval workflows, dispute resolution, and compliance.

---

## 2. DATABASE SCHEMA

```sql
CREATE TABLE audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   UUID NOT NULL REFERENCES invoice_headers(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES app_users(id),
  action       TEXT NOT NULL,
  from_status  TEXT,
  to_status    TEXT,
  note         TEXT,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_logs_invoice_id ON audit_logs(invoice_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
```

### Action Types

```typescript
type AuditAction =
  | 'created'          // Invoice created (draft)
  | 'updated'          // Fields edited (still draft)
  | 'submitted'        // draft → pending_approval
  | 'approved'         // pending_approval → approved
  | 'rejected'         // pending_approval → draft
  | 'invoiced'         // approved → invoiced (triggers snapshot)
  | 'items_imported'   // Bulk import of line items
  | 'item_added'       // Single line item added
  | 'item_updated'     // Line item edited
  | 'item_deleted'     // Line item removed
  | 'discount_applied' // sell_price or after_discount_price changed
```

### metadata JSONB Examples

```typescript
// items_imported:
{ count: 18, errors: 3 }

// item_added / item_deleted:
{ line_no: 5, sku: 'RING-001' }

// discount_applied:
{ line_no: 3, sell_price_before: 450.00, sell_price_after: 420.00 }

// updated (header fields changed):
{ fields: ['po_number', 'customer_name'] }
```

---

## 3. WHEN TO WRITE AUDIT LOGS

### Application-level logging (API routes write explicitly)

```typescript
// lib/audit/log.ts
import { createServiceClient } from '@/lib/supabase/server'

interface LogParams {
  invoiceId: string
  userId:    string
  action:    AuditAction
  fromStatus?: string
  toStatus?:  string
  note?:      string
  metadata?:  Record<string, unknown>
}

export async function writeAuditLog(params: LogParams): Promise<void> {
  const db = createServiceClient()
  await db.from('audit_logs').insert({
    invoice_id:  params.invoiceId,
    user_id:     params.userId,
    action:      params.action,
    from_status: params.fromStatus ?? null,
    to_status:   params.toStatus  ?? null,
    note:        params.note      ?? null,
    metadata:    params.metadata  ?? {},
  })
  // Fire-and-forget is acceptable — do NOT await in hot path
  // Use .then().catch(console.error) if detached
}
```

### Call sites

```typescript
// POST /api/invoices — invoice created
await writeAuditLog({ invoiceId, userId, action: 'created', toStatus: 'draft' })

// PATCH /api/invoices/[id]/status — status transition
await writeAuditLog({
  invoiceId, userId,
  action:     mapStatusToAction(toStatus),  // 'submitted' | 'approved' | etc.
  fromStatus: invoice.status,
  toStatus,
  note:       body.note,
})

// POST /api/import — bulk import
await writeAuditLog({
  invoiceId, userId,
  action:   'items_imported',
  metadata: { count: validRows.length, errors: errorRows.length },
})

// PATCH /api/invoices/[id]/items/[itemId] — edit line item
await writeAuditLog({
  invoiceId, userId, action: 'item_updated',
  metadata: { line_no: item.line_no, sku: item.sku_jwmold },
})
```

### Status → Action mapping

```typescript
function mapStatusToAction(toStatus: string): AuditAction {
  const map: Record<string, AuditAction> = {
    pending_approval: 'submitted',
    approved:         'approved',
    draft:            'rejected',  // approval rejected → back to draft
    invoiced:         'invoiced',
  }
  return map[toStatus] ?? 'updated'
}
```

---

## 4. API ROUTE

### `GET /api/invoices/[id]/audit-log`

```typescript
// app/api/invoices/[id]/audit-log/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

    const db = createServiceClient()

    // Verify the user can access this invoice
    const { data: invoice, error: invErr } = await db
      .from('invoice_headers')
      .select('id, status')
      .eq('id', params.id)
      .single()

    if (invErr || !invoice) {
      return NextResponse.json({ success: false, message: 'Invoice not found' }, { status: 404 })
    }

    // Fetch logs with user info — newest first
    const { data: logs, error } = await db
      .from('audit_logs')
      .select(`
        id,
        action,
        from_status,
        to_status,
        note,
        metadata,
        created_at,
        app_users!user_id (
          id,
          full_name,
          email,
          role
        )
      `)
      .eq('invoice_id', params.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ success: true, data: logs ?? [] })
  } catch (err) {
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
```

### Response shape

```typescript
interface AuditLogEntry {
  id:          string
  action:      AuditAction
  from_status: string | null
  to_status:   string | null
  note:        string | null
  metadata:    Record<string, unknown>
  created_at:  string
  app_users: {
    id:        string
    full_name: string
    email:     string
    role:      string
  }
}
```

---

## 5. UI — AUDIT TIMELINE COMPONENT

### Placement

Timeline lives in the **Invoice Detail page** below the line items table, collapsed by default for compact view.

```
┌──────────────────────────────────────────────────────┐
│ Invoice Detail                                       │
│ ── Header ────────────────────────────────────────── │
│ ── Line Items Table ──────────────────────────────── │
│                                                      │
│ ── History ──────────────────────────── [▼ EXPAND] ─ │
│  MAY 23, 2026                                        │
│  ● INVOICED                                          │
│    Admin User · 09:42 AM                             │
│                                                      │
│  MAY 22, 2026                                        │
│  ● APPROVED                                          │
│    Manager Alice · 03:15 PM                          │
│    Note: "Checked against purchase order."           │
│                                                      │
│  ● SUBMITTED                                         │
│    John Smith · 11:00 AM                             │
│                                                      │
│  MAY 20, 2026                                        │
│  ● 18 ITEMS IMPORTED                                 │
│    John Smith · 10:30 AM · 3 errors skipped          │
│                                                      │
│  ● CREATED                                           │
│    John Smith · 09:00 AM                             │
└──────────────────────────────────────────────────────┘
```

### Component

```tsx
// components/invoice/AuditTimeline.tsx
'use client'

import { useState } from 'react'
import type { AuditLogEntry } from '@/types'

interface Props {
  invoiceId: string
}

const ACTION_CONFIG: Record<string, {
  label: string
  color: string
  icon: string
}> = {
  created:         { label: 'Created',          color: 'var(--text-secondary)', icon: 'fa-file-plus' },
  updated:         { label: 'Updated',          color: 'var(--text-secondary)', icon: 'fa-pen' },
  submitted:       { label: 'Submitted',        color: 'var(--color-info)',     icon: 'fa-paper-plane' },
  approved:        { label: 'Approved',         color: 'var(--color-success)',  icon: 'fa-circle-check' },
  rejected:        { label: 'Rejected',         color: 'var(--color-danger)',   icon: 'fa-circle-xmark' },
  invoiced:        { label: 'Invoiced',         color: 'var(--text-primary)',   icon: 'fa-lock' },
  items_imported:  { label: 'Items Imported',   color: 'var(--color-info)',     icon: 'fa-file-import' },
  item_added:      { label: 'Item Added',       color: 'var(--text-secondary)', icon: 'fa-plus' },
  item_updated:    { label: 'Item Updated',     color: 'var(--text-secondary)', icon: 'fa-pen' },
  item_deleted:    { label: 'Item Deleted',     color: 'var(--color-danger)',   icon: 'fa-trash' },
  discount_applied:{ label: 'Discount Applied', color: 'var(--color-warning)',  icon: 'fa-percent' },
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(iso))
}

function getMetaNote(action: string, metadata: Record<string, unknown>): string {
  if (action === 'items_imported') {
    const { count, errors } = metadata as { count: number; errors: number }
    return errors > 0 ? `${count} rows · ${errors} errors skipped` : `${count} rows`
  }
  if (action === 'item_added' || action === 'item_deleted' || action === 'item_updated') {
    const { sku } = metadata as { sku?: string }
    return sku ? `SKU: ${sku}` : ''
  }
  return ''
}

export function AuditTimeline({ invoiceId }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [logs, setLogs]         = useState<AuditLogEntry[]>([])
  const [loading, setLoading]   = useState(false)
  const [loaded, setLoaded]     = useState(false)

  async function load() {
    if (loaded) return
    setLoading(true)
    try {
      const res  = await fetch(`/api/invoices/${invoiceId}/audit-log`)
      const json = await res.json()
      if (json.success) setLogs(json.data)
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }

  function toggle() {
    if (!expanded) load()
    setExpanded(v => !v)
  }

  return (
    <section
      style={{
        borderTop: '1px solid var(--border-base)',
        marginTop: '2rem',
        paddingTop: '1.5rem',
      }}
    >
      {/* Section header */}
      <button
        onClick={toggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          marginBottom: expanded ? '1.5rem' : 0,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
          }}
        >
          History
        </span>
        <i
          className={`fa-solid fa-chevron-${expanded ? 'up' : 'down'}`}
          style={{ fontSize: 10, color: 'var(--text-muted)' }}
        />
      </button>

      {/* Timeline */}
      {expanded && (
        <div>
          {loading && (
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 6 }} />
              Loading history...
            </p>
          )}

          {!loading && logs.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              No history yet.
            </p>
          )}

          <ol
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              position: 'relative',
            }}
          >
            {/* Vertical line */}
            <div
              style={{
                position: 'absolute',
                left: 7,
                top: 8,
                bottom: 8,
                width: 1,
                background: 'var(--border-base)',
              }}
            />

            {logs.map(log => {
              const cfg      = ACTION_CONFIG[log.action] ?? ACTION_CONFIG.updated
              const metaNote = getMetaNote(log.action, log.metadata)

              return (
                <li
                  key={log.id}
                  style={{
                    display: 'flex',
                    gap: '1rem',
                    paddingBottom: '1.25rem',
                    position: 'relative',
                  }}
                >
                  {/* Dot */}
                  <div
                    style={{
                      width: 15,
                      height: 15,
                      borderRadius: '50%',
                      background: cfg.color,
                      border: '2px solid var(--bg-surface)',
                      flexShrink: 0,
                      marginTop: 2,
                      position: 'relative',
                      zIndex: 1,
                    }}
                  />

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Action label */}
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: cfg.color,
                        marginBottom: 2,
                      }}
                    >
                      {cfg.label}
                      {log.from_status && log.to_status && (
                        <span
                          style={{
                            fontWeight: 400,
                            color: 'var(--text-muted)',
                            marginLeft: 6,
                            textTransform: 'none',
                            letterSpacing: 0,
                          }}
                        >
                          {log.from_status} → {log.to_status}
                        </span>
                      )}
                    </div>

                    {/* Actor + timestamp */}
                    <div
                      style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--text-secondary)',
                        marginBottom: log.note || metaNote ? 4 : 0,
                      }}
                    >
                      <strong style={{ color: 'var(--text-primary)' }}>
                        {log.app_users.full_name}
                      </strong>
                      {' · '}
                      {formatDate(log.created_at)}
                    </div>

                    {/* Metadata note */}
                    {metaNote && (
                      <div
                        style={{
                          fontSize: 'var(--text-xs)',
                          color: 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)',
                          marginBottom: log.note ? 4 : 0,
                        }}
                      >
                        {metaNote}
                      </div>
                    )}

                    {/* User-supplied note */}
                    {log.note && (
                      <div
                        style={{
                          fontSize: 'var(--text-sm)',
                          color: 'var(--text-primary)',
                          fontStyle: 'italic',
                          borderLeft: '2px solid var(--border-base)',
                          paddingLeft: 8,
                          marginTop: 4,
                        }}
                      >
                        "{log.note}"
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </section>
  )
}
```

---

## 6. STATUS BADGE COMPONENT (shared)

Used in timeline AND invoice list/detail header.

```tsx
// components/ui/StatusBadge.tsx
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: {
    label: 'Draft',
    color: 'var(--text-secondary)',
    bg:    'var(--bg-muted)',
  },
  pending_approval: {
    label: 'Pending Approval',
    color: 'var(--color-warning)',
    bg:    '#FAF6EE',
  },
  approved: {
    label: 'Approved',
    color: 'var(--color-success)',
    bg:    '#F2F7F4',
  },
  invoiced: {
    label: 'Invoiced',
    color: 'var(--text-primary)',
    bg:    'var(--bg-base)',
  },
}

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft
  return (
    <span
      style={{
        display:       'inline-block',
        padding:       '2px 8px',
        background:    cfg.bg,
        color:         cfg.color,
        border:        `1px solid ${cfg.color}`,
        borderRadius:  0,
        fontFamily:    'var(--font-body)',
        fontSize:      'var(--text-xs)',
        fontWeight:    600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}
    >
      {cfg.label}
    </span>
  )
}
```

---

## 7. ROLE VISIBILITY

| Role    | Can see audit log |
|---------|-------------------|
| admin   | ✓ All invoices    |
| manager | ✓ All invoices    |
| user    | ✓ Own invoices    |
| viewer  | ✓ All invoices (read-only) |

No audit log entries are hidden — if the user can access the invoice, they see its full history.

---

## 8. DATA RETENTION

```sql
-- Optional: auto-purge logs older than 2 years
-- Run as a scheduled Supabase Edge Function or Vercel Cron
DELETE FROM audit_logs
WHERE created_at < NOW() - INTERVAL '2 years';
```

---

## 9. COMPONENT STRUCTURE

```
app/
  (dashboard)/
    invoices/[id]/page.tsx          ← renders AuditTimeline at bottom
api/
  invoices/[id]/audit-log/route.ts  ← GET
components/
  invoice/
    AuditTimeline.tsx               ← collapsible timeline
  ui/
    StatusBadge.tsx                 ← shared status chip
lib/
  audit/
    log.ts                          ← writeAuditLog() helper
types/
  audit.ts                          ← AuditLogEntry, AuditAction types
```

---

## 10. CONSTRAINTS

```
✓ audit_logs.invoice_id FK → invoice_headers ON DELETE CASCADE (purge with invoice)
✓ audit_logs.user_id FK → app_users (soft FK — user cannot be hard-deleted, only deactivated)
✓ No UPDATE or DELETE on audit_logs — append-only
✓ writeAuditLog() never throws to caller — errors are caught and logged to console only
✓ Timezone for display: Asia/Ho_Chi_Minh (all stored as UTC in DB)
✓ Timeline loads on demand (collapsed by default) — no extra query on page load
✓ metadata JSONB is optional — empty object {} is fine for simple actions
```
