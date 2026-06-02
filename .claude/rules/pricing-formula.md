# Pricing Formula — Gold Value, HPUSA, CIF/Tag/FR

> **Phạm vi:** Recalculate chain chạy server-side sau mỗi field change
> **Critical:** GENERATED columns trong item_gem_details — KHÔNG compute trong TypeScript

---

## 1. RECALCULATE CHAIN (Thứ tự bắt buộc)

```
Step 1: weight_no_gem_gr = weight_total_gr - Σ(gem.weight_gr)
         ↑ gem.weight_gr là GENERATED col = weight_ct_after × 0.2

Step 2: gold_value_usd = weight_gold_actual_gr × metal_rate × (1 + casting_loss_pct/100)
         ↑ metal_rate = daily_metal_rates[metal_type_key]
         ↑ casting_loss_pct từ pricing_rules (VD: 5%)
         ↑ [THAM KHẢO] §3: "Tiền vàng = vàng thực tế × giá theo ngày × (1 + % Hao hụt đúc)"

Step 3: hpusa = gold_value_usd
              + Σgem.total_price          ← Tổng T.Giá Xoàn (GENERATED)
              + Σgem.total_setting_fee    ← Tổng T.Phí nhận hột (GENERATED)
              + labor_fee + casting_fee + design_fee + resin_fee + misc_fee
         ↑ gem.total_price, gem.total_setting_fee là GENERATED cols — KHÔNG compute trong TS

Step 4: cif_price = hpusa × cif_multiplier      (Hệ số A)

Step 5: tag_price = cif_price × tag_multiplier  (Hệ số B)

Step 6: fr_price  = cif_price × fr_multiplier   (Hệ số C)
```

**Naming convention — "FB" vs "FR":**
> [THAM KHẢO] §3 dùng "HP for FB price" (Hệ số C). Hệ thống dùng tên **`fr_price`** (FR = Free Retail).
> Đây là cùng 1 giá trị — KHÔNG đổi tên column DB.

**Sub-total per item ([THAM KHẢO] §3-B):**
Trước khi tính HPUSA, hệ thống phải có thể hiển thị sub-total của từng sản phẩm:
```
Sub-total gems   = Σgem.total_price        (Tổng T.Giá Xoàn)
Sub-total setting = Σgem.total_setting_fee  (Tổng T.Phí nhận hột)
```
→ Xem `invoice-detail-inline-edit.md` §10 cho UI spec của sub-total row.

---

## 2. METAL RATE LOOKUP

```typescript
// daily_metal_rates row:
// gold_24k, gold_18kw, gold_18ky, gold_14ky, platinum, silver, palladium

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
  return Number(row.gold_24k) ?? 0  // fallback
}
```

---

## 3. GOLD VALUE CALCULATION

```typescript
// gold_value_usd:
function calcGoldValue(
  weight_gold_actual_gr: number,
  metal_rate: number,        // từ daily_metal_rates theo metal_type
  casting_loss_pct: number   // từ pricing_rules (VD: 5.0)
): number {
  return weight_gold_actual_gr * metal_rate * (1 + casting_loss_pct / 100)
}

// VD: weight = 3.5g, rate = 60.50 USD/g (18KW), casting_loss = 5%
// → gold_value_usd = 3.5 × 60.50 × 1.05 = 222.5775
```

---

## 4. GEM CALCULATIONS — PostgreSQL ONLY

```sql
-- GENERATED ALWAYS AS (STORED) — không bao giờ write/compute từ app:
weight_gr         NUMERIC GENERATED ALWAYS AS (weight_ct_after * 0.2) STORED
total_price       NUMERIC GENERATED ALWAYS AS (weight_ct_after * unit_price_per_ct) STORED
total_setting_fee NUMERIC GENERATED ALWAYS AS (qty_pcs * setting_fee_per_pcs) STORED
```

```typescript
// ✅ CORRECT — read from DB response:
const gems = await db.from('item_gem_details').select('*').in('invoice_item_id', itemIds)
const totalGemValue   = gems.reduce((s, g) => s + (g.total_price ?? 0), 0)
const totalSettingFee = gems.reduce((s, g) => s + (g.total_setting_fee ?? 0), 0)
const totalGemWeightGr = gems.reduce((s, g) => s + (g.weight_gr ?? 0), 0)

// ❌ WRONG — NEVER do this:
// const weight_gr = gem.weight_ct_after * 0.2   ← PostgreSQL handles this
// const total_price = gem.weight_ct_after * gem.unit_price_per_ct
```

---

## 5. HPUSA CALCULATION

```typescript
function calcHPUSA(
  goldValueUSD: number,
  gems: GemDetail[],        // đọc từ DB (GENERATED cols đã có sẵn)
  fees: {
    labor_fee:   number
    casting_fee: number
    design_fee:  number
    resin_fee:   number
    misc_fee:    number
  }
): number {
  const totalGemPrice   = gems.reduce((s, g) => s + (g.total_price ?? 0), 0)
  const totalSettingFee = gems.reduce((s, g) => s + (g.total_setting_fee ?? 0), 0)
  
  return goldValueUSD
    + totalGemPrice
    + totalSettingFee
    + (fees.labor_fee   ?? 0)
    + (fees.casting_fee ?? 0)
    + (fees.design_fee  ?? 0)
    + (fees.resin_fee   ?? 0)
    + (fees.misc_fee    ?? 0)
}
```

---

## 6. CIF / TAG / FR PRICES

```typescript
function calcPrices(
  hpusa: number,
  rule: PricingRule
): { cif_price: number; tag_price: number; fr_price: number } {
  const cif_price = hpusa * rule.cif_multiplier
  const tag_price = cif_price * rule.tag_multiplier
  const fr_price  = cif_price * rule.fr_multiplier
  return { cif_price, tag_price, fr_price }
}
```

---

## 7. WEIGHT_NO_GEM CALCULATION

```typescript
function calcWeightNoGem(
  weight_total_gr: number,
  gems: GemDetail[]   // weight_gr là GENERATED col từ DB
): number {
  const totalGemGr = gems.reduce((s, g) => s + (g.weight_gr ?? 0), 0)
  return (weight_total_gr ?? 0) - totalGemGr
}
```

---

## 8. FULL RECALCULATE FUNCTION (Server-side)

```typescript
// Gọi sau mỗi field change (item hoặc gem)
async function recalculateItem(
  db: SupabaseClient,
  itemId: string,
  metalRate: DailyMetalRate,
  rule: PricingRule
): Promise<void> {
  // 1. Load item + gems
  const { data: item } = await db.from('invoice_items').select('*').eq('id', itemId).single()
  const { data: gems } = await db.from('item_gem_details').select('*').eq('invoice_item_id', itemId)
  
  // 2. Calc weight_no_gem (gems.weight_gr từ GENERATED col)
  const totalGemGr = (gems ?? []).reduce((s, g) => s + (g.weight_gr ?? 0), 0)
  const weight_no_gem_gr = (item.weight_total_gr ?? 0) - totalGemGr
  
  // 3. Calc gold value
  const rate = getMetalRate(item.metal_type ?? '', metalRate)
  const gold_value_usd = calcGoldValue(
    item.weight_gold_actual_gr ?? 0,
    rate,
    rule.casting_loss_pct
  )
  
  // 4. Calc HPUSA
  const hpusa = calcHPUSA(gold_value_usd, gems ?? [], {
    labor_fee:   item.labor_fee   ?? 0,
    casting_fee: item.casting_fee ?? 0,
    design_fee:  item.design_fee  ?? 0,
    resin_fee:   item.resin_fee   ?? 0,
    misc_fee:    item.misc_fee    ?? 0,
  })
  
  // 5. Calc CIF/Tag/FR
  const { cif_price, tag_price, fr_price } = calcPrices(hpusa, rule)
  
  // 6. Update item
  await db.from('invoice_items').update({
    weight_no_gem_gr,
    gold_value_usd,
    hpusa,
    cif_price,
    tag_price,
    fr_price,
    updated_at: new Date().toISOString(),
  }).eq('id', itemId)
}
```

---

## 9. TRIGGER CONDITIONS

Recalculate chạy khi:
- User thay đổi `weight_total_gr`, `weight_gold_actual_gr`, `metal_type`
- User thay đổi bất kỳ fee nào (`labor_fee`, `casting_fee`, `design_fee`, `resin_fee`, `misc_fee`)
- Gem được thêm/sửa/xóa (`weight_ct_after`, `unit_price_per_ct`, `qty_pcs`, `setting_fee_per_pcs`)
- Metal rate hoặc pricing rule thay đổi (bulk recalc tất cả items)

---

## 10. PRICING RULE LOOKUP

```typescript
// Active rule (default cho invoice mới):
const { data: rule } = await db
  .from('pricing_rules')
  .select('*')
  .eq('is_active', true)
  .order('created_at', { ascending: false })
  .limit(1)
  .single()

// Rule gắn với invoice qua pricing_rule_id (snapshot tại thời điểm tạo)
// Khi recalc: dùng rule từ invoice_headers.pricing_rule_id, không phải active rule
const { data: rule } = await db
  .from('pricing_rules')
  .select('*')
  .eq('id', invoice.pricing_rule_id)
  .single()
```

---

## 11. METAL RATE LOOKUP

```typescript
// Rate gắn với invoice qua metal_rate_id
const { data: rate } = await db
  .from('daily_metal_rates')
  .select('*')
  .eq('id', invoice.metal_rate_id)
  .single()

// Default rate cho invoice mới:
const today = new Date().toISOString().slice(0, 10)
const { data: todayRate } = await db
  .from('daily_metal_rates')
  .select('*').eq('rate_date', today).maybeSingle()

const { data: latestRate } = await db
  .from('daily_metal_rates')
  .select('*').order('rate_date', { ascending: false }).limit(1).single()

const defaultRate = todayRate ?? latestRate
```

---

## 12. DISPLAY FORMATS

```typescript
const formatUSD    = (v: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2
  }).format(v)

const formatWeight = (v: number | null | undefined) =>
  v != null ? v.toFixed(4) : '—'

const formatRate   = (v: number | null | undefined) =>
  v != null ? `$${v.toFixed(4)}` : '—'

const formatDate   = (d: string) => d?.slice(0, 10) ?? '—'

// VD:
// formatUSD(1234.56)    → "$1,234.56"
// formatWeight(3.5)     → "3.5000"
// formatRate(60.5)      → "$60.5000"
// formatDate('2026-05-20T09:00:00Z') → "2026-05-20"
```

---

## 13. BULK RECALCULATE (khi đổi rate/rule)

```typescript
// Khi invoice.metal_rate_id hoặc pricing_rule_id thay đổi:
// → Recalculate tất cả items của invoice đó

async function bulkRecalculate(
  db: SupabaseClient,
  invoiceId: string,
  metalRate: DailyMetalRate,
  rule: PricingRule
): Promise<void> {
  const { data: items } = await db
    .from('invoice_items')
    .select('id')
    .eq('invoice_id', invoiceId)
  
  for (const item of items ?? []) {
    await recalculateItem(db, item.id, metalRate, rule)
  }
}
```

---

## 14. PRICING VALIDATION

```typescript
// Validate trước khi save:
// weight_gold_actual_gr ≤ weight_total_gr (vàng không thể nặng hơn tổng)
// Tất cả fee ≥ 0
// metal_type phải trong: ['18KW','18KY','14KY','PT950','PT','24K','AG','PD']
// qty_pcs ≥ 1

// Không validate hpusa, cif_price, tag_price, fr_price — chúng luôn được tính lại
```
