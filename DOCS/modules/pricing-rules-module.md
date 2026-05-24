# Pricing Rules Module — Admin CRUD

> **Phạm vi:** Admin page `/admin/pricing-rules` + API `/api/pricing-rules`
> **Bảng:** `pricing_rules` — Cấu hình bội số giá CIF/Tag/FR và casting loss %
> **Critical constraint:** Chỉ 1 rule có `is_active = true` tại một thời điểm

---

## 1. DATABASE SCHEMA

```sql
CREATE TABLE pricing_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  cif_multiplier  NUMERIC(8,4) NOT NULL DEFAULT 1.0,   -- x HPUSA
  tag_multiplier  NUMERIC(8,4) NOT NULL DEFAULT 1.0,   -- x CIF
  fr_multiplier   NUMERIC(8,4) NOT NULL DEFAULT 1.0,   -- x CIF
  casting_loss_pct NUMERIC(6,2) NOT NULL DEFAULT 5.0,  -- % casting loss
  is_active       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Partial unique index: chỉ 1 row được phép is_active = true
CREATE UNIQUE INDEX idx_pricing_rules_single_active
  ON pricing_rules (is_active)
  WHERE is_active = true;
```

**Giải thích các multipliers:**
```
gold_value_usd = weight_gold_actual_gr × metal_rate × (1 + casting_loss_pct / 100)
hpusa          = gold_value_usd + gem_costs + fees
cif_price      = hpusa × cif_multiplier    -- landed cost
tag_price      = cif_price × tag_multiplier -- retail tag price
fr_price       = cif_price × fr_multiplier  -- factory/wholesale price
```

---

## 2. BUSINESS RULES — CRITICAL

### 2.1 Chỉ 1 Active Rule

```typescript
// Khi activate 1 rule → phải deactivate tất cả rule khác trước
// Order bắt buộc (tránh vi phạm partial unique index):
// 1. UPDATE pricing_rules SET is_active = false WHERE is_active = true
// 2. UPDATE pricing_rules SET is_active = true WHERE id = targetId

// Hoặc dùng transaction:
const { error } = await db.rpc('activate_pricing_rule', { rule_id: id })

// PostgreSQL function:
CREATE OR REPLACE FUNCTION activate_pricing_rule(rule_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE pricing_rules SET is_active = false, updated_at = now()
  WHERE is_active = true AND id != rule_id;
  
  UPDATE pricing_rules SET is_active = true, updated_at = now()
  WHERE id = rule_id;
END;
$$ LANGUAGE plpgsql;
```

### 2.2 Rule Snapshot tại Invoice

```typescript
// Khi TẠO invoice mới → lấy active rule rồi lưu vào invoice_headers.pricing_rule_id
// KHÔNG bao giờ thay đổi pricing_rule_id của invoice sau khi tạo

// Lookup active rule:
const { data: rule } = await db
  .from('pricing_rules')
  .select('*')
  .eq('is_active', true)
  .single()

// Lưu vào invoice:
await db.from('invoice_headers').insert({
  ...invoiceData,
  pricing_rule_id: rule.id,  // snapshot tại thời điểm tạo
})

// KHI RECALCULATE → PHẢI dùng rule từ invoice.pricing_rule_id, KHÔNG phải active rule hiện tại
const { data: rule } = await db
  .from('pricing_rules')
  .select('*')
  .eq('id', invoice.pricing_rule_id)  // snapshot rule
  .single()
```

### 2.3 Update Rule → Bulk Recalculate

```typescript
// Khi PATCH pricing_rules → check invoices đang dùng rule này
// Nếu có → recalculate tất cả items (chỉ non-locked invoices)

const { data: affectedInvoices } = await db
  .from('invoice_headers')
  .select('id, metal_rate_id')
  .eq('pricing_rule_id', ruleId)
  .eq('is_locked', false)
  .neq('status', 'invoiced')

// Với mỗi invoice → load metal_rate → bulkRecalculate()
for (const invoice of affectedInvoices ?? []) {
  const { data: rate } = await db
    .from('daily_metal_rates')
    .select('*')
    .eq('id', invoice.metal_rate_id)
    .single()
  
  await bulkRecalculate(db, invoice.id, rate, updatedRule)
}

// KHÔNG recalculate invoices có is_locked = true (invoiced status)
// Locked invoices dùng snapshot_data — giá trị đã frozen
```

### 2.4 Delete Guard

```typescript
// Không được xóa rule nếu có invoice đang reference
const { count } = await db
  .from('invoice_headers')
  .select('id', { count: 'exact', head: true })
  .eq('pricing_rule_id', id)

if (count && count > 0) {
  return NextResponse.json({
    success: false,
    message: `Cannot delete: ${count} invoice(s) use this pricing rule.`
  }, { status: 409 })
}

// Không được xóa rule đang active
// (user phải deactivate trước hoặc activate rule khác)
const { data: rule } = await db.from('pricing_rules').select('is_active').eq('id', id).single()
if (rule?.is_active) {
  return NextResponse.json({
    success: false,
    message: 'Cannot delete the active pricing rule. Activate another rule first.'
  }, { status: 409 })
}
```

---

## 3. API ENDPOINTS

### GET /api/pricing-rules

```typescript
// List tất cả pricing rules, newest first
// Kèm invoice count per rule

const { data: rules } = await db
  .from('pricing_rules')
  .select('*')
  .order('created_at', { ascending: false })

// Count invoices per rule:
const { data: counts } = await db
  .from('invoice_headers')
  .select('pricing_rule_id')

const countMap = counts?.reduce((acc, row) => {
  acc[row.pricing_rule_id] = (acc[row.pricing_rule_id] || 0) + 1
  return acc
}, {} as Record<string, number>) ?? {}

const result = rules?.map(r => ({
  ...r,
  invoiceCount: countMap[r.id] ?? 0
}))

// Response: { success: true, data: PricingRule[] }
```

### POST /api/pricing-rules

```typescript
// Body: { name, cif_multiplier, tag_multiplier, fr_multiplier, casting_loss_pct, is_active? }
// is_active default = false khi tạo mới

// Validation:
// 1. name required, không được trùng
// 2. Tất cả multipliers > 0
// 3. casting_loss_pct >= 0

// Nếu is_active = true → dùng activate_pricing_rule RPC

const body = await req.json()
const rule = await db.from('pricing_rules').insert({
  name:             body.name,
  cif_multiplier:   body.cif_multiplier,
  tag_multiplier:   body.tag_multiplier,
  fr_multiplier:    body.fr_multiplier,
  casting_loss_pct: body.casting_loss_pct,
  is_active:        false,  // always create as inactive
}).select().single()

if (body.is_active) {
  await db.rpc('activate_pricing_rule', { rule_id: rule.data.id })
}

// Response: { success: true, data: PricingRule }
```

### PATCH /api/pricing-rules/[id]

```typescript
// Body: { name?, cif_multiplier?, tag_multiplier?, fr_multiplier?, casting_loss_pct? }
// NOTE: is_active KHÔNG được update qua PATCH thông thường
//       Dùng POST /api/pricing-rules/[id]/activate để activate

// Validation:
// 1. Rule phải tồn tại
// 2. Multipliers > 0 nếu provided
// 3. casting_loss_pct >= 0 nếu provided

await db.from('pricing_rules').update({
  ...body,
  updated_at: new Date().toISOString(),
}).eq('id', id)

// Sau khi update → trigger bulk recalculate cho affected invoices
// (chạy async hoặc trả về affected count cho client xử lý)

// Response: { success: true, data: { affectedInvoices: number } }
```

### POST /api/pricing-rules/[id]/activate

```typescript
// Activate 1 rule (deactivate tất cả rule khác)
// Admin only

await db.rpc('activate_pricing_rule', { rule_id: id })

// Response: { success: true }
```

### DELETE /api/pricing-rules/[id]

```typescript
// Guard: check FK + check is_active
// Xem section 2.4

await db.from('pricing_rules').delete().eq('id', id)

// Response: { success: true }
```

---

## 4. TYPESCRIPT TYPES

```typescript
export interface PricingRule {
  id: string
  name: string
  cif_multiplier:   number
  tag_multiplier:   number
  fr_multiplier:    number
  casting_loss_pct: number
  is_active: boolean
  created_at: string
  updated_at: string
  invoiceCount?: number  // computed from join
}

export interface PricingRuleFormData {
  name: string
  cif_multiplier:   number
  tag_multiplier:   number
  fr_multiplier:    number
  casting_loss_pct: number
}

export interface PricingRuleValidationErrors {
  name?: string
  cif_multiplier?: string
  tag_multiplier?: string
  fr_multiplier?: string
  casting_loss_pct?: string
}
```

---

## 5. ADMIN PAGE UI

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│ PAGE HEADER: "Pricing Rules" (serif h1)                      │
│ Subtitle: "Configure price multipliers for invoices"         │
├──────────────────────────────────────────────────────────────┤
│ [+ Add Rule]                                                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ TABLE: Name | CIF | Tag | FR | Casting% | Active |   │   │
│  │        Invoices | Actions                            │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Table Columns

| Column | Format | Notes |
|--------|--------|-------|
| Name | TEXT | Rule name |
| CIF Mult | `×X.XXXX` | font-mono |
| Tag Mult | `×X.XXXX` | font-mono |
| FR Mult | `×X.XXXX` | font-mono |
| Casting Loss | `X.XX%` | font-mono |
| Status | Badge | `ACTIVE` (green) / `INACTIVE` (muted) |
| # Invoices | count | Số invoice đang dùng rule này |
| Actions | Activate / Edit / Delete | Delete disabled nếu has FK refs |

### Active Badge

```tsx
const StatusBadge = ({ isActive }: { isActive: boolean }) => (
  <span style={{
    border: `1px solid ${isActive ? 'var(--color-success)' : 'var(--border-base)'}`,
    color: isActive ? 'var(--color-success)' : 'var(--text-muted)',
    padding: '2px 8px',
    fontSize: 'var(--text-xs)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontFamily: 'var(--font-mono)',
  }}>
    {isActive ? 'ACTIVE' : 'INACTIVE'}
  </span>
)
```

### Activate Button

```tsx
// Chỉ hiện khi rule chưa active
{!rule.is_active && (
  <button
    onClick={() => handleActivate(rule.id)}
    title="Set as active rule"
    style={{ color: 'var(--color-success)' }}
  >
    <i className="fa-solid fa-circle-check" /> Activate
  </button>
)}

// Confirm trước khi activate (vì sẽ deactivate rule cũ):
// "Activate '[name]'? This will deactivate the current active rule
//  and may trigger recalculation for invoices using this rule."
```

### Delete Button State

```tsx
<button
  disabled={rule.invoiceCount > 0 || rule.is_active}
  title={
    rule.is_active ? 'Cannot delete active rule'
    : rule.invoiceCount > 0 ? `Used by ${rule.invoiceCount} invoices`
    : 'Delete'
  }
  onClick={() => handleDelete(rule.id)}
>
  <i className="fa-solid fa-trash-can" />
</button>
```

---

## 6. ADD/EDIT MODAL

```tsx
// Modal: max-width 520px

<div className="modal">
  <div className="modal-header">
    <h5>{editId ? 'Edit Pricing Rule' : 'Add Pricing Rule'}</h5>
  </div>
  <div className="modal-body">
    
    {/* Rule Name */}
    <div>
      <label>Rule Name *</label>
      <input type="text" value={form.name}
             onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
    </div>
    
    {/* Multipliers — 2-col grid */}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div>
        <label>CIF Multiplier *</label>
        <input type="number" step="0.0001" min="0.0001"
               value={form.cif_multiplier} onChange={...} />
        <small>CIF = HPUSA × multiplier</small>
      </div>
      <div>
        <label>Casting Loss % *</label>
        <input type="number" step="0.01" min="0"
               value={form.casting_loss_pct} onChange={...} />
        <small>Gold value mark-up for casting loss</small>
      </div>
      <div>
        <label>Tag Price Multiplier *</label>
        <input type="number" step="0.0001" min="0.0001"
               value={form.tag_multiplier} onChange={...} />
        <small>Tag = CIF × multiplier</small>
      </div>
      <div>
        <label>FR Price Multiplier *</label>
        <input type="number" step="0.0001" min="0.0001"
               value={form.fr_multiplier} onChange={...} />
        <small>FR = CIF × multiplier</small>
      </div>
    </div>
    
    {/* Example calculation */}
    <div style={{ background: 'var(--bg-base)', padding: 12, marginTop: 16 }}>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
        Example (HPUSA = $100.00, Gold Weight = 5g, Metal Rate = $60/g)
      </div>
      {/* Live preview calc */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
        Gold Value = 5 × $60 × (1 + {form.casting_loss_pct}%) = ${calcExample.goldValue}<br/>
        HPUSA      = $100.00 (sample)<br/>
        CIF        = $100 × {form.cif_multiplier} = ${calcExample.cif}<br/>
        Tag Price  = ${calcExample.cif} × {form.tag_multiplier} = ${calcExample.tag}<br/>
        FR Price   = ${calcExample.cif} × {form.fr_multiplier} = ${calcExample.fr}
      </div>
    </div>
    
    {/* Warning khi edit active rule */}
    {editId && activeRule?.id === editId && (
      <div style={{ borderLeft: '2px solid var(--color-warning)', padding: '8px 12px', marginTop: 12, color: 'var(--color-warning)' }}>
        <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 6 }} />
        This is the <strong>active rule</strong>. Saving will trigger recalculation
        of all affected unlocked invoices.
      </div>
    )}
    
  </div>
  <div className="modal-footer">
    <button onClick={onClose}>Cancel</button>
    <button onClick={handleSave} style={{ background: 'var(--btn-dark-bg)', color: 'var(--text-inverse)' }}>
      Save
    </button>
  </div>
</div>
```

---

## 7. VALIDATION RULES

```typescript
// Client-side:
function validatePricingRule(form: PricingRuleFormData): PricingRuleValidationErrors {
  const errors: PricingRuleValidationErrors = {}
  
  if (!form.name?.trim()) {
    errors.name = 'Rule name is required'
  }
  if (!form.cif_multiplier || form.cif_multiplier <= 0) {
    errors.cif_multiplier = 'CIF multiplier must be > 0'
  }
  if (!form.tag_multiplier || form.tag_multiplier <= 0) {
    errors.tag_multiplier = 'Tag multiplier must be > 0'
  }
  if (!form.fr_multiplier || form.fr_multiplier <= 0) {
    errors.fr_multiplier = 'FR multiplier must be > 0'
  }
  if (form.casting_loss_pct < 0) {
    errors.casting_loss_pct = 'Casting loss % cannot be negative'
  }
  
  return errors
}

// Server-side thêm:
// 1. name unique check → 409 nếu trùng
// 2. Delete guard: check FK + check is_active
// 3. Only admin role → 403 nếu không phải admin
```

---

## 8. PRICING RULE USAGE FLOW

```
┌─────────────────────────────────────────────────────────────┐
│                  PRICING RULE LIFECYCLE                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Admin creates rule with multipliers                     │
│  2. Admin activates rule (only 1 active at a time)          │
│  3. New invoice created → snapshot: pricing_rule_id = active│
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ INVOICE A          INVOICE B           INVOICE C     │  │
│  │ pricing_rule_id=R1  pricing_rule_id=R1  rule_id=R2  │  │
│  │ (uses R1 forever)  (uses R1 forever)  (uses R2)    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  4. Admin updates R1 → recalc invoices A & B (not C)        │
│  5. Admin switches active to R2 → new invoices use R2       │
│  6. Invoices A & B still use R1 (their snapshot)            │
│     Invoices A & B will recalc with R1 values               │
│                                                             │
│  7. Invoice goes to 'invoiced' → FROZEN                     │
│     No recalculation ever again, even if R1 changes         │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. RECALCULATE ON UPDATE

```typescript
// app/api/pricing-rules/[id]/route.ts — PATCH handler

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const db = createServiceClient()
  const body = await req.json()
  const { id } = params
  
  // 1. Update the rule
  const { data: updatedRule } = await db
    .from('pricing_rules')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  
  // 2. Find affected invoices (non-locked only)
  const { data: affectedInvoices } = await db
    .from('invoice_headers')
    .select('id, metal_rate_id')
    .eq('pricing_rule_id', id)
    .eq('is_locked', false)
    .neq('status', 'invoiced')
  
  // 3. Bulk recalculate
  let recalculatedCount = 0
  for (const invoice of affectedInvoices ?? []) {
    const { data: rate } = await db
      .from('daily_metal_rates')
      .select('*')
      .eq('id', invoice.metal_rate_id)
      .single()
    
    if (rate) {
      await bulkRecalculate(db, invoice.id, rate, updatedRule)
      recalculatedCount++
    }
  }
  
  return NextResponse.json({
    success: true,
    data: {
      rule: updatedRule,
      affectedInvoices: recalculatedCount
    }
  })
}
```

---

## 10. COMPONENT STRUCTURE

```
app/(dashboard)/admin/pricing-rules/page.tsx
components/admin/pricing-rules/
  PricingRulesTable.tsx      ← Main table
  PricingRuleModal.tsx       ← Add/Edit modal
  PricingRulePreview.tsx     ← Live calc preview in modal
  ActivateRuleButton.tsx     ← Activate với confirm dialog
  DeleteRuleButton.tsx       ← Delete với guard + tooltip
```

---

## 11. STATE MANAGEMENT (Client)

```typescript
interface PricingRulesState {
  rules: PricingRule[]
  loading: boolean
  modal: {
    open: boolean
    editId: string | null
    form: PricingRuleFormData
    saving: boolean
    errors: PricingRuleValidationErrors
  }
  activating: string | null   // rule id being activated
  deleting: string | null     // rule id being deleted
}

// Computed:
const activeRule = rules.find(r => r.is_active)

// After activate: optimistic update is_active on all rules
// After save: re-fetch list (to get updated invoiceCount etc)
```

---

## 12. FORMAT HELPERS

```typescript
const formatMultiplier = (v: number) => `×${v.toFixed(4)}`
const formatPct = (v: number) => `${v.toFixed(2)}%`

// Example preview calculation:
function calcPreview(form: PricingRuleFormData, sampleHpusa = 100) {
  const goldValue = 5 * 60 * (1 + form.casting_loss_pct / 100)
  const cif = sampleHpusa * form.cif_multiplier
  const tag = cif * form.tag_multiplier
  const fr  = cif * form.fr_multiplier
  return {
    goldValue: goldValue.toFixed(2),
    cif: cif.toFixed(2),
    tag: tag.toFixed(2),
    fr:  fr.toFixed(2),
  }
}
```
