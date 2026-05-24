# Metal Rates Module — V-Invoice
> **Route:** `/admin/metal-rates` · **Role required:** `admin` only
> **Purpose:** Manage daily gold/platinum/silver/palladium USD/gram rates used in invoice pricing

---

## 1. DATABASE

```sql
CREATE TABLE daily_metal_rates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_date   DATE UNIQUE NOT NULL,
  gold_24k    NUMERIC,   -- USD/gram
  gold_18kw   NUMERIC,
  gold_18ky   NUMERIC,
  gold_14ky   NUMERIC,
  platinum    NUMERIC,
  silver      NUMERIC,
  palladium   NUMERIC,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON daily_metal_rates(rate_date DESC);
```

**Delete guard:** Cannot delete a rate that is referenced by any `invoice_headers.metal_rate_id`.

---

## 2. TYPESCRIPT TYPES

```typescript
export interface DailyMetalRate {
  id: string
  rate_date: string      // 'YYYY-MM-DD'
  gold_24k?: number
  gold_18kw?: number
  gold_18ky?: number
  gold_14ky?: number
  platinum?: number
  silver?: number
  palladium?: number
  created_at: string
}

export type MetalType = '18KW' | '18KY' | '14KY' | 'PT950' | 'PT' | '24K' | 'AG' | 'PD'

// Rate lookup used in pricing formula:
export function getRateForMetal(row: DailyMetalRate, metalType: string): number {
  const rateMap: Record<string, number | undefined> = {
    '18KW':  row.gold_18kw,
    '18KY':  row.gold_18ky,
    '14KY':  row.gold_14ky,
    'PT950': row.platinum,
    'PT':    row.platinum,
    '24K':   row.gold_24k,
    'AG':    row.silver,
    'PD':    row.palladium,
  }
  return rateMap[metalType] ?? row.gold_24k ?? 0
}
```

---

## 3. PAGE LAYOUT

```
┌──────────────────────────────────────────────────────────────┐
│  Metal Rates                                [+ Add Rate]     │
│  Daily USD/gram prices for gold, platinum, silver            │
├──────────────────────────────────────────────────────────────┤
│  TABLE:                                                      │
│  Date | 24K | 18KW | 18KY | 14KY | PT | Silver | PD | [✏][🗑]│
├──────────────────────────────────────────────────────────────┤
│  [< Prev]  Page 1 of N  [Next >]                             │
└──────────────────────────────────────────────────────────────┘
```

**Table specs:**
- Default sort: `rate_date DESC` (newest first)
- Rows per page: 20
- Date column: font-mono `YYYY-MM-DD`
- Rate columns: `$X.XXXX` (4 decimal places), right-aligned, font-mono
- Empty rate: display `—` (en-dash), `color: var(--text-muted)`
- Row hover: `background: var(--bg-hover)`

---

## 4. ADD / EDIT MODAL

**Element ID:** `#metalRateModal`  
**Width:** `max-width: 520px`

```tsx
interface MetalRateFormData {
  rate_date: string    // date input YYYY-MM-DD
  gold_24k: string
  gold_18kw: string
  gold_18ky: string
  gold_14ky: string
  platinum: string
  silver: string
  palladium: string
}

// Initial values for Add:
const defaultForm: MetalRateFormData = {
  rate_date: new Date().toISOString().slice(0, 10),
  gold_24k: '', gold_18kw: '', gold_18ky: '', gold_14ky: '',
  platinum: '', silver: '', palladium: '',
}
```

**Modal layout:**

```
┌─────────────────────────────────────────┐
│  Add Metal Rate / Edit Metal Rate       │
├─────────────────────────────────────────┤
│  Rate Date *:  [2026-05-22          ]   │
│                                         │
│  Gold prices (USD/gram)                 │
│  ┌────────┐ ┌────────┐ ┌────────┐      │
│  │ 24K    │ │ 18KW   │ │ 18KY   │      │
│  │[______]│ │[______]│ │[______]│      │
│  └────────┘ └────────┘ └────────┘      │
│  ┌────────┐                            │
│  │ 14KY   │                            │
│  │[______]│                            │
│  └────────┘                            │
│                                         │
│  Other metals (USD/gram)                │
│  ┌────────┐ ┌────────┐ ┌────────┐      │
│  │Platinum│ │Silver  │ │Pallad. │      │
│  │[______]│ │[______]│ │[______]│      │
│  └────────┘ └────────┘ └────────┘      │
├─────────────────────────────────────────┤
│            [Cancel]  [Save Rate]        │
└─────────────────────────────────────────┘
```

**Input style:** Number inputs, `step="0.0001"`, `min="0"`, `border-radius: 0`  
**Required:** Only `rate_date` is required (rates can be partial)  
**Unique date validation:** On submit, check server returns 409 if date already exists (add mode)

---

## 5. DELETE GUARD LOGIC

Before deleting a rate, check if any invoices reference it:

```typescript
// Client: show delete confirmation with invoice count warning
// Server-side check in DELETE /api/metal-rates/[id]:

const { count } = await db
  .from('invoice_headers')
  .select('*', { count: 'exact', head: true })
  .eq('metal_rate_id', id)

if ((count ?? 0) > 0) {
  return NextResponse.json(
    { success: false, message: `Cannot delete: ${count} invoice(s) use this rate.` },
    { status: 409 }
  )
}

await db.from('daily_metal_rates').delete().eq('id', id)
```

**Client-side confirm dialog:**
```tsx
// When user clicks delete icon:
const handleDelete = async (rate: DailyMetalRate) => {
  // Show confirm first (custom dialog, NOT window.confirm())
  openConfirm({
    title: 'Delete Metal Rate',
    message: `Delete rate for ${rate.rate_date}? This cannot be undone.`,
    danger: true,
    okText: 'Delete',
    onOk: async () => {
      const res = await fetch(`/api/metal-rates/${rate.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.success) {
        // Show error toast: data.message
        toast.error(data.message)
      } else {
        // Remove from local state, show success toast
        setRates(prev => prev.filter(r => r.id !== rate.id))
        toast.success('Rate deleted.')
      }
    }
  })
}
```

---

## 6. API ROUTES

### `GET /api/metal-rates`

```typescript
// app/api/metal-rates/route.ts
export async function GET() {
  const db = createServiceClient()
  const { data, error } = await db
    .from('daily_metal_rates')
    .select('*')
    .order('rate_date', { ascending: false })

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}
```

### `POST /api/metal-rates`

```typescript
export async function POST(req: NextRequest) {
  const body = await req.json()
  const db = createServiceClient()

  // Check unique date
  const { data: existing } = await db
    .from('daily_metal_rates')
    .select('id')
    .eq('rate_date', body.rate_date)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { success: false, message: 'A rate for this date already exists.' },
      { status: 409 }
    )
  }

  const { data, error } = await db
    .from('daily_metal_rates')
    .insert({
      rate_date:  body.rate_date,
      gold_24k:   body.gold_24k   ? Number(body.gold_24k)   : null,
      gold_18kw:  body.gold_18kw  ? Number(body.gold_18kw)  : null,
      gold_18ky:  body.gold_18ky  ? Number(body.gold_18ky)  : null,
      gold_14ky:  body.gold_14ky  ? Number(body.gold_14ky)  : null,
      platinum:   body.platinum   ? Number(body.platinum)   : null,
      silver:     body.silver     ? Number(body.silver)     : null,
      palladium:  body.palladium  ? Number(body.palladium)  : null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}
```

### `PUT /api/metal-rates/[id]`

```typescript
// app/api/metal-rates/[id]/route.ts
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const db = createServiceClient()

  const { data, error } = await db
    .from('daily_metal_rates')
    .update({
      rate_date: body.rate_date,
      gold_24k:  body.gold_24k  ? Number(body.gold_24k)  : null,
      gold_18kw: body.gold_18kw ? Number(body.gold_18kw) : null,
      gold_18ky: body.gold_18ky ? Number(body.gold_18ky) : null,
      gold_14ky: body.gold_14ky ? Number(body.gold_14ky) : null,
      platinum:  body.platinum  ? Number(body.platinum)  : null,
      silver:    body.silver    ? Number(body.silver)    : null,
      palladium: body.palladium ? Number(body.palladium) : null,
    })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}
```

### `DELETE /api/metal-rates/[id]`

```typescript
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const db = createServiceClient()

  // Guard: check references
  const { count } = await db
    .from('invoice_headers')
    .select('*', { count: 'exact', head: true })
    .eq('metal_rate_id', params.id)

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { success: false, message: `Cannot delete: ${count} invoice(s) reference this rate.` },
      { status: 409 }
    )
  }

  const { error } = await db.from('daily_metal_rates').delete().eq('id', params.id)
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

---

## 7. COMPONENT STRUCTURE

```
app/(dashboard)/admin/metal-rates/
  page.tsx                    ← Server Component: load initial data

components/admin/metal-rates/
  MetalRatesTable.tsx         ← Table with edit/delete actions
  MetalRateModal.tsx          ← Add/Edit form modal
  DeleteRateButton.tsx        ← Delete with confirm + 409 error handling
```

---

## 8. PAGE COMPONENT PATTERN

```tsx
// app/(dashboard)/admin/metal-rates/page.tsx
import { createClient } from '@/lib/supabase/server'
import MetalRatesClient from '@/components/admin/metal-rates/MetalRatesClient'

export default async function MetalRatesPage() {
  const db = await createClient()
  const { data: rates } = await db
    .from('daily_metal_rates')
    .select('*')
    .order('rate_date', { ascending: false })

  return <MetalRatesClient initialRates={rates ?? []} />
}
```

```tsx
// components/admin/metal-rates/MetalRatesClient.tsx
'use client'

interface Props { initialRates: DailyMetalRate[] }

export default function MetalRatesClient({ initialRates }: Props) {
  const [rates, setRates] = useState(initialRates)
  const [showModal, setShowModal] = useState(false)
  const [editRate, setEditRate] = useState<DailyMetalRate | null>(null)

  const handleSaved = (saved: DailyMetalRate) => {
    setRates(prev => {
      const idx = prev.findIndex(r => r.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = saved
        return next.sort((a, b) => b.rate_date.localeCompare(a.rate_date))
      }
      return [saved, ...prev]
    })
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                        textTransform: 'uppercase', letterSpacing: '0.1em',
                        color: 'var(--text-secondary)', marginBottom: '4px' }}>
            ADMIN
          </div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)',
                        fontWeight: 400, color: 'var(--text-primary)', margin: 0 }}>
            Metal Rates
          </h1>
        </div>
        <button
          onClick={() => { setEditRate(null); setShowModal(true) }}
          style={{ background: 'var(--btn-dark-bg)', color: 'var(--text-inverse)',
                   border: 'none', borderRadius: 0, padding: '0.75rem 1.5rem',
                   fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                   fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                   cursor: 'pointer' }}
        >
          + Add Rate
        </button>
      </div>

      <MetalRatesTable
        rates={rates}
        onEdit={(rate) => { setEditRate(rate); setShowModal(true) }}
        onDeleted={(id) => setRates(prev => prev.filter(r => r.id !== id))}
      />

      {showModal && (
        <MetalRateModal
          rate={editRate}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
    </>
  )
}
```

---

## 9. TABLE COMPONENT

```tsx
// components/admin/metal-rates/MetalRatesTable.tsx
const formatRate = (v: number | null | undefined) =>
  v != null ? `$${v.toFixed(4)}` : '—'

const thStyle: CSSProperties = {
  fontSize: 'var(--text-xs)', textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'var(--text-secondary)',
  padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-base)',
  background: 'var(--bg-base)', textAlign: 'right', whiteSpace: 'nowrap',
}

export default function MetalRatesTable({ rates, onEdit, onDeleted }: Props) {
  return (
    <div style={{ border: '1px solid var(--border-base)', background: 'var(--bg-surface)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: 'left' }}>Date</th>
            <th style={thStyle}>24K</th>
            <th style={thStyle}>18KW</th>
            <th style={thStyle}>18KY</th>
            <th style={thStyle}>14KY</th>
            <th style={thStyle}>Platinum</th>
            <th style={thStyle}>Silver</th>
            <th style={thStyle}>Palladium</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rates.map(rate => (
            <tr key={rate.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
              <td style={{ padding: '0.5rem 1rem', fontFamily: 'var(--font-mono)',
                            fontSize: 'var(--text-sm)' }}>
                {rate.rate_date}
              </td>
              {(['gold_24k','gold_18kw','gold_18ky','gold_14ky','platinum','silver','palladium'] as const).map(col => (
                <td key={col} style={{ padding: '0.5rem 1rem', fontFamily: 'var(--font-mono)',
                                        fontSize: 'var(--text-sm)', textAlign: 'right',
                                        color: rate[col] != null ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {formatRate(rate[col])}
                </td>
              ))}
              <td style={{ padding: '0.5rem 1rem', textAlign: 'center' }}>
                <button onClick={() => onEdit(rate)} style={{ background: 'none', border: 'none',
                          cursor: 'pointer', color: 'var(--text-secondary)', marginRight: '8px' }}>
                  <i className="fa-solid fa-pen-to-square" />
                </button>
                <DeleteRateButton rateId={rate.id} rateDate={rate.rate_date} onDeleted={onDeleted} />
              </td>
            </tr>
          ))}
          {rates.length === 0 && (
            <tr>
              <td colSpan={9} style={{ textAlign: 'center', padding: '3rem',
                                        color: 'var(--text-muted)' }}>
                No metal rates found. Click "+ Add Rate" to add one.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
```

---

## 10. METAL RATE MODAL

```tsx
// components/admin/metal-rates/MetalRateModal.tsx
'use client'

const METAL_FIELDS = [
  { key: 'gold_24k',   label: '24K Gold' },
  { key: 'gold_18kw',  label: '18KW Gold' },
  { key: 'gold_18ky',  label: '18KY Gold' },
  { key: 'gold_14ky',  label: '14KY Gold' },
  { key: 'platinum',   label: 'Platinum' },
  { key: 'silver',     label: 'Silver' },
  { key: 'palladium',  label: 'Palladium' },
] as const

export default function MetalRateModal({ rate, onClose, onSaved }: Props) {
  const isEdit = !!rate
  const [form, setForm] = useState<MetalRateFormData>(
    rate
      ? {
          rate_date: rate.rate_date,
          gold_24k:  rate.gold_24k?.toString()  ?? '',
          gold_18kw: rate.gold_18kw?.toString() ?? '',
          gold_18ky: rate.gold_18ky?.toString() ?? '',
          gold_14ky: rate.gold_14ky?.toString() ?? '',
          platinum:  rate.platinum?.toString()  ?? '',
          silver:    rate.silver?.toString()    ?? '',
          palladium: rate.palladium?.toString() ?? '',
        }
      : defaultForm
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const url    = isEdit ? `/api/metal-rates/${rate!.id}` : '/api/metal-rates'
      const method = isEdit ? 'PUT' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!data.success) { setError(data.message); return }
      onSaved(data.data)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ /* Modal backdrop */ position: 'fixed', inset: 0,
                   background: 'rgba(26,24,20,0.5)', display: 'flex',
                   alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)',
                     borderRadius: 4, width: '100%', maxWidth: 520, maxHeight: '90vh',
                     overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)',
                       background: 'var(--bg-base)' }}>
          <h5 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)',
                        fontWeight: 400, margin: 0 }}>
            {isEdit ? 'Edit Metal Rate' : 'Add Metal Rate'}
          </h5>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
          {/* Date */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', textTransform: 'uppercase',
                             letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 4 }}>
              Rate Date *
            </label>
            <input
              type="date"
              required
              value={form.rate_date}
              onChange={e => setForm(f => ({ ...f, rate_date: e.target.value }))}
              style={{ width: '100%', border: '1px solid var(--border-base)', borderRadius: 0,
                        padding: '0.5rem 0.75rem', fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-sm)' }}
            />
          </div>

          {/* Rate fields grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            {METAL_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', textTransform: 'uppercase',
                                  letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 4 }}>
                  {label}
                </label>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder="0.0000"
                  style={{ width: '100%', border: '1px solid var(--border-base)', borderRadius: 0,
                            padding: '0.5rem 0.75rem', fontFamily: 'var(--font-mono)',
                            fontSize: 'var(--text-sm)', textAlign: 'right' }}
                />
              </div>
            ))}
          </div>

          {error && (
            <div style={{ marginTop: '1rem', borderLeft: '2px solid var(--color-danger)',
                           padding: '0.75rem 1rem', color: 'var(--color-danger)',
                           fontSize: 'var(--text-sm)', background: '#FAF2F2' }}>
              {error}
            </div>
          )}
        </form>

        {/* Footer */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-light)',
                       background: 'var(--bg-base)', display: 'flex', gap: '0.75rem',
                       justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving}
                  style={{ background: 'transparent', border: '1px solid var(--border-base)',
                             borderRadius: 0, padding: '0.625rem 1.25rem', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSubmit as any} disabled={saving}
                  style={{ background: 'var(--btn-dark-bg)', color: 'var(--text-inverse)',
                             border: 'none', borderRadius: 0, padding: '0.625rem 1.25rem',
                             cursor: saving ? 'not-allowed' : 'pointer',
                             opacity: saving ? 0.7 : 1 }}>
            {saving ? <><i className="fa-solid fa-circle-notch fa-spin" /> Saving…</> : 'Save Rate'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

---

## 11. API ENDPOINTS SUMMARY

| Action | Method | URL | Auth |
|--------|--------|-----|------|
| List all rates | GET | `/api/metal-rates` | admin |
| Create rate | POST | `/api/metal-rates` | admin |
| Update rate | PUT | `/api/metal-rates/[id]` | admin |
| Delete rate | DELETE | `/api/metal-rates/[id]` | admin |

---

## 12. DISPLAY FORMAT CONSTANTS

```typescript
export const formatRate   = (v: number | null | undefined) => v != null ? `$${v.toFixed(4)}` : '—'
export const formatDate   = (d: string) => d.slice(0, 10)
export const formatWeight = (v: number) => v.toFixed(4)
```
