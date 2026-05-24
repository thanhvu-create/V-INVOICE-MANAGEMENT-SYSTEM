# Invoice Module — Implementation Guide
> **Routes:** `/invoices` (list) · `/invoices/new` · `/invoices/[id]` · `/invoices/[id]/print`
> **API:** `/api/invoices` · `/api/invoices/[id]` · `/api/invoices/[id]/status`
>          `/api/invoices/[id]/items` · `/api/invoices/[id]/items/[itemId]`
>          `/api/invoices/[id]/items/[itemId]/gems`

---

## 1. INVOICE LIST PAGE (`/invoices`)

### Data Fetch

```typescript
// app/(dashboard)/invoices/page.tsx — Server Component
const db = createServiceClient()
const { data: invoices } = await db
  .from('invoice_headers')
  .select(`
    id, po_number, mr_number, status, is_locked, store, created_by, created_at,
    daily_metal_rates(rate_date),
    pricing_rules(name)
  `)
  .order('created_at', { ascending: false })
```

### Table Columns

| Col | Field | Format | Notes |
|-----|-------|--------|-------|
| PO Number | `po_number` | dark badge + font-mono | |
| MR Number | `mr_number` | text or `—` | |
| Status | `status` | `<StatusChip>` | see status styles below |
| Store | `store` | outline badge | |
| Rate Date | `daily_metal_rates.rate_date` | YYYY-MM-DD | |
| Pricing Rule | `pricing_rules.name` | text | |
| Created By | `created_by` | text | |
| Created At | `created_at` | YYYY-MM-DD | |
| Actions | — | `[VIEW]` `[EDIT]` `[DELETE]` | role-based |

### Status Chip Styles

```typescript
const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  draft:            { bg: '#F3F4F6', text: '#374151', label: 'DRAFT' },
  pending_approval: { bg: '#FEF3C7', text: '#92400E', label: 'PENDING' },
  approved:         { bg: '#D1FAE5', text: '#065F46', label: 'APPROVED' },
  invoiced:         { bg: '#1A1814', text: '#FAFAF7', label: 'INVOICED' },
}
```

### Action Visibility

```typescript
// role-based:
const canEdit   = (role === 'user'    && status === 'draft') ||
                  (role === 'manager' && status === 'pending_approval') ||
                  (role === 'admin')
const canDelete = role === 'admin'
// canView: all roles
```

### DELETE Invoice

```typescript
// DELETE /api/invoices/[id]
// Guard: check is_locked → 403
// Check status: can only delete draft (or admin override)
await db.from('invoice_headers').delete().eq('id', id)
// Cascade deletes invoice_items + item_gem_details via FK ON DELETE CASCADE
```

---

## 2. CREATE INVOICE PAGE (`/invoices/new`)

### Form Fields

```typescript
interface NewInvoiceForm {
  po_number:       string  // required, unique
  mr_number?:      string
  metal_rate_id:   string  // select from daily_metal_rates (default: today or latest)
  pricing_rule_id: string  // select from pricing_rules (default: active rule)
  store?:          string
  notes?:          string
}
```

### Fetch Defaults

```typescript
// GET /api/invoices/new-defaults
// Returns: { defaultRateId, defaultRuleId, rates[], rules[] }

const today = new Date().toISOString().slice(0, 10)
const { data: todayRate }  = await db.from('daily_metal_rates').select('*').eq('rate_date', today).maybeSingle()
const { data: latestRate } = await db.from('daily_metal_rates').select('*').order('rate_date', { ascending: false }).limit(1).single()
const defaultRate = todayRate ?? latestRate

const { data: activeRule } = await db.from('pricing_rules').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(1).single()
```

### POST `/api/invoices`

```typescript
export async function POST(req: NextRequest) {
  try {
    const { po_number, mr_number, metal_rate_id, pricing_rule_id, store, notes, created_by } = await req.json()
    const db = createServiceClient()

    // Unique PO check:
    const { count } = await db.from('invoice_headers').select('*', { count: 'exact', head: true }).eq('po_number', po_number)
    if (count && count > 0) return NextResponse.json({ success: false, message: 'PO number already exists' }, { status: 409 })

    const { data, error } = await db.from('invoice_headers').insert({
      po_number, mr_number, metal_rate_id, pricing_rule_id, store, notes,
      created_by, status: 'draft', is_locked: false
    }).select().single()

    if (error) throw error
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
```

---

## 3. INVOICE DETAIL PAGE (`/invoices/[id]`)

### Data Loading

```typescript
// Fetch all in parallel:
const [header, items, allGems] = await Promise.all([
  db.from('invoice_headers').select('*, daily_metal_rates(*), pricing_rules(*)').eq('id', id).single(),
  db.from('invoice_items').select('*').eq('invoice_id', id).order('line_no'),
  db.from('item_gem_details').select('*').order('id'),
])
// Filter gems per item client-side or via join
```

### Locked Invoice Banner

```tsx
{header.is_locked && (
  <div style={{
    background: '#1A1814', color: '#FAFAF7',
    padding: '8px 16px', textAlign: 'center',
    fontSize: 'var(--text-xs)', letterSpacing: '0.15em', textTransform: 'uppercase',
    marginBottom: '1rem'
  }}>
    🔒 INVOICED — THIS INVOICE IS LOCKED AND CANNOT BE MODIFIED
  </div>
)}
```

### View Toggle

```tsx
type InvoiceView = 'jm-form' | 'detail'
const [activeView, setActiveView] = useState<InvoiceView>('jm-form')

// Toggle buttons:
<div style={{ display: 'flex', borderBottom: '1px solid var(--border-base)' }}>
  {(['jm-form', 'detail'] as const).map(view => (
    <button key={view}
      onClick={() => setActiveView(view)}
      style={{
        padding: '10px 24px', border: 'none', background: 'transparent',
        borderBottom: activeView === view ? '2px solid var(--border-strong)' : '2px solid transparent',
        fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
        fontWeight: activeView === view ? 600 : 400,
        textTransform: 'uppercase', letterSpacing: '0.1em',
        color: activeView === view ? 'var(--text-primary)' : 'var(--text-secondary)',
        cursor: 'pointer',
      }}>
      {view === 'jm-form' ? 'JM FORM VIEW' : 'DETAIL VIEW'}
    </button>
  ))}
</div>
```

---

## 4. WORKFLOW BAR

### Status Transitions Map

```typescript
const ALLOWED_TRANSITIONS: Record<string, Record<string, string[]>> = {
  user:    { draft: ['pending_approval'] },
  manager: { pending_approval: ['approved', 'draft'] },
  admin:   {
    draft:            ['pending_approval'],
    pending_approval: ['approved', 'draft'],
    approved:         ['invoiced', 'pending_approval'],
  },
}

const availableTransitions = ALLOWED_TRANSITIONS[userRole]?.[header.status] ?? []
```

### Workflow Bar TSX

```tsx
const STEPS = ['draft', 'pending_approval', 'approved', 'invoiced'] as const
const STEP_LABELS: Record<string, string> = {
  draft: 'Draft', pending_approval: 'Pending', approved: 'Approved', invoiced: 'Invoiced'
}

function WorkflowBar({ currentStatus, availableTransitions, onTransition }: Props) {
  const currentIndex = STEPS.indexOf(currentStatus as typeof STEPS[number])
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 0' }}>
      {STEPS.map((step, i) => {
        const isCompleted = i < currentIndex
        const isCurrent   = i === currentIndex
        const canGo       = availableTransitions.includes(step)
        return (
          <React.Fragment key={step}>
            {i > 0 && (
              <div style={{
                height: '1px', flex: 1,
                background: isCompleted ? 'var(--color-success)' : 'var(--border-base)'
              }} />
            )}
            <button
              onClick={() => canGo && onTransition(step)}
              disabled={!canGo}
              style={{
                padding: '6px 14px',
                border: isCurrent ? '1px solid var(--border-strong)' : '1px solid var(--border-base)',
                borderRadius: 0, background: isCurrent ? 'var(--text-primary)' : 'transparent',
                color: isCurrent ? 'var(--text-inverse)' : isCompleted ? 'var(--color-success)' : 'var(--text-muted)',
                fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.1em',
                cursor: canGo ? 'pointer' : 'default',
              }}>
              {isCompleted ? '✓ ' : isCurrent ? '' : ''}{STEP_LABELS[step]}
            </button>
          </React.Fragment>
        )
      })}
    </div>
  )
}
```

### Status Transition API

```typescript
// POST /api/invoices/[id]/status
// Body: { to_status: string, reason?: string, user_id: string, role: string }

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { to_status, reason, user_id, role } = await req.json()
    const db = createServiceClient()

    const { data: invoice } = await db.from('invoice_headers')
      .select('status, is_locked').eq('id', params.id).single()

    if (invoice.is_locked) return NextResponse.json({ success: false, message: 'Invoice is locked' }, { status: 403 })

    if (!canTransition(role, invoice.status, to_status)) {
      return NextResponse.json({ success: false, message: 'Transition not allowed' }, { status: 403 })
    }

    // Update status:
    await db.from('invoice_headers').update({ status: to_status, updated_at: new Date().toISOString() }).eq('id', params.id)

    // Audit log:
    await db.from('audit_logs').insert({
      invoice_id: params.id, from_status: invoice.status, to_status,
      changed_by: user_id, note: reason || null
    })

    // Trigger fires automatically for → 'invoiced' (creates snapshot + sets is_locked)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
```

---

## 5. JM FORM VIEW

### 15-Column Table Spec

| # | Header | Field | Format | Special |
|---|--------|-------|--------|---------|
| 1 | No. | `line_no` | integer | |
| 2 | SKU JWMold | `sku_jwmold` | font-mono | **Always yellow `#FEF3C7`** |
| 3 | Qty Pcs | `qty_pcs` | integer | |
| 4 | Description | `description` | text | |
| 5 | Class | `class` | text | |
| 6 | Sub Class | `sub_class` | text | |
| 7 | Notes | `notes` | text | **Red `#DC2626` if Ba Sao** |
| 8 | Wt Total (gr) | `weight_total_gr` | `.4f` | |
| 9 | Wt Gold (gr) | `weight_gold_actual_gr` | `.4f` | |
| 10 | Wt No Gem (gr) | `weight_no_gem_gr` | `.4f` | auto-calc |
| 11 | Metal Type | `metal_type` | text | |
| 12 | Gold Value USD | `gold_value_usd` | `$x.xx` | |
| 13 | HPUSA | `hpusa` | `$x.xx` | |
| 14 | CIF Price | `cif_price` | `$x.xx` | |
| 15 | Tag Price | `tag_price` | `$x.xx` | |

```tsx
// Ba Sao detection:
const isBaSao = (notes: string | null) =>
  !!(notes?.toLowerCase().includes('ba sao') || notes?.toLowerCase().includes('3 sao'))

// Row render:
<tr key={item.id}>
  <td>{item.line_no}</td>
  <td style={{ background: '#FEF3C7', fontFamily: 'var(--font-mono)' }}>{item.sku_jwmold}</td>
  {/* ... */}
  <td style={isBaSao(item.notes) ? { color: '#DC2626', fontWeight: 600 } : {}}>
    {item.notes || '—'}
  </td>
  {/* ... */}
</tr>
```

### JM Form Export Button

```tsx
<button onClick={() => exportToExcel(items)} style={{
  background: 'transparent', border: '1px solid var(--border-strong)',
  padding: '6px 16px', borderRadius: 0, fontSize: 'var(--text-xs)',
  textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer'
}}>
  <i className="fa-solid fa-file-excel" /> EXPORT EXCEL
</button>
```

---

## 6. DETAIL VIEW

### Item Card Component

```tsx
function InvoiceItemCard({ item, gems, isLocked, rate, rule, onUpdate }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const itemGems = gems.filter(g => g.invoice_item_id === item.id)

  return (
    <div style={{ border: '1px solid var(--border-base)', marginBottom: '1rem', background: 'var(--bg-surface)' }}>
      {/* Card header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 16px', background: 'var(--bg-base)', borderBottom: '1px solid var(--border-light)'
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, background: 'var(--text-primary)',
          color: 'var(--text-inverse)', padding: '2px 8px', fontSize: 'var(--text-xs)' }}>
          #{item.line_no} {item.sku_jwmold}
        </span>
        {!isLocked && (
          <button onClick={() => setEditing('item')}>
            <i className="fa-solid fa-pen-to-square" />
          </button>
        )}
      </div>

      {/* Item fields grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', padding: '16px' }}>
        <InlineField label="Weight Total (gr)" value={item.weight_total_gr?.toFixed(4)} />
        <InlineField label="Weight Gold (gr)"  value={item.weight_gold_actual_gr?.toFixed(4)} />
        <InlineField label="Metal Type"        value={item.metal_type} />
        <InlineField label="Gold Value USD"    value={formatUSD(item.gold_value_usd ?? 0)} />
        <InlineField label="HPUSA"             value={formatUSD(item.hpusa ?? 0)} highlighted />
        <InlineField label="CIF Price"         value={formatUSD(item.cif_price ?? 0)} />
        <InlineField label="Tag Price"         value={formatUSD(item.tag_price ?? 0)} />
        <InlineField label="FR Price"          value={formatUSD(item.fr_price ?? 0)} />
      </div>

      {/* Gem sub-table */}
      {itemGems.length > 0 && <GemSubTable gems={itemGems} isLocked={isLocked} itemId={item.id} />}

      {/* Add gem button */}
      {!isLocked && (
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border-light)' }}>
          <button onClick={() => setEditing('add-gem')} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            <i className="fa-solid fa-plus" /> Add Gem
          </button>
        </div>
      )}
    </div>
  )
}
```

### Gem Sub-Table

```tsx
function GemSubTable({ gems, isLocked, itemId }: Props) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
        <thead>
          <tr style={{ background: 'var(--bg-muted)' }}>
            {['Gem Type','Qty','Wt Before (ct)','Wt After (ct)','Unit Price/ct','Setting Fee/pcs',
              'Wt (gr)✦','Total Price✦','Total Setting✦',''].map(h => (
              <th key={h} style={{ padding: '6px 8px', textAlign: 'left', whiteSpace: 'nowrap',
                fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {gems.map(gem => (
            <tr key={gem.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
              <td style={{ padding: '4px 8px' }}>{gem.gem_type || '—'}</td>
              <td style={{ padding: '4px 8px' }}>{gem.qty_pcs}</td>
              <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)' }}>{gem.weight_ct_before?.toFixed(4)}</td>
              <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)' }}>{gem.weight_ct_after?.toFixed(4)}</td>
              <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)' }}>{formatUSD(gem.unit_price_per_ct ?? 0)}</td>
              <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)' }}>{formatUSD(gem.setting_fee_per_pcs ?? 0)}</td>
              {/* GENERATED ALWAYS AS — read from DB: */}
              <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', background: 'var(--bg-base)' }}>
                {gem.weight_gr?.toFixed(4)}
              </td>
              <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', background: 'var(--bg-base)' }}>
                {formatUSD(gem.total_price ?? 0)}
              </td>
              <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', background: 'var(--bg-base)' }}>
                {formatUSD(gem.total_setting_fee ?? 0)}
              </td>
              {!isLocked && (
                <td style={{ padding: '4px 8px' }}>
                  <button onClick={() => deleteGem(gem.id)} style={{ color: 'var(--color-danger)', border: 'none', background: 'none', cursor: 'pointer' }}>
                    <i className="fa-solid fa-trash-can" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', padding: '4px 8px' }}>
        ✦ Computed by PostgreSQL (GENERATED ALWAYS AS)
      </p>
    </div>
  )
}
```

---

## 7. INLINE EDIT — ITEM API

### PUT `/api/invoices/[id]/items/[itemId]`

```typescript
export async function PUT(req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  try {
    const body = await req.json()
    const db = createServiceClient()

    // Guard locked:
    const { data: inv } = await db.from('invoice_headers').select('is_locked, metal_rate_id, pricing_rule_id').eq('id', params.id).single()
    if (inv.is_locked) return NextResponse.json({ success: false, message: 'Invoice is locked' }, { status: 403 })

    // Update editable fields:
    await db.from('invoice_items').update({
      ...body,
      updated_at: new Date().toISOString()
    }).eq('id', params.itemId)

    // Recalculate chain:
    const { data: item } = await db.from('invoice_items').select('*').eq('id', params.itemId).single()
    const { data: gems } = await db.from('item_gem_details').select('*').eq('invoice_item_id', params.itemId)
    const { data: rate } = await db.from('daily_metal_rates').select('*').eq('id', inv.metal_rate_id).single()
    const { data: rule } = await db.from('pricing_rules').select('*').eq('id', inv.pricing_rule_id).single()

    const computed = recalcItem(item, gems, rate, rule)
    await db.from('invoice_items').update(computed).eq('id', params.itemId)

    return NextResponse.json({ success: true, data: { ...item, ...computed } })
  } catch (err) {
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
```

### Recalculate Function

```typescript
// lib/formulas/recalcItem.ts
import { calcGoldValue, calcHPUSA, calcPrices, calcWeightNoGem } from './index'

function recalcItem(item: InvoiceItem, gems: GemDetail[], rate: DailyMetalRate, rule: PricingRule) {
  const weightNoGem  = calcWeightNoGem(item.weight_total_gr ?? 0, gems)
  const goldValue    = calcGoldValue(item.weight_gold_actual_gr ?? 0, item.metal_type ?? '', rate, rule.casting_loss_pct)
  const hpusa        = calcHPUSA(item, gems, goldValue)
  const { cif_price, tag_price, fr_price } = calcPrices(hpusa, rule)

  return { weight_no_gem_gr: weightNoGem, gold_value_usd: goldValue, hpusa, cif_price, tag_price, fr_price }
}
```

---

## 8. GEM CRUD API

### POST `/api/invoices/[id]/items/[itemId]/gems`

```typescript
export async function POST(req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  try {
    const body = await req.json()
    const db = createServiceClient()

    const { data: inv } = await db.from('invoice_headers').select('is_locked').eq('id', params.id).single()
    if (inv.is_locked) return NextResponse.json({ success: false, message: 'Locked' }, { status: 403 })

    const { data: gem } = await db.from('item_gem_details').insert({
      invoice_item_id: params.itemId,
      gem_type: body.gem_type,
      qty_pcs: body.qty_pcs,
      weight_ct_before: body.weight_ct_before,
      weight_ct_after: body.weight_ct_after,
      unit_price_per_ct: body.unit_price_per_ct,
      setting_fee_per_pcs: body.setting_fee_per_pcs,
    }).select().single()
    // PostgreSQL auto-computes: weight_gr, total_price, total_setting_fee

    // Trigger recalc on parent item:
    await triggerItemRecalc(params.id, params.itemId, db)

    return NextResponse.json({ success: true, data: gem })
  } catch (err) {
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
```

---

## 9. REALTIME SYNC

```typescript
// hooks/useInvoiceRealtime.ts
import { createClient } from '@/lib/supabase/client'
import { useEffect } from 'react'

export function useInvoiceRealtime(invoiceId: string, onUpdate: () => void) {
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`invoice:${invoiceId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'invoice_items',
        filter: `invoice_id=eq.${invoiceId}`,
      }, onUpdate)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'item_gem_details',
      }, onUpdate)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [invoiceId, onUpdate])
}

// Usage in Detail View:
useInvoiceRealtime(invoiceId, () => {
  // Refetch items + gems
  fetchData()
})
```

---

## 10. PRINT PAGE (`/invoices/[id]/print`)

```typescript
// app/(dashboard)/invoices/[id]/print/page.tsx
// Separate route — no topbar/nav

export default async function PrintPage({ params }: { params: { id: string } }) {
  const db = createServiceClient()
  const [header, items] = await Promise.all([
    db.from('invoice_headers').select('*, daily_metal_rates(*), pricing_rules(*)').eq('id', params.id).single(),
    db.from('invoice_items').select('*').eq('invoice_id', params.id).order('line_no'),
  ])

  return (
    <html>
      <head>
        <style>{`
          @page { size: A4 landscape; margin: 15mm 10mm; }
          @media print { .no-print { display: none !important; } }
          /* SKU yellow preserved in print: */
          .sku-cell { background-color: #FEF3C7 !important; -webkit-print-color-adjust: exact; }
          .ba-sao-text { color: #DC2626 !important; -webkit-print-color-adjust: exact; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
          body { font-size: 9pt; font-family: 'Jost', Arial, sans-serif; }
          table { width: 100%; font-size: 8pt; }
          td, th { padding: 3pt 4pt; }
        `}</style>
      </head>
      <body>
        <div className="no-print" style={{ padding: '16px' }}>
          <button onClick={() => window.print()}>Print / Save PDF</button>
        </div>
        <h2 style={{ fontFamily: 'serif' }}>
          {header.data?.po_number} — JM Form Invoice
        </h2>
        <JMFormTable items={items.data ?? []} printMode />
      </body>
    </html>
  )
}
```

---

## 11. ADD ITEM MODAL (Detail View)

```typescript
// POST /api/invoices/[id]/items
// Body: { sku_jwmold: string, qty_pcs: number, ... }

// Client: on SKU input change → autocomplete from bom_products
async function lookupSKU(sku: string) {
  const { data } = await supabase.from('bom_products').select('*').eq('sku_jwmold', sku).maybeSingle()
  if (data) {
    // Auto-fill from bom_products defaults:
    setForm(prev => ({
      ...prev,
      description: data.description,
      class:       data.class,
      sub_class:   data.sub_class,
      metal_type:  data.metal_type,
      labor_fee:   data.labor_fee,
      casting_fee: data.casting_fee,
      design_fee:  data.design_fee,
      resin_fee:   data.resin_fee,
      misc_fee:    data.misc_fee,
    }))
  }
}
```

---

## 12. API ENDPOINTS SUMMARY

| Method | URL | Action |
|--------|-----|--------|
| GET    | `/api/invoices` | List all invoices |
| POST   | `/api/invoices` | Create new invoice |
| GET    | `/api/invoices/[id]` | Get invoice detail |
| PUT    | `/api/invoices/[id]` | Update invoice header fields |
| DELETE | `/api/invoices/[id]` | Delete invoice (draft only / admin) |
| POST   | `/api/invoices/[id]/status` | Transition status |
| GET    | `/api/invoices/[id]/items` | Get all items |
| POST   | `/api/invoices/[id]/items` | Add item |
| PUT    | `/api/invoices/[id]/items/[itemId]` | Update item + recalculate |
| DELETE | `/api/invoices/[id]/items/[itemId]` | Delete item |
| GET    | `/api/invoices/[id]/items/[itemId]/gems` | Get gems for item |
| POST   | `/api/invoices/[id]/items/[itemId]/gems` | Add gem |
| PUT    | `/api/invoices/[id]/items/[itemId]/gems/[gemId]` | Update gem + recalculate |
| DELETE | `/api/invoices/[id]/items/[itemId]/gems/[gemId]` | Delete gem + recalculate |

---

## 13. COMPONENT STRUCTURE

```
app/(dashboard)/invoices/
  page.tsx                    ← Invoice list (Server Component)
  new/page.tsx                ← Create invoice form
  [id]/
    page.tsx                  ← Invoice detail (shell)
    print/page.tsx            ← Print-only page

components/invoice/
  InvoiceTable.tsx            ← List table with status chips
  StatusChip.tsx              ← Status badge
  WorkflowBar.tsx             ← Step indicator + transition buttons
  ViewToggle.tsx              ← JM Form / Detail switch
  JMFormView.tsx              ← 15-column table
  DetailView.tsx              ← Card list with expandable gems
  InvoiceItemCard.tsx         ← Single item card
  GemSubTable.tsx             ← Gem rows (GENERATED col display)
  InlineField.tsx             ← Read/edit field pair
  AddItemModal.tsx            ← SKU autocomplete + form
  AddGemModal.tsx             ← Gem form
  StatusConfirmModal.tsx      ← Reason textarea for transitions
  LockedBanner.tsx            ← Frozen invoice notice

hooks/
  useInvoiceRealtime.ts       ← Supabase channel subscription
```
