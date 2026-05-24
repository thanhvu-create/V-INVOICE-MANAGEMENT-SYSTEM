# Business Logic — V-Invoice
> **Reference file:** đọc khi implement API routes và pricing calculations

---

## 1. PRICING FORMULAS

### 1.1 Gold Value

```typescript
// lib/formulas/goldValue.ts
function calcGoldValue(
  weightGoldActualGr: number,
  metalType: string,
  metalRates: DailyMetalRate,
  castingLossPct: number  // e.g. 5.0 = 5%
): number {
  const rateMap: Record<string, number | null> = {
    '18KW': metalRates.gold_18kw,
    '18KY': metalRates.gold_18ky,
    '14KY': metalRates.gold_14ky,
    'PT950': metalRates.platinum,
    'PT':   metalRates.platinum,
    '24K':  metalRates.gold_24k,
    'AG':   metalRates.silver,
    'PD':   metalRates.palladium,
  }
  const rate = rateMap[metalType] ?? metalRates.gold_24k ?? 0
  return weightGoldActualGr * rate * (1 + castingLossPct / 100)
}
```

**Ví dụ:** 3.5gr × $42.50/gr × 1.05 = **$156.19**

### 1.2 HPUSA (Tổng vốn sản xuất)

```typescript
// lib/formulas/hpusa.ts
function calcHPUSA(
  item: InvoiceItem,
  gems: GemDetail[]
): number {
  const goldValue   = item.gold_value_usd ?? 0
  const totalGemVal = gems.reduce((s, g) => s + (g.total_price ?? 0), 0)
  const totalGemFee = gems.reduce((s, g) => s + (g.total_setting_fee ?? 0), 0)
  return (
    goldValue
    + totalGemVal      // từ DB GENERATED column
    + totalGemFee      // từ DB GENERATED column
    + (item.labor_fee  ?? 0)
    + (item.casting_fee ?? 0)
    + (item.design_fee  ?? 0)
    + (item.resin_fee   ?? 0)
    + (item.misc_fee    ?? 0)
  )
}
```

### 1.3 CIF / Tag / FR

```typescript
// lib/formulas/pricing.ts
function calcPrices(hpusa: number, rule: PricingRule) {
  const cif = hpusa * rule.cif_multiplier
  return {
    cif_price: cif,
    tag_price: cif * rule.tag_multiplier,
    fr_price:  cif * rule.fr_multiplier,
  }
}
```

### 1.4 Weight No Gem

```typescript
function calcWeightNoGem(totalGr: number, gems: GemDetail[]): number {
  const gemGr = gems.reduce((s, g) => s + (g.weight_gr ?? 0), 0)
  return totalGr - gemGr
}
// Gem weight_gr là GENERATED ALWAYS: weight_ct_after * 0.2
// 1 carat = 0.2 gram
```

---

## 2. RECALCULATE CHAIN

Khi bất kỳ field nào thay đổi → trigger recalculate server-side:

```
Trigger:
  - gem.weight_ct_after thay đổi
  - gem.unit_price_per_ct thay đổi
  - gem.qty_pcs thay đổi
  - gem.setting_fee_per_pcs thay đổi
  - item.weight_gold_actual_gr thay đổi
  - item.labor_fee / casting_fee / design_fee / resin_fee / misc_fee thay đổi
  - metal_rate thay đổi (khi admin đổi rate)

Chain:
  1. gem.weight_gr = ct_after × 0.2          (DB GENERATED — tự động)
  2. gem.total_price = ct_after × unit_price   (DB GENERATED — tự động)
  3. gem.total_setting_fee = qty × fee          (DB GENERATED — tự động)
  4. item.weight_no_gem_gr = total_gr - Σgem.weight_gr
  5. item.gold_value_usd = calcGoldValue(...)
  6. item.hpusa = calcHPUSA(item, gems)
  7. item.cif_price = hpusa × A
  8. item.tag_price = cif × B
  9. item.fr_price = cif × C
  10. UPDATE invoice_items SET ...

Note: Bước 1-3 là GENERATED ALWAYS — PostgreSQL tự xử lý khi INSERT/UPDATE gem
Note: Bước 4-10 phải gọi explicitly trong API route sau mỗi thay đổi
```

---

## 3. INVOICE STATUS TRANSITIONS

```typescript
const ALLOWED_TRANSITIONS: Record<string, Record<string, string[]>> = {
  user:    {
    draft: ['pending_approval'],
  },
  manager: {
    pending_approval: ['approved', 'draft'],
  },
  admin:   {
    draft:            ['pending_approval'],
    pending_approval: ['approved', 'draft'],
    approved:         ['invoiced', 'pending_approval'],
  },
}

// Validate transition:
function canTransition(role: string, from: string, to: string): boolean {
  return ALLOWED_TRANSITIONS[role]?.[from]?.includes(to) ?? false
}

// Guard:
// 1. Check is_locked → 403 nếu locked
// 2. Check canTransition(role, currentStatus, toStatus)
// 3. Update status
// 4. Insert audit_log
// 5. Trigger fires automatically (PostgreSQL) if → 'invoiced'
```

---

## 4. IMPORT EXCEL VALIDATION

```typescript
// Validate order:
// 1. Parse Excel → rows[]
// 2. Extract SKU list
// 3. Batch query bom_products WHERE sku_jwmold IN (skus)
// 4. Build validSkus Set
// 5. For each row:
//    - Missing sku_jwmold → error
//    - SKU not in validSkus → error
//    - Otherwise → valid

// Empty row filter:
rows.filter(r => r.sku_jwmold?.trim())

// Partial import allowed:
// If valid.length > 0 AND errors.length > 0 → import valid, report errors
// If valid.length === 0 → return 422 with all errors
```

---

## 5. LOCKED INVOICE GUARD

```typescript
// ALWAYS check in API routes before any write:
async function guardLocked(invoiceId: string, db: SupabaseClient) {
  const { data } = await db
    .from('invoice_headers')
    .select('is_locked')
    .eq('id', invoiceId)
    .single()

  if (data?.is_locked) {
    throw new Error('Invoice is locked and cannot be modified')
    // Return 403 to client
  }
}

// Apply to:
// - PUT /api/invoices/[id]
// - POST/PUT/DELETE /api/invoices/[id]/items
// - POST/PUT/DELETE /api/invoices/[id]/items/[itemId]/gems
// - POST /api/invoices/[id]/status (bất kỳ transition nào)
```

---

## 6. GEM CALCULATED FIELDS — DO NOT COMPUTE IN CODE

```typescript
// GENERATED ALWAYS AS columns — đọc trực tiếp từ DB
// KHÔNG tính lại trong TypeScript:

// gem.weight_gr = weight_ct_after * 0.2          ← PostgreSQL computes
// gem.total_price = weight_ct_after * unit_price  ← PostgreSQL computes
// gem.total_setting_fee = qty_pcs * fee_per_pcs   ← PostgreSQL computes

// Khi cần sum:
const totalGemValue = gems.reduce((s, g) => s + (g.total_price ?? 0), 0)
// total_price đã đúng từ DB → không cần recalculate
```

---

## 7. METAL RATE DELETION GUARD

```typescript
// Trước khi DELETE daily_metal_rates:
const { count } = await db
  .from('invoice_headers')
  .select('*', { count: 'exact', head: true })
  .eq('metal_rate_id', rateId)

if (count > 0) {
  return NextResponse.json({
    success: false,
    message: `Đang được dùng bởi ${count} invoice`
  }, { status: 409 })
}
```

---

## 8. AUDIT LOG — MỌI STATUS TRANSITION

```typescript
// Sau khi update status thành công:
await db.from('audit_logs').insert({
  invoice_id:  invoiceId,
  from_status: currentStatus,
  to_status:   newStatus,
  changed_by:  userId,
  note:        reason || null,
})
```

---

## 9. BOM PRODUCTS — FEES DEFAULT VALUES

```typescript
// Khi tạo invoice item từ SKU:
// Copy fees từ bom_products sang invoice_items
const product = await db
  .from('bom_products')
  .select('*')
  .eq('sku_jwmold', skuJwmold)
  .single()

const itemDefaults = {
  description:  product.description,
  class:        product.class,
  sub_class:    product.sub_class,
  metal_type:   product.metal_type,
  labor_fee:    product.labor_fee,
  casting_fee:  product.casting_fee,
  design_fee:   product.design_fee,
  resin_fee:    product.resin_fee,
  misc_fee:     product.misc_fee,
}
// User có thể override sau đó
```

---

## 10. PRICING RULE — DEFAULT ACTIVE

```typescript
// Khi tạo invoice mới, load active pricing rule:
const { data: rule } = await db
  .from('pricing_rules')
  .select('*')
  .eq('is_active', true)
  .order('created_at', { ascending: false })
  .limit(1)
  .single()

// Fallback nếu không có rule active: user chọn thủ công
```

---

## 11. METAL RATE — DEFAULT TODAY

```typescript
// Khi tạo invoice mới, default rate = today hoặc latest:
const today = new Date().toISOString().slice(0, 10)

const { data: todayRate } = await db
  .from('daily_metal_rates')
  .select('*')
  .eq('rate_date', today)
  .maybeSingle()

const { data: latestRate } = await db
  .from('daily_metal_rates')
  .select('*')
  .order('rate_date', { ascending: false })
  .limit(1)
  .single()

const defaultRate = todayRate ?? latestRate
```

---

## 12. DISPLAY FORMAT RULES

```typescript
// USD prices → 2 decimal
const formatUSD = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v)

// Weights → 4 decimal
const formatWeight = (v: number) => v.toFixed(4)

// Metal rates → 4 decimal  
const formatRate = (v: number | null) => v ? `$${v.toFixed(4)}` : '—'

// Dates → YYYY-MM-DD
const formatDate = (d: string) => d.slice(0, 10)
```
