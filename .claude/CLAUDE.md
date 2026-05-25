# CLAUDE.md — V-Invoice Project Brain

> **Cập nhật lần cuối:** 2026-05-25
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
      ├── app/(dashboard)/layout.tsx            ← DashboardShell (Topbar + Nav)
      ├── app/(dashboard)/page.tsx              ← redirect → /dashboard
      ├── app/(dashboard)/dashboard/page.tsx    ← Dashboard: stats + recent invoices
      ├── app/(dashboard)/invoices/
      │   ├── page.tsx                          ← Invoice list (filter + pagination)
      │   ├── new/page.tsx                      ← Create new invoice (manual)
      │   └── [id]/
      │       ├── page.tsx                      ← Invoice detail (2 views: JM + Detail)
      │       └── print/page.tsx                ← Print A4 landscape
      ├── app/(dashboard)/import/page.tsx       ← Import Excel
      └── app/(dashboard)/admin/
          ├── metal-rates/page.tsx
          ├── pricing-rules/page.tsx
          ├── products/page.tsx
          └── users/page.tsx                    ← User management (admin only)

API Routes
      └── app/api/
          ├── auth/login/route.ts               ← POST login
          ├── auth/me/route.ts                  ← GET current user
          ├── auth/logout/route.ts              ← POST logout
          ├── dashboard/stats/route.ts          ← GET stats (RPC)
          ├── dashboard/recent/route.ts         ← GET 5 recent invoices
          ├── invoices/route.ts                 ← GET list (RPC) + POST create
          ├── invoices/[id]/route.ts            ← GET + PATCH + DELETE
          ├── invoices/[id]/status/route.ts     ← POST status transition
          ├── invoices/[id]/items/route.ts      ← GET + POST line items
          ├── invoices/[id]/items/[itemId]/route.ts       ← PUT + DELETE item
          ├── invoices/[id]/items/[itemId]/gems/route.ts  ← CRUD gems
          ├── import/route.ts                   ← POST Excel import
          ├── export/route.ts                   ← GET Excel export
          ├── metal-rates/route.ts              ← GET + POST
          ├── metal-rates/[id]/route.ts         ← PATCH + DELETE (with FK guard)
          ├── pricing-rules/route.ts            ← CRUD
          ├── products/route.ts                 ← GET SKU catalog
          └── users/route.ts                    ← GET + POST (admin only)

Supabase PostgreSQL
  ├── app_users             ← Role + profile (links to Supabase Auth)
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
app_users (id, auth_id, email, full_name, role, is_active)

invoice_headers (id, invoice_no [GENERATED], po_number, customer_name, invoice_date,
                 status, is_locked, metal_rate_id, pricing_rule_id, ...)
  └── invoice_items (id, invoice_id, line_no, sku_jwmold, bom_product_id,
                     qty_pcs, weights, fees, prices, sell_price,
                     ship_date, tracking_no, vinvoice_no...)
       └── item_gem_details (id, invoice_item_id, gem_type, shape, size_mm,
                             qty_pcs, weight_ct_before, weight_ct_after,
                             unit_price_per_ct, setting_type, setting_fee_per_pcs,
                             [GENERATED] weight_gr, total_price, total_setting_fee)

bom_products (id, sku_jwmold, description, class, sub_class, metal_type,
              weight_gr, image_url, is_active, fees...)
daily_metal_rates (id, rate_date [UNIQUE], gold_24k, gold_18kw, gold_18ky,
                   gold_14ky, platinum, silver, palladium, is_active)
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
  // viewer: không có transitions
}

// is_locked guard: bất kỳ write nào → check is_locked → 403 nếu true
// Snapshot trigger: PostgreSQL trg_snapshot_invoice fires on → 'invoiced'
//   → INSERT invoice_snapshots + SET is_locked = true + snapshot_at = now()
// Status API endpoint: POST /api/invoices/[id]/status (không phải PATCH)
```

### Status Badges

| Status | Color |
|--------|-------|
| draft | `--text-muted` (gray) |
| pending_approval | `--color-warning` (amber) |
| approved | `--color-success` (green) |
| invoiced | `--text-primary` bg / `--text-inverse` text (black filled) |

---

## 6. USER ROLES

4 roles: `admin | manager | user | viewer`

| Role | Tạo/Edit Invoice | Approve | Mark Invoiced | Admin Pages | Import |
|------|-----------------|---------|---------------|-------------|--------|
| `admin` | ✓ (all) | ✓ | ✓ | ✓ | ✓ |
| `manager` | ✓ (all) | ✓ | ✓ | Metal Rates only | ✓ |
| `user` | ✓ (own drafts) | ✗ | ✗ | ✗ | ✓ |
| `viewer` | ✗ (read only) | ✗ | ✗ | ✗ | ✗ |

**Column visibility — Invoice Detail & Export:**

| Column | admin | manager | user | viewer |
|--------|-------|---------|------|--------|
| `gold_value_usd` | ✓ | ✓ | ✓ | ✗ |
| `hpusa` | ✓ | ✓ | ✓ | ✗ |
| `cif_price` | ✓ | ✓ | ✓ | ✗ |
| `sell_price` | ✓ | ✓ | ✓ | ✓ |
| `tag_price` | ✓ | ✓ | ✗ | ✗ |
| `fr_price` | ✓ | ✓ | ✗ | ✗ |
| `discount_pct` | ✓ | ✓ | ✗ | ✗ |

**Role stored in:** `app_users.role` (custom table) — KHÔNG lưu trong JWT.
**canDo()** helper (UserContext): map action strings → role permissions.

### Navigation theo role

| Route | admin | manager | user | viewer |
|-------|-------|---------|------|--------|
| /dashboard | ✓ | ✓ | ✓ | ✓ |
| /invoices | ✓ | ✓ | ✓ | ✓ |
| /import | ✓ | ✓ | ✓ | ✗ |
| /admin/metal-rates | ✓ | ✓ | ✗ | ✗ |
| /admin/pricing-rules | ✓ | ✗ | ✗ | ✗ |
| /admin/products | ✓ | ✗ | ✗ | ✗ |
| /admin/users | ✓ | ✗ | ✗ | ✗ |

---

## 7. HAI VIEW CHO INVOICE DETAIL

### JM Form View (Flat Table)
- 15 cột trên 1 dòng/SKU — xem `.claude/rules/jm-form-view.md` cho full spec
- SKU JWMold cell: background `#FEF3C7` (sticky khi scroll)
- Notes "Ba Sao": màu đỏ `#DC2626`
- Horizontal scroll + sticky col 1 (No.) + col 2 (SKU) trên mobile

### Detail View (Card + Gem Sub-rows)
- Mỗi SKU = 1 card có inline edit
- Gem sub-table bên dưới mỗi card (GENERATED cols display)
- Supabase Realtime sync (`invoice_items` + `item_gem_details`)

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
- Partial import OK: valid rows được import, invalid rows hiện error

---

## 9. SUPABASE CLIENTS

```typescript
// lib/supabase/server.ts — ANON key (auth-aware, Server Components)
export async function createClient() { ... }

// lib/supabase/server.ts — SERVICE ROLE (bypass RLS, API Routes only)
export function createServiceClient() { ... }

// lib/supabase/admin.ts — SERVICE ROLE + auth.admin API
export function createAdminClient() { ... }  // chỉ dùng cho user management

// Rule: API Routes luôn dùng createServiceClient()
// Rule: createAdminClient() chỉ dùng trong /api/users/* để createUser/deleteUser
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
--text-muted:     #A09890;
--text-inverse:   #FAFAF7;
--border-strong: #1A1814;
--border-base:   #C8C3BB;
--border-light:  #DDD8CF;
--color-success: #4A7C59;
--color-danger:  #9B4040;
--color-warning: #8C7340;
--color-info:    #4A6B8C;
--sku-highlight-bg: #FEF3C7;
--ba-sao-color:     #DC2626;
```

**Fonts:**
```css
--font-heading: 'Cormorant Garamond', Georgia, serif;
--font-body:    'Jost', 'DM Sans', Arial, sans-serif;
--font-mono:    'JetBrains Mono', Consolas, monospace;
```

**Rules:**
- Button: `border-radius: 0` (VUÔNG — không exception ngoài avatar)
- Không dùng Tailwind cho colors — chỉ CSS variables
- FA6 cho icons (`fa-solid`, `fa-regular`)
- Confirm dialogs: custom component, KHÔNG dùng `window.confirm()`

---

## 11. RÀNG BUỘC BẮT BUỘC

```
✓ is_locked = true → 403 trên MỌI write (check trước mọi mutation)
✓ snapshot_data chỉ được write bởi PostgreSQL trigger — KHÔNG bởi application code
✓ is_locked chỉ được set true bởi trigger — KHÔNG set từ application code
✓ GENERATED columns (weight_gr, total_price, total_setting_fee) — KHÔNG compute trong TS
✓ status transitions validated bởi ALLOWED_TRANSITIONS map — server-side
✓ Status API: POST /api/invoices/[id]/status (không phải PATCH)
✓ Delete daily_metal_rates → check FK invoice_headers.metal_rate_id → 409 nếu có ref
✓ Chỉ 1 pricing_rule is_active = true tại một thời điểm
✓ Recalculate chain chạy server-side sau mỗi field change
✓ Print: window.open('/invoices/[id]/print') — Server Component render tĩnh
✓ Role lấy từ app_users table (không từ JWT) — query fresh mỗi request
✓ viewer role: zero write access — tất cả mutations trả 403
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
SUPABASE_SERVICE_ROLE_KEY=   # Server-only! Không bao giờ expose
NEXT_PUBLIC_APP_NAME=V-Invoice
```

---

## 14. THỨ TỰ TRIỂN KHAI (SPRINT)

```
Sprint 1 — Foundation
  1. Next.js 14 setup (App Router + TypeScript)
  2. Supabase schema + seed data (app_users, bom_products, rates, rules)
  3. Design system CSS (CSS variables + fonts)
  4. Auth (login/logout/session — app_users table)
  5. Dashboard layout (topbar + nav theo role)
  6. Dashboard page (stats cards + recent invoices)

Sprint 2 — Invoice Core
  7. Invoice list page (table + filter + pagination — RPC)
  8. Create invoice page (form)
  9. Invoice detail page (JM Form View — 15 col)
  10. Status workflow bar + transitions (POST status)

Sprint 3 — Detail + Gems
  11. Invoice Detail View (card + gem sub-table)
  12. Inline edit (item fields)
  13. Gem CRUD
  14. Pricing recalculation chain (server-side)
  15. Supabase Realtime sync

Sprint 4 — Data Entry
  16. Import Excel page (SheetJS + validation + preview)
  17. Export Excel (role-filtered columns)
  18. Print page (A4 landscape)

Sprint 5 — Admin
  19. Metal Rates CRUD (+ FK guard on delete)
  20. Pricing Rules CRUD
  21. Products (SKU catalog) CRUD
  22. User Management page (admin only)

Sprint 6 — Polish
  23. Responsive (mobile + tablet)
  24. Deploy Vercel + production Supabase
```
