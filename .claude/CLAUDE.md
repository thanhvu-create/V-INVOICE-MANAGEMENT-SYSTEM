# CLAUDE.md — V-Invoice Project Brain

> **Cập nhật lần cuối:** 2026-05-23
> **Rules files:** xem `.claude/rules/` — đọc trước khi implement bất kỳ feature nào
> **Stack:** Next.js 14 (App Router) + Supabase (PostgreSQL) + Vercel
> **Mục tiêu:** Hệ thống quản lý invoice trang sức cho HP Jewelry

---

## 1. TỔNG QUAN DỰ ÁN

V-Invoice là hệ thống quản lý invoice cho trang sức, cho phép:
- Tạo invoice từ Excel (JM format) hoặc thủ công
- Workflow approval: Draft → Pending Approval → Approved → Invoiced (FROZEN)
- Tính giá tự động: gold weight × metal rate × casting loss → CIF → Tag → FR price
- Snapshot bất biến khi invoice → `invoiced` (PostgreSQL trigger)
- Realtime sync qua Supabase Realtime

---

## 2. KIẾN TRÚC TARGET

```
Browser
  └── Next.js 14 (App Router)
      ├── app/(auth)/login/page.tsx
      ├── app/(dashboard)/layout.tsx       ← DashboardShell
      ├── app/(dashboard)/page.tsx          ← Home / Dashboard
      ├── app/(dashboard)/invoices/
      │   ├── page.tsx                      ← Invoice list
      │   ├── new/page.tsx                  ← Create new (manual)
      │   └── [id]/
      │       ├── page.tsx                  ← Invoice detail (2 views)
      │       └── print/page.tsx            ← Print A4 landscape
      ├── app/(dashboard)/import/page.tsx   ← Import Excel
      └── app/(dashboard)/admin/
          ├── metal-rates/page.tsx
          ├── pricing-rules/page.tsx
          └── products/page.tsx

API Routes
      └── app/api/
          ├── auth/route.ts
          ├── invoices/route.ts            ← GET list + POST create
          ├── invoices/[id]/route.ts       ← GET + PATCH + DELETE
          ├── invoices/[id]/status/route.ts ← PATCH status transition
          ├── invoices/[id]/items/route.ts  ← CRUD line items
          ├── invoices/[id]/items/[itemId]/gems/route.ts ← CRUD gems
          ├── import/route.ts              ← POST Excel import
          ├── export/route.ts              ← GET Excel export
          ├── metal-rates/route.ts         ← CRUD daily rates
          ├── pricing-rules/route.ts       ← CRUD pricing rules
          └── products/route.ts            ← GET SKU catalog

Supabase PostgreSQL
  ├── bom_products          ← SKU catalog (read-only in invoices)
  ├── daily_metal_rates     ← Gold/platinum/silver rates per day
  ├── pricing_rules         ← CIF/Tag/FR multipliers + casting loss
  ├── invoice_headers       ← One row per invoice
  │   └── invoice_items     ← One row per SKU line
  │        └── item_gem_details  ← Gem rows (GENERATED cols)
  ├── invoice_snapshots     ← JSONB snapshot on → 'invoiced'
  └── audit_logs            ← Every status transition
```

---

## 3. DATABASE SCHEMA TÓM TẮT

### Tables & Relationships

```
invoice_headers (id, po_number, status, is_locked, metal_rate_id, pricing_rule_id, ...)
  └── invoice_items (id, invoice_id, line_no, sku_jwmold, qty_pcs, weights, fees, prices...)
       └── item_gem_details (id, invoice_item_id, gem_type, qty_pcs, weight_ct_after,
                             unit_price_per_ct, setting_fee_per_pcs,
                             [GENERATED] weight_gr, total_price, total_setting_fee)

bom_products (id, sku_jwmold, description, class, sub_class, metal_type, fees...)
daily_metal_rates (id, rate_date [UNIQUE], gold_24k, gold_18kw, gold_18ky, gold_14ky,
                   platinum, silver, palladium)
pricing_rules (id, name, cif_multiplier, tag_multiplier, fr_multiplier,
               casting_loss_pct, is_active)
```

### CRITICAL — GENERATED ALWAYS AS Columns

```typescript
// item_gem_details — NEVER compute in TypeScript:
// weight_gr         = weight_ct_after * 0.2       ← PostgreSQL computes
// total_price       = weight_ct_after * unit_price_per_ct
// total_setting_fee = qty_pcs * setting_fee_per_pcs

// CORRECT — always read from DB response:
const totalGemValue   = gems.reduce((s, g) => s + (g.total_price ?? 0), 0)
const totalSettingFee = gems.reduce((s, g) => s + (g.total_setting_fee ?? 0), 0)
const totalGemGr      = gems.reduce((s, g) => s + (g.weight_gr ?? 0), 0)
```

---

## 4. PRICING FORMULA (SERVER-SIDE)

```
weight_no_gem_gr = weight_total_gr - Σ(gem.weight_gr)
gold_value_usd   = weight_gold_actual_gr × metal_rate × (1 + casting_loss_pct/100)
hpusa            = gold_value_usd + Σgem.total_price + Σgem.total_setting_fee
                   + labor_fee + casting_fee + design_fee + resin_fee + misc_fee
cif_price        = hpusa × cif_multiplier
tag_price        = cif_price × tag_multiplier
fr_price         = cif_price × fr_multiplier
```

**Metal Rate Lookup:**
```typescript
const rateMap = {
  '18KW': row.gold_18kw, '18KY': row.gold_18ky, '14KY': row.gold_14ky,
  'PT950': row.platinum, 'PT': row.platinum, '24K': row.gold_24k,
  'AG': row.silver, 'PD': row.palladium
}
const rate = rateMap[metalType] ?? row.gold_24k ?? 0
```

---

## 5. STATUS WORKFLOW

```typescript
const ALLOWED_TRANSITIONS = {
  user:    { draft: ['pending_approval'] },
  manager: { pending_approval: ['approved', 'draft'] },
  admin:   {
    draft:            ['pending_approval'],
    pending_approval: ['approved', 'draft'],
    approved:         ['invoiced', 'pending_approval'],
  },
}

// is_locked guard: bất kỳ write nào → check is_locked → 403 nếu true
// Snapshot trigger: PostgreSQL trg_snapshot_invoice fires on → 'invoiced'
//   → sets snapshot_data JSONB + is_locked = true
```

### Status Badges

| Status | Color |
|--------|-------|
| draft | `--text-muted` (gray) |
| pending_approval | `--color-warning` (amber) |
| approved | `--color-info` (blue) |
| invoiced | `--color-success` (green) |

---

## 6. USER ROLES

| Role | Tạo/Edit Invoice | Approve | Mark Invoiced | Admin Pages |
|------|-----------------|---------|---------------|-------------|
| `user` | ✓ (own drafts) | ✗ | ✗ | ✗ |
| `manager` | ✓ (all) | ✓ | ✗ | ✗ |
| `admin` | ✓ (all) | ✓ | ✓ | ✓ |

**Column visibility (Review View):**

| Column | user | manager | admin |
|--------|------|---------|-------|
| Sell Price (hpusa) | ✗ | ✓ | ✓ |
| Disc Price | ✗ | ✓ | ✓ |
| After Disc | ✗ | ✓ | ✓ |

---

## 7. HAI VIEW CHO INVOICE DETAIL

### JM Form View (Flat Table)
- 15 cột trên 1 dòng/SKU
- SKU cell: background `#FEF3C7` (sticky khi scroll)
- Ba Sao (*): màu đỏ `#DC2626`
- Horizontal scroll + sticky 2 cột đầu trên mobile

### Detail View (Card + Gem Sub-rows)
- Mỗi SKU = 1 card
- Inline edit cho tất cả fields
- Gem table bên dưới mỗi card
- Supabase Realtime sync

---

## 8. IMPORT EXCEL (JM FORMAT)

**Column Mapping (từ Excel → invoice_items):**

| Excel Col | DB Column | Notes |
|-----------|-----------|-------|
| A | store | Cửa hàng |
| B | location_store | Vị trí |
| C | sku_jwmold | SKU — lookup bom_products |
| D | so_mo_code | SO/MO |
| E | vendor_model | Vendor model |
| F | description | Mô tả |
| G | qty_pcs | Số lượng |
| H | weight_total_gr | Tổng trọng lượng |
| I | weight_gold_actual_gr | Trọng lượng vàng thực |
| J | metal_type | Loại kim loại |
| K | class | Phân loại |
| L | sub_class | Phân loại con |

**Validation:**
- SKU phải tồn tại trong `bom_products`
- Fees auto-copy từ `bom_products` khi import
- Invalid rows → hiện error table (Row, SKU, Lỗi)

---

## 9. SUPABASE CLIENTS

```typescript
// lib/supabase/server.ts
// ANON key (auth-aware — Server Components)
export async function createClient() { ... }

// SERVICE ROLE (bypass RLS — API Routes only)
export function createServiceClient() { ... }

// Rule: API Routes luôn dùng createServiceClient()
```

---

## 10. DESIGN SYSTEM

**Palette (CSS Variables):**
```css
--bg-base:    #F0EBE4;   /* Cream nền chính */
--bg-surface: #FAFAF7;   /* Card, modal */
--bg-muted:   #DDD8CF;
--bg-hover:   #E8E3DC;
--text-primary:   #1A1814;
--text-secondary: #6B645C;
--border-strong: #1A1814;
--border-base:   #C8C3BB;
--color-success: #4A7C59;
--color-danger:  #9B4040;
--color-warning: #8C7340;
```

**Fonts:**
```css
--font-heading: 'Cormorant Garamond', Georgia, serif;
--font-body:    'Jost', 'DM Sans', Arial, sans-serif;
--font-mono:    'JetBrains Mono', Consolas, monospace;
```

**Rules:**
- Button: `border-radius: 0` (VUÔNG)
- Avatar: ngoại lệ tròn duy nhất
- Không dùng Tailwind cho colors — chỉ CSS variables
- FA6 cho icons

---

## 11. RÀNG BUỘC BẮT BUỘC

```
✓ is_locked = true → 403 trên MỌI write (check trước mọi mutation)
✓ snapshot_data chỉ được write bởi PostgreSQL trigger — KHÔNG bởi application code
✓ GENERATED columns (weight_gr, total_price, total_setting_fee) — KHÔNG compute trong TS
✓ status transitions validated bởi ALLOWED_TRANSITIONS map — server-side
✓ Delete daily_metal_rates → check FK invoice_headers.metal_rate_id → 409 nếu có ref
✓ Chỉ 1 pricing_rule is_active = true tại một thời điểm
✓ Recalculate chain chạy server-side sau mỗi field change
✓ Print: data URI (không Blob URL) vì print popup là window mới
```

---

## 12. API RESPONSE FORMAT

```typescript
// Success:
{ success: true, data: any }
// Error:
{ success: false, message: string }
```

---

## 13. VERCEL DEPLOY

```bash
# Environment Variables
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # Server-only!
NEXT_PUBLIC_APP_NAME=V-Invoice
```

---

## 14. THỨ TỰ TRIỂN KHAI (SPRINT)

```
Sprint 1 — Foundation
  1. Next.js 14 setup (App Router + TypeScript)
  2. Supabase schema + seed data
  3. Design system CSS (CSS variables + fonts)
  4. Auth (login/logout/session)
  5. Dashboard layout (topbar + nav)

Sprint 2 — Invoice Core
  6. Invoice list page (table + filter + pagination)
  7. Invoice detail page (JM Form View)
  8. Invoice detail page (Detail View + gems)
  9. Status workflow bar + transitions

Sprint 3 — Data Entry
  10. Import Excel page
  11. Inline edit (Detail View)
  12. Pricing recalculation chain
  13. Supabase Realtime sync

Sprint 4 — Admin
  14. Metal Rates CRUD page
  15. Pricing Rules CRUD page
  16. Products (SKU catalog) page

Sprint 5 — Polish
  17. Export Excel
  18. Print page (A4 landscape)
  19. Responsive (mobile + tablet)
  20. Deploy Vercel + production Supabase
```
