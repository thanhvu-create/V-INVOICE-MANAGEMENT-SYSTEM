# System Audit & Review Plan — V-Invoice
> **Ngày audit:** 2026-06-03
> **Scope:** Toàn bộ DB schema + API routes + components + pricing logic
> **Kết quả:** 3 bugs thực sự + 1 redundancy + 1 missing data + 3 improvements

---

## 1. TỔNG KẾT — TRẠNG THÁI HỆ THỐNG

| Area | Status | Ghi chú |
|------|--------|---------|
| DB schema | ✅ Đúng | 11 tables; triggers OK |
| Pricing formula | ✅ Đúng | Khớp Excel 100% |
| Gold Rate Calculator | ✅ Đã có | Metal rates page dùng `computeKaratPrices` |
| Gem price catalog | ✅ Đã có | `gem_price_catalog.sql` seeded đầy đủ |
| GemModal NVL lookup | ✅ Đã có | `/api/gem-catalog` + auto-fill |
| ct_before auto-copy | ✅ Đã có | GemModal `handleWeightBefore` |
| Status workflow | ✅ Đúng | Lock guard + edit guard ở 7 routes |
| mk_store_markup | ✅ Đúng | Auto sell_price từ CIF tiers |
| **PATCH metal-rates/[id]** | ❌ Bug | EDITABLE list thiếu new fields |
| **GemModal per_pcs** | ❌ Bug | weight_ct_after = qty_pcs → weight_gr sai |
| **BQT gem type** | ❌ Missing | Chưa seed vào gem_price_catalog |
| `bom_products.casting_loss_pct` | ⚠️ Redundant | Không dùng trong pricing chain |
| `weight_gold_actual_gr` auto-sync | ⚠️ Improvement | Nên sync = weight_no_gem khi recalc |

---

## 2. BUG 1 — PATCH `/api/metal-rates/[id]` không lưu new fields [CRITICAL]

### Vấn đề

```typescript
// app/api/metal-rates/[id]/route.ts — EDITABLE list hiện tại:
const EDITABLE = ['rate_date', 'gold_24k', 'gold_18kw', 'gold_18ky', 'gold_14ky',
                  'platinum', 'silver', 'palladium']

// Metal rates page gửi thêm:
const body = {
  spot_24k_oz, spot_pt_oz, spot_ag_oz, spot_pd_oz,
  oz_per_gram, loss_gold_pct, loss_pt_pct,
  karat_prices,          // ← JSONB tất cả karat rates
  gold_24k, gold_18kw, ... // old compat columns
}
// → karat_prices KHÔNG được save vào DB khi edit!
```

### Tác động
- Khi **Add Rate** (POST): cũng chỉ lưu old columns vì POST route cũng không có new fields
- Khi **Edit Rate** (PATCH): `karat_prices`, `spot_*`, `loss_*` bị bỏ qua
- `pricing.ts` fallback về old columns → vẫn tính được nhưng không có 22K/15K/10K/23K
- `karat_prices` JSONB trong DB luôn là `null` → calculator UI đúng nhưng data sai

### Fix cần làm

**File 1: `app/api/metal-rates/[id]/route.ts`**
```typescript
// Thay EDITABLE:
const EDITABLE = [
  'rate_date',
  // Old columns (backward compat)
  'gold_24k', 'gold_18kw', 'gold_18ky', 'gold_14ky',
  'platinum', 'silver', 'palladium',
  // New spot + karat fields
  'spot_24k_oz', 'spot_pt_oz', 'spot_ag_oz', 'spot_pd_oz',
  'oz_per_gram', 'loss_gold_pct', 'loss_pt_pct',
  'karat_prices',
]
```

**File 2: `app/api/metal-rates/route.ts` — POST handler**
```typescript
// Thay destructure:
const { rate_date, gold_24k, gold_18kw, gold_18ky, gold_14ky, platinum, silver, palladium,
        spot_24k_oz, spot_pt_oz, spot_ag_oz, spot_pd_oz,
        oz_per_gram, loss_gold_pct, loss_pt_pct, karat_prices } = body

await db.from('daily_metal_rates').insert({
  rate_date,
  gold_24k, gold_18kw, gold_18ky, gold_14ky, platinum, silver, palladium,
  spot_24k_oz, spot_pt_oz, spot_ag_oz, spot_pd_oz,
  oz_per_gram, loss_gold_pct, loss_pt_pct, karat_prices,
})
```

---

## 3. BUG 2 — GemModal per_pcs: `weight_ct_after = qty_pcs` sai [CRITICAL]

### Vấn đề

```typescript
// components/invoice/GemModal.tsx — handleSave():
weight_ct_after: isPcs
  ? (parseInt(form.qty_pcs) || 1)  // ← sets ct_after = qty for per_pcs
  : (parseNum(form.weight_ct_after) ?? 0),
```

**Kết quả sai cho XC/PL gems:**
```
qty=3, mk_price=$15, isPcs=true:
  weight_ct_after = 3
  GENERATED weight_gr = 3 × 0.2 = 0.6 gr  ← SAI: XC không có gem weight!
  GENERATED total_price = 3 × $15 = $45    ← SAI: T.Giá phải = 0 theo Excel

  → weight_no_gem_gr bị trừ 0.6gr sai
  → HPUSA tăng $45 sai (XC không được bill via T.Giá)
```

**Thực tế Excel:**
```
XC1 9.5mm, qty=1:
  ct_before = blank → ct_after = blank
  weight_gr = 0                    ✓
  T.Giá Xoàn = 0                  ✓ (crystal không bill qua T.Giá)
  T.Phí nhận hột = fee × qty      ✓ (chỉ setting fee mới bill)
```

### Fix cần làm

**File: `components/invoice/GemModal.tsx` — hàm `handleSave`:**
```typescript
// Thay:
weight_ct_after: isPcs ? (parseInt(form.qty_pcs) || 1) : (parseNum(form.weight_ct_after) ?? 0),

// Bằng:
weight_ct_after: isPcs ? 0 : (parseNum(form.weight_ct_after) ?? 0),
// Giải thích: per_pcs gems (XC/PL) không có carat weight → weight_gr = 0 × 0.2 = 0
// T.Giá = 0 × mk_price = 0 (correct — XC không bill qua T.Giá channel)
// T.Phí = qty × setting_fee_per_pcs (người dùng nhập thủ công — chính xác)
```

**Cũng fix lookup khi chọn catalog:**
```typescript
// Trong lookupGemCode():
// Thay:
weight_ct_after: isPcs ? v.qty_pcs : v.weight_ct_after,

// Bằng:
weight_ct_after: isPcs ? '0' : v.weight_ct_after,
```

**UI: Thêm note cho per_pcs gems:**
```tsx
{isPcs && (
  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-info)', marginTop: 4 }}>
    <i className="fa-solid fa-circle-info" style={{ marginRight: 4 }} />
    XC/PL: T.Giá = $0 · Chỉ T.Phí nhận hột = Qty × Setting Fee
  </div>
)}
```

---

## 4. BUG 3 — `gem_price_catalog` thiếu BQT type [MINOR]

### Vấn đề
NVL-10 sheet có `BQT1` loại đá riêng biệt (không phải BG, MQ, hay PR) với `mk_price = $2,600/ct`. Chưa được seed.

### Fix
**File: `supabase/gem_price_catalog.sql`** — thêm:
```sql
-- ── BQT — Baguette Tapered ────────────────────────────────────────
('BQT1', 'BQT', 'tapered', 2000.00, 2600.00, 'per_ct'),
```

Chạy trực tiếp trên Supabase SQL Editor:
```sql
INSERT INTO gem_price_catalog (gem_code, gem_type, size_range, cost_price, mk_price, price_unit)
VALUES ('BQT1', 'BQT', 'tapered', 2000.00, 2600.00, 'per_ct')
ON CONFLICT (gem_code) DO NOTHING;
```

---

## 5. REDUNDANT — `bom_products.casting_loss_pct` không dùng [CLEANUP]

### Vấn đề
```sql
-- migration.sql:
CREATE TABLE bom_products (
  ...
  casting_loss_pct NUMERIC(5,2) DEFAULT 5,  -- ← field này
  ...
)
```

Field này **không bao giờ được đọc** trong pricing chain:
- `recalcItem()` dùng `rule.casting_loss_pct` (từ pricing_rules, hiện = 0)
- Casting loss thực sự được baked vào derived rates (metal rates calculator)
- Không có code nào đọc `bom_products.casting_loss_pct` để tính giá

### Fix
- **Không xóa column** (không phá DB)
- **Ẩn khỏi Products edit UI** nếu có (không hiển thị cho user)
- Ghi note: field này legacy, không dùng trong pricing

---

## 6. IMPROVEMENT — `weight_gold_actual_gr` nên sync với `weight_no_gem_gr`

### Hiện tại
`recalcItem()` tính `weight_no_gem_gr` nhưng KHÔNG update `weight_gold_actual_gr`. Kết quả:
```
gold_value = weight_gold_actual_gr (stale, user-entered) × rate
```

### Thực tế Excel
```
K (gold_actual) = I (total) - Σ gem.weight_gr = J (no_gem)
→ gold_actual TỰ TÍNH, không user nhập riêng
```

### Fix đề xuất
```typescript
// lib/formulas/pricing.ts — recalcItem():
export function recalcItem(...): Partial<InvoiceItem> {
  const weightNoGem = calcWeightNoGem(item.weight_total_gr ?? 0, gems)
  
  // Sync weight_gold_actual_gr = weight_no_gem_gr (Excel formula K = J)
  // Override: nếu item có weight_gold_actual_gr được user set khác → vẫn dùng giá user
  // Simplest: luôn sync (nếu cần override, user sẽ PATCH lại sau recalc)
  const goldWeightToUse = weightNoGem  // sync từ no_gem
  
  const goldValue = calcGoldValue(goldWeightToUse, item.metal_type ?? '', rate, 0)
  ...
  
  return {
    weight_no_gem_gr:      weightNoGem,
    weight_gold_actual_gr: weightNoGem,  // ← THÊM: sync với no_gem
    gold_value_usd:        goldValue,
    ...
  }
}
```

**Tác động:**
- Sau khi add gem, `weight_gold_actual_gr` tự cập nhật = `total - gem_weight`
- User không cần nhập `gold weight` riêng (trùng với `total - gem`)
- AddItemModal vẫn có field `weight_gold_actual_gr` để set initial value khi chưa có gems

**Risk:** Nếu có case business cần `gold_actual ≠ no_gem` (ví dụ sản phẩm có non-gold, non-gem material), fix này sẽ override giá trị user nhập. Tuy nhiên trong thực tế invoice CH1, tất cả 39 items đều `gold_actual = no_gem`. Recommend: apply fix.

---

## 7. KIỂM TRA LOGIC HIỆN ĐÃ ĐÚNG (không cần sửa)

### 7a. Pricing chain ✅
```
gold_value = weight_gold_actual × rate[metal_type]     // uses karat_prices JSONB nếu có
hpusa = gold_value + Σ total_price + Σ total_setting_fee + fees
cif   = hpusa × cif_multiplier
tag   = cif  × tag_multiplier
fr    = cif  × fr_multiplier
sell  = cif  × mk_store_markup[tier][price_list_type]   // auto nếu price_list_type set
```

### 7b. Gem GENERATED columns ✅
```
weight_gr         = weight_ct_after × 0.2     // PostgreSQL GENERATED
total_price       = weight_ct_after × unit_price_per_ct
total_setting_fee = qty_pcs × setting_fee_per_pcs
```
→ Sau Bug 2 fix: per_pcs có ct_after=0 → weight_gr=0, total_price=0 ✅

### 7c. Gold rate derivation ✅
```
18K = spot_24k × (18/24) × 1.06 / 31.1035    // loss 6%
24K = spot_24k / 31.1035                       // NO loss
PT  = spot_pt  × 1.17 / 31.1035               // loss 17%
```
Hàm `computeKaratPrices()` trong `lib/gold-fetch.ts` đúng 100%.

### 7d. Status transitions ✅
```
user:    draft → pending_approval
manager: pending_approval → approved | draft
admin:   + approved → invoiced | pending_approval
```
`checkEditPermission()` wire vào 7 write routes.

### 7e. mk_store_markup auto sell_price ✅
```
sell = cif × markups[price_list_type]   // tiered theo CIF range
```
`recalcItem()` auto-updates sell_price khi `price_list_type` set.

### 7f. Snapshot trigger ✅
```sql
trg_snapshot_invoice: BEFORE UPDATE
  IF new.status = 'invoiced' THEN
    SET is_locked = true, snapshot_data = JSONB(...)
```

### 7g. GemModal catalog lookup ✅
- `/api/gem-catalog?code=RD+B1` → trả mk_price, price_unit
- Auto-fill unit_price_per_ct, gem_type, price_unit
- ct_before auto-copy to ct_after ✅

### 7h. Import Excel ✅
- Batch insert với BOM fallback fees + image_url
- recalcItem sau insert
- Lock guard + edit guard

### 7i. Export Excel ✅
- Master-Detail với merge cells (aoa_to_sheet + ws['!merges'])
- Role-filtered columns
- GENERATED cols đọc từ DB

### 7j. Print A4 ✅
- Logo + signature block + tfoot totals
- Role-filtered price columns

---

## 8. THỨ TỰ IMPLEMENT

### Ngay bây giờ — Bugs (2 files):
```
1. Fix PATCH /api/metal-rates/[id] + POST — thêm new fields vào EDITABLE/insert
2. Fix GemModal per_pcs weight_ct_after = 0
3. Seed BQT1 vào gem_price_catalog (Supabase SQL Editor)
```

### Tuần này — Improvements:
```
4. recalcItem: sync weight_gold_actual_gr = weight_no_gem_gr
5. AddItemModal: ẩn weight_gold_actual_gr hoặc show computed hint
```

### Cleanup (low priority):
```
6. Bỏ casting_loss_pct khỏi Products edit UI nếu có
7. Update CLAUDE.md: bỏ mention invoice_snapshots table (snapshot là inline trong headers)
```

---

## 9. FILES CẦN SỬA

| File | Thay đổi | Bug # |
|------|----------|-------|
| `app/api/metal-rates/[id]/route.ts` | EDITABLE + new fields | Bug 1 |
| `app/api/metal-rates/route.ts` | POST insert new fields | Bug 1 |
| `components/invoice/GemModal.tsx` | per_pcs ct_after = 0 | Bug 2 |
| `supabase/gem_price_catalog.sql` | thêm BQT1 | Bug 3 |
| `lib/formulas/pricing.ts` | sync weight_gold_actual | Improvement |

---

## 10. KHÔNG CẦN SỬA (đã đúng)

```
✓ lib/gold-fetch.ts — computeKaratPrices, getKaratRate
✓ lib/formulas/pricing.ts — calcGoldValue, calcHPUSA, calcPrices, calcWeightNoGem
✓ lib/auth/editGuard.ts — checkEditPermission
✓ app/api/invoices/[id]/items/route.ts — POST add item
✓ app/api/invoices/[id]/items/[itemId]/route.ts — PATCH/DELETE
✓ app/api/invoices/[id]/items/[itemId]/gems/route.ts — GET/POST
✓ app/api/invoices/[id]/items/[itemId]/gems/[gemId]/route.ts — PATCH/DELETE
✓ app/api/import/route.ts — Excel import
✓ app/api/admin/store-markup/route.ts — markup tiers
✓ supabase/migration.sql — schema đúng
✓ supabase/gem_price_catalog.sql — seed đúng (trừ BQT1)
✓ supabase/nvl_store_markup.sql — markup tiers đúng
✓ supabase/add_metal_rate_spot.sql — karat_prices migration đúng
✓ components/invoice/GemModal.tsx — mọi thứ trừ per_pcs bug
✓ components/invoice/AddItemModal.tsx — complete
✓ app/(dashboard)/admin/metal-rates/page.tsx — UI đúng
```
