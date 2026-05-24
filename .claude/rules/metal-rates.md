# Metal Rates — Daily Rates CRUD & Lookup Rules

> **Phạm vi:** Admin page `/admin/metal-rates` + API `/api/metal-rates`
> **Bảng:** `daily_metal_rates` — 1 row/ngày, FK từ `invoice_headers.metal_rate_id`

---

## 1. DATABASE SCHEMA

```sql
CREATE TABLE daily_metal_rates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_date   DATE NOT NULL UNIQUE,     -- khóa tra cứu, UNIQUE
  gold_24k    NUMERIC(12,4),            -- USD/gram
  gold_18kw   NUMERIC(12,4),
  gold_18ky   NUMERIC(12,4),
  gold_14ky   NUMERIC(12,4),
  platinum    NUMERIC(12,4),
  silver      NUMERIC(12,4),
  palladium   NUMERIC(12,4),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_by  TEXT                      -- username
);

CREATE INDEX ON daily_metal_rates(rate_date DESC);
```

---

## 2. METAL TYPE → RATE COLUMN MAP

```typescript
// Dùng trong recalculateItem() + pricing chain:
const METAL_RATE_MAP: Record<string, keyof DailyMetalRate> = {
  '18KW': 'gold_18kw',
  '18KY': 'gold_18ky',
  '14KY': 'gold_14ky',
  'PT950': 'platinum',
  'PT':    'platinum',
  '24K':   'gold_24k',
  'AG':    'silver',
  'PD':    'palladium',
}

function getMetalRate(metalType: string, row: DailyMetalRate): number {
  const key = METAL_RATE_MAP[metalType]
  if (key && row[key] != null) return Number(row[key])
  return Number(row.gold_24k) ?? 0  // fallback gold_24k
}
```

---

## 3. API ENDPOINTS

### GET /api/metal-rates

```typescript
// List tất cả rates, newest first
// Query params: ?limit=50&page=1

const { data, count } = await db
  .from('daily_metal_rates')
  .select('*', { count: 'exact' })
  .order('rate_date', { ascending: false })
  .range(offset, offset + limit - 1)

// Response: { success: true, data: DailyMetalRate[], total: number }
```

### POST /api/metal-rates

```typescript
// Tạo row mới
// Body: { rate_date, gold_24k, gold_18kw, gold_18ky, gold_14ky, platinum, silver, palladium }

// Validation:
// 1. rate_date required, format YYYY-MM-DD
// 2. Check duplicate: SELECT id WHERE rate_date = ?
//    → nếu tồn tại: 409 { success: false, message: 'Rate date already exists.' }
// 3. Ít nhất 1 rate field phải có giá trị > 0

await db.from('daily_metal_rates').insert({
  rate_date,
  gold_24k:  parseOrNull(body.gold_24k),
  gold_18kw: parseOrNull(body.gold_18kw),
  gold_18ky: parseOrNull(body.gold_18ky),
  gold_14ky: parseOrNull(body.gold_14ky),
  platinum:  parseOrNull(body.platinum),
  silver:    parseOrNull(body.silver),
  palladium: parseOrNull(body.palladium),
  created_by: session.username,
})
```

### PATCH /api/metal-rates/[id]

```typescript
// Cập nhật rate values (không đổi được rate_date sau khi tạo)
// Body: { gold_24k?, gold_18kw?, gold_18ky?, gold_14ky?, platinum?, silver?, palladium? }

// Validate: id tồn tại → 404 nếu không
// CHECK is_locked KHÔNG cần (rates không bị lock — chỉ invoice bị lock)

// CRITICAL: Sau khi UPDATE rate → check có invoice nào ref tới id này không
// Nếu có → bulk recalculate tất cả invoice items đó (background job hoặc sync)
// Hiện tại: notify caller để trigger bulk recalc từ invoice detail page
```

### DELETE /api/metal-rates/[id]

```typescript
// CRITICAL DELETE GUARD — phải check FK trước khi xóa:
const { count } = await db
  .from('invoice_headers')
  .select('id', { count: 'exact', head: true })
  .eq('metal_rate_id', id)

if (count && count > 0) {
  return NextResponse.json({
    success: false,
    message: `Cannot delete: ${count} invoice(s) reference this rate.`
  }, { status: 409 })
}

// Nếu không có invoice nào ref → xóa an toàn
await db.from('daily_metal_rates').delete().eq('id', id)
```

---

## 4. LOOKUP PATTERN (Khi tạo Invoice mới)

```typescript
// Lấy rate mặc định cho invoice mới:
const today = new Date().toISOString().slice(0, 10)  // YYYY-MM-DD

// Thử ngày hôm nay trước:
const { data: todayRate } = await db
  .from('daily_metal_rates')
  .select('*')
  .eq('rate_date', today)
  .maybeSingle()

// Fallback: lấy rate mới nhất:
const { data: latestRate } = await db
  .from('daily_metal_rates')
  .select('*')
  .order('rate_date', { ascending: false })
  .limit(1)
  .single()

const defaultRate = todayRate ?? latestRate
// Lưu: invoice_headers.metal_rate_id = defaultRate.id
```

---

## 5. ADMIN PAGE UI

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│ PAGE HEADER: "Metal Rates" (serif h1)                        │
│ Subtitle: "Daily gold/platinum/silver rates (USD/gram)"      │
├──────────────────────────────────────────────────────────────┤
│ [+ Add Rate]                    [🔍 Filter by date range]    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ TABLE: date | 24K | 18KW | 18KY | 14KY | PT | AG | PD │  │
│  │        | # Invoices | Actions                        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  [Pagination]                                                │
└──────────────────────────────────────────────────────────────┘
```

### Table Columns

| Column | Format | Notes |
|--------|--------|-------|
| Date | YYYY-MM-DD | Newest first |
| 24K | $xx.xxxx/g | font-mono |
| 18KW | $xx.xxxx/g | font-mono |
| 18KY | $xx.xxxx/g | font-mono |
| 14KY | $xx.xxxx/g | font-mono |
| PT (Platinum) | $xx.xxxx/g | font-mono |
| AG (Silver) | $xx.xxxx/g | font-mono |
| PD (Palladium) | $xx.xxxx/g | font-mono |
| # Invoices | count | Số invoice đang dùng rate này |
| Actions | Edit / Delete | Delete disabled nếu # Invoices > 0 |

### Rate Value Display

```typescript
const formatRate = (v: number | null | undefined): string =>
  v != null ? `$${v.toFixed(4)}` : '—'

// null → hiển thị '—' (không phải 0)
// color var(--color-gold-value): #B8860B cho gold rates
// color var(--text-secondary) cho platinum, silver, palladium
```

### Delete Button State

```tsx
// Disabled + tooltip nếu invoice_count > 0:
<button
  disabled={row.invoiceCount > 0}
  title={row.invoiceCount > 0 ? `Used by ${row.invoiceCount} invoices` : 'Delete'}
  onClick={() => handleDelete(row.id)}
>
  <i className="fa-solid fa-trash-can" />
</button>
```

---

## 6. ADD/EDIT MODAL

```html
<!-- Modal: max-width 560px -->
<div class="modal" id="rateModal">
  <div class="modal-header">
    <h5>Add Metal Rate / Edit Metal Rate</h5>
  </div>
  <div class="modal-body">
    
    <!-- Date (readonly khi edit) -->
    <div>
      <label>Date *</label>
      <input type="date" id="rate_date" required>
      <!-- Khi edit: readonly, background var(--bg-muted) -->
    </div>
    
    <!-- Rate inputs: 2 cols grid -->
    <div class="grid-2col">
      <div>
        <label>24K (USD/gram)</label>
        <input type="number" id="rate_24k" step="0.0001" min="0">
      </div>
      <div>
        <label>18K White (USD/gram)</label>
        <input type="number" id="rate_18kw" step="0.0001" min="0">
      </div>
      <div>
        <label>18K Yellow (USD/gram)</label>
        <input type="number" id="rate_18ky" step="0.0001" min="0">
      </div>
      <div>
        <label>14K Yellow (USD/gram)</label>
        <input type="number" id="rate_14ky" step="0.0001" min="0">
      </div>
      <div>
        <label>Platinum (USD/gram)</label>
        <input type="number" id="rate_pt" step="0.0001" min="0">
      </div>
      <div>
        <label>Silver (USD/gram)</label>
        <input type="number" id="rate_ag" step="0.0001" min="0">
      </div>
      <div>
        <label>Palladium (USD/gram)</label>
        <input type="number" id="rate_pd" step="0.0001" min="0">
      </div>
    </div>
    
    <!-- Warning khi edit và có invoices đang dùng -->
    <div id="editRateWarning" class="alert alert-warning" style="display:none">
      <i class="fa-solid fa-triangle-exclamation"></i>
      This rate is used by <strong id="editRateInvoiceCount">N</strong> invoice(s).
      Updating will trigger recalculation of all affected items.
    </div>
    
  </div>
  <div class="modal-footer">
    <button class="btn-outline" data-dismiss="modal">Cancel</button>
    <button class="btn-primary" onclick="handleSaveRate()">Save</button>
  </div>
</div>
```

---

## 7. BULK RECALCULATE ON RATE UPDATE

```typescript
// Khi rate được cập nhật → cần recalc tất cả invoices dùng rate này:

// GET danh sách invoices ref tới rate_id:
const { data: affectedInvoices } = await db
  .from('invoice_headers')
  .select('id, pricing_rule_id')
  .eq('metal_rate_id', rateId)
  .eq('is_locked', false)  // KHÔNG recalc locked invoices
  .neq('status', 'invoiced')

// Với mỗi invoice → load pricing_rule → bulkRecalculate():
for (const invoice of affectedInvoices ?? []) {
  const { data: rule } = await db
    .from('pricing_rules')
    .select('*')
    .eq('id', invoice.pricing_rule_id)
    .single()

  await bulkRecalculate(db, invoice.id, updatedRate, rule)
}

// QUAN TRỌNG: KHÔNG recalc invoices có is_locked = true (status = invoiced)
// Locked invoices dùng snapshot_data — không cần recalc
```

---

## 8. INVOICE COUNT PER RATE (JOIN QUERY)

```typescript
// Để hiển thị "# Invoices" trong table:
const { data: rates } = await db
  .from('daily_metal_rates')
  .select(`
    *,
    invoice_headers!inner(id)
  `)
  .order('rate_date', { ascending: false })

// Hoặc count riêng:
const { data: rates } = await db.from('daily_metal_rates').select('*').order('rate_date', { ascending: false })
const { data: counts } = await db
  .from('invoice_headers')
  .select('metal_rate_id')

const invoiceCountByRate = counts?.reduce((acc, row) => {
  acc[row.metal_rate_id] = (acc[row.metal_rate_id] || 0) + 1
  return acc
}, {} as Record<string, number>) ?? {}

// Merge:
const ratesWithCount = rates?.map(r => ({
  ...r,
  invoiceCount: invoiceCountByRate[r.id] ?? 0
}))
```

---

## 9. COMPONENT STRUCTURE

```
app/(dashboard)/admin/metal-rates/page.tsx
components/admin/metal-rates/
  MetalRatesTable.tsx         ← Main table
  MetalRateModal.tsx          ← Add/Edit modal
  DeleteRateButton.tsx        ← Delete với guard + tooltip
```

---

## 10. TYPESCRIPT TYPES

```typescript
export interface DailyMetalRate {
  id: string
  rate_date: string       // YYYY-MM-DD
  gold_24k:  number | null
  gold_18kw: number | null
  gold_18ky: number | null
  gold_14ky: number | null
  platinum:  number | null
  silver:    number | null
  palladium: number | null
  created_at: string
  updated_at: string
  created_by: string | null
  invoiceCount?: number   // computed from JOIN
}

export interface MetalRateFormData {
  rate_date: string
  gold_24k?:  number | null
  gold_18kw?: number | null
  gold_18ky?: number | null
  gold_14ky?: number | null
  platinum?:  number | null
  silver?:    number | null
  palladium?: number | null
}
```

---

## 11. VALIDATION RULES

```typescript
// Client-side:
// 1. rate_date required
// 2. Ít nhất 1 field phải có giá trị
// 3. Mọi giá trị phải ≥ 0
// 4. Khi edit: date readonly

// Server-side:
// 1. rate_date UNIQUE → 409 nếu duplicate (POST)
// 2. Không xóa được nếu có invoice refs → 409
// 3. Only admin role → 403 nếu không phải admin

// Helper:
function parseOrNull(value: unknown): number | null {
  const n = parseFloat(String(value || ''))
  return isNaN(n) ? null : n
}
```
