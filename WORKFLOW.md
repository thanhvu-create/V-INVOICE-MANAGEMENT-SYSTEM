# V-Invoice — Workflow & Data Flow Guide
> Hệ thống quản lý invoice trang sức HP Jewelry  
> Cập nhật: 2026-05-25

---

## 1. TỔNG QUAN HỆ THỐNG

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          V-INVOICE SYSTEM                                   │
│                                                                             │
│   Excel JM ──┐                           ┌── Export .xlsx                  │
│   Thủ công ──┤  CREATE  →  APPROVE  →   INVOICE  ├── Print A4              │
│              │                           └── Snapshot (FROZEN)             │
│              │                                                              │
│   Setup ─────┤  Metal Rates  +  Pricing Rules  +  SKU Catalog             │
│  (Admin 1×)  │                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. LUỒNG CHÍNH — VÒNG ĐỜI INVOICE

```
════════════════════════════════════════════════════════════════════════════
                    VÒNG ĐỜI MỘT INVOICE
════════════════════════════════════════════════════════════════════════════

  ADMIN/MANAGER          USER                  MANAGER               ADMIN
  (Setup & Rates)      (Tạo Invoice)          (Duyệt)              (Invoiced)
       │                    │                     │                     │
       │                    │                     │                     │
  ─────┼────────────────────┼─────────────────────┼─────────────────────┼──
       │                    │                     │                     │
  [Setup ban đầu]           │                     │                     │
  • Pricing Rule            │                     │                     │
  • SKU Catalog             │                     │                     │
  • Users/Roles             │                     │                     │
       │                    │                     │                     │
  [Mỗi sáng]               │                     │                     │
  • Add Metal Rate          │                     │                     │
    /admin/metal-rates      │                     │                     │
       │                    │                     │                     │
       │              [Tạo Invoice]               │                     │
       │              Import Excel               │                     │
       │              hoặc thủ công             │                     │
       │              /import | /invoices/new    │                     │
       │                    │                     │                     │
       │              [Kiểm tra]                 │                     │
       │              JM Form View (15 col)      │                     │
       │              Detail View + Gem edit     │                     │
       │                    │                     │                     │
       │              ┌─────┴────────┐            │                     │
       │              │   DRAFT      │            │                     │
       │              │  (có thể     │            │                     │
       │              │   sửa)       │            │                     │
       │              └─────┬────────┘            │                     │
       │                    │                     │                     │
       │              [Submit for Approval]       │                     │
       │              Workflow Bar → PENDING      │                     │
       │                    │                     │                     │
       │                    └─────────────────────►                     │
       │                                   ┌──────┴──────┐             │
       │                                   │  PENDING    │             │
       │                                   │  APPROVAL   │             │
       │                                   └──┬──────┬───┘             │
       │                                      │      │                  │
       │                               [Approve]  [Return to Draft]    │
       │                                      │      │                  │
       │                    ◄─────────────────┘      │ (user sửa lại)  │
       │                    ◄────────────────────────┘                  │
       │                              ┌───────┴──────┐                  │
       │                              │   APPROVED   │                  │
       │                              └───────┬──────┘                  │
       │                                      │                         │
       │                                      └─────────────────────────►
       │                                                         ┌──────┴──────┐
       │                                                         │  INVOICED   │
       │                                                         │  🔒 FROZEN  │
       │                                                         └─────────────┘
       │                                                               │
       │                                                         [Trigger chạy]
       │                                                         • Snapshot JSONB
       │                                                         • is_locked = true
       │                                                         • Không ai sửa được
```

---

## 3. TRẠNG THÁI & QUYỀN CHUYỂN ĐỔI

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      STATUS STATE MACHINE                                │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────┐   user/manager/admin   ┌──────────────────┐               │
│   │  DRAFT  │ ──────────────────────► │ PENDING_APPROVAL │               │
│   │  (gray) │ ◄────────────────────── │    (amber)       │               │
│   └─────────┘   manager/admin        └────────┬─────────┘               │
│                 Return to Draft               │                          │
│                                               │ manager/admin            │
│                                               │ Approve                  │
│                                               ▼                          │
│   ┌──────────────────────────────────────────────────────────────────┐   │
│   │          APPROVED (green)                                         │   │
│   │          admin: có thể Return for Review → PENDING lại           │   │
│   └──────────────────────┬───────────────────────────────────────────┘   │
│                          │ admin only                                     │
│                          │ Mark as Invoiced                               │
│                          ▼                                                │
│   ┌──────────────────────────────────────────────────────────────────┐   │
│   │  🔒 INVOICED (black fill) — FROZEN — không thể sửa bất cứ gì   │   │
│   └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  BADGE COLORS:                                                           │
│  draft           ── gray  (text-muted)                                  │
│  pending_approval── amber (color-warning)                               │
│  approved        ── green (color-success)                               │
│  invoiced        ── black fill (text-primary bg, text-inverse text)     │
└──────────────────────────────────────────────────────────────────────────┘

QUYỀN CHUYỂN ĐỔI:
┌──────────┬────────────────────────────────────────────────────────────┐
│  Role    │  Transitions được phép                                     │
├──────────┼────────────────────────────────────────────────────────────┤
│  admin   │  draft→pending | pending→approved | pending→draft          │
│          │  approved→invoiced | approved→pending                      │
│  manager │  pending→approved | pending→draft                          │
│  user    │  draft→pending                                             │
│  viewer  │  (không có quyền nào)                                     │
└──────────┴────────────────────────────────────────────────────────────┘
```

---

## 4. LUỒNG DỮ LIỆU — TÍNH GIÁ

```
════════════════════════════════════════════════════════════════════
                   PRICING CALCULATION CHAIN
════════════════════════════════════════════════════════════════════

  INPUT                     FORMULA                       OUTPUT
  ─────                     ───────                       ──────

  weight_gold_actual_gr ─┐
  metal_type (18KW...)  ─┤── × metal_rate × (1 + loss%) ─► gold_value_usd
  daily_metal_rates     ─┘
  casting_loss_pct      ─┘

  gold_value_usd ────────┐
  Σ gem.total_price ─────┤
  Σ gem.total_setting_fee┤
  labor_fee ─────────────┤── SUM ──────────────────────── ► hpusa
  casting_fee ───────────┤
  design_fee ────────────┤
  resin_fee ─────────────┤
  misc_fee ──────────────┘

  hpusa × cif_multiplier ──────────────────────────────── ► cif_price
  cif_price × tag_multiplier ──────────────────────────── ► tag_price
  cif_price × fr_multiplier ───────────────────────────── ► fr_price

                          PostgreSQL GENERATED (không được compute trong code):
  weight_ct_after × 0.2 ────────────────────────────────► gem.weight_gr
  weight_ct_after × unit_price_per_ct ─────────────────── ► gem.total_price
  qty_pcs × setting_fee_per_pcs ──────────────────────── ► gem.total_setting_fee

  METAL TYPE → RATE COLUMN:
  ┌──────────────────────────────────────────┐
  │  18KW → gold_18kw  │  24K  → gold_24k   │
  │  18KY → gold_18ky  │  AG   → silver      │
  │  14KY → gold_14ky  │  PD   → palladium   │
  │  PT950 → platinum  │  PT   → platinum    │
  └──────────────────────────────────────────┘
```

---

## 5. LUỒNG IMPORT EXCEL

```
  File Excel (JM Format)
  ┌──────────────────────────────────────────────────────────┐
  │  A      B         C       D     E      F      G  H   I  │
  │  Store  Location  SKU     SO/MO Vendor Desc   Qty Wt  Au │
  │  US ONL Safe 1   RING-01  ...   ...    Ring   2  5.2  3.5│
  │  ...                                                     │
  └──────────────────────────────────────────────────────────┘
            │
            ▼ /import (SheetJS parse)
  ┌──────────────────────────────┐
  │    VALIDATE từng dòng        │
  │    ✓ SKU tồn tại?            │
  │    ✓ qty ≥ 1?                │
  │    ✓ gold_wt ≤ total_wt?     │
  └──────────────────────────────┘
            │
            ├──────────────────► VALID rows
            │                        │
            └──────────────────► ERROR rows (hiện bảng: Row, SKU, Lỗi)
                                      │
                                 Partial import OK:
                                 valid rows được import
                                 error rows không block
            │
            ▼ POST /api/import
  ┌────────────────────────────────────────────────────────────┐
  │  Server:                                                    │
  │  1. Check is_locked → 403 nếu locked                       │
  │  2. Auto-copy fees từ bom_products (labor/casting/design…) │
  │  3. Assign line_no = MAX(existing) + 1, 2, 3…             │
  │  4. INSERT invoice_items (bulk)                            │
  │  5. recalculateItem() cho từng item vừa insert             │
  │     → tính gold_value_usd, hpusa, cif, tag, fr            │
  └────────────────────────────────────────────────────────────┘
```

---

## 6. DỮ LIỆU LƯU TRỮ — DATABASE SCHEMA

```
════════════════════════════════════════════════════════════════════
                    SUPABASE POSTGRESQL SCHEMA
════════════════════════════════════════════════════════════════════

  app_users
  ┌─────────────────────────────────────────┐
  │ id │ auth_id │ email │ full_name │ role │ is_active │
  └─────────────────────────────────────────┘
         ▲ FK: auth.users.id (Supabase Auth)

  daily_metal_rates                          pricing_rules
  ┌──────────────────────────────────────┐   ┌──────────────────────────────────┐
  │ id │ rate_date (UNIQUE) │ gold_24k   │   │ id │ name │ cif_multiplier     │
  │    │ gold_18kw │ gold_18ky │ gold_14ky│   │    │ tag_multiplier │ fr_mult  │
  │    │ platinum  │ silver   │ palladium │   │    │ casting_loss_pct │ is_active│
  └──────────┬───────────────────────────┘   └──────────────┬───────────────────┘
             │ FK                                            │ FK
             │                                              │
             ▼                                              ▼
  invoice_headers
  ┌────────────────────────────────────────────────────────────────────────┐
  │ id │ invoice_no (GENERATED) │ po_number │ mr_number │ customer_name   │
  │    │ invoice_date │ status │ is_locked │ metal_rate_id │ pricing_rule_id│
  │    │ store │ notes │ created_by │ snapshot_data (JSONB) │ snapshot_at  │
  └──────────────────────────────────────┬─────────────────────────────────┘
                                         │ 1:N
                                         ▼
  invoice_items
  ┌────────────────────────────────────────────────────────────────────────┐
  │ id │ invoice_id │ line_no │ sku_jwmold │ bom_product_id │ qty_pcs     │
  │    │ store │ location_store │ description │ class │ sub_class        │
  │    │ weight_total_gr │ weight_gold_actual_gr │ weight_no_gem_gr      │
  │    │ metal_type │ gold_value_usd │ labor_fee │ casting_fee           │
  │    │ hpusa │ cif_price │ tag_price │ fr_price │ sell_price           │
  │    │ ship_date │ tracking_no │ vinvoice_no │ notes                  │
  └──────────────────────────────────────┬─────────────────────────────────┘
                                         │ 1:N
                                         ▼
  item_gem_details
  ┌────────────────────────────────────────────────────────────────────────┐
  │ id │ invoice_item_id │ gem_type │ shape │ size_mm │ qty_pcs           │
  │    │ weight_ct_before │ weight_ct_after │ unit_price_per_ct           │
  │    │ setting_type │ setting_fee_per_pcs │ sort_order                  │
  │    │ [GENERATED] weight_gr │ total_price │ total_setting_fee          │
  └────────────────────────────────────────────────────────────────────────┘

  audit_logs                              invoice_snapshots
  ┌──────────────────────────────┐        ┌───────────────────────────────┐
  │ invoice_id │ action          │        │ invoice_id (UNIQUE)           │
  │ from_status │ to_status      │        │ snapshot_data (full JSONB)    │
  │ changed_by │ note │ metadata │        │ metal_rates (JSONB)           │
  └──────────────────────────────┘        │ pricing_rules (JSONB)         │
                                          └───────────────────────────────┘
                                          Được tạo bởi PostgreSQL trigger
                                          khi status → 'invoiced'
```

---

## 7. QUYỀN TRUY CẬP THEO ROLE

```
┌──────────────────┬────────┬─────────┬──────┬────────┐
│  Chức năng       │ admin  │ manager │ user │ viewer │
├──────────────────┼────────┼─────────┼──────┼────────┤
│ Xem invoice      │   ✓    │    ✓    │  ✓   │   ✓    │
│ Tạo invoice      │   ✓    │    ✓    │  ✓   │   ✗    │
│ Edit invoice     │   ✓    │    ✓    │ own* │   ✗    │
│ Submit approval  │   ✓    │    ✓    │  ✓   │   ✗    │
│ Approve/Return   │   ✓    │    ✓    │  ✗   │   ✗    │
│ Mark Invoiced    │   ✓    │    ✗    │  ✗   │   ✗    │
│ Delete invoice   │   ✓    │    ✗    │  ✗   │   ✗    │
│ Import Excel     │   ✓    │    ✓    │  ✓   │   ✗    │
│ Export Excel     │   ✓    │    ✓    │  ✓   │   ✓    │
│ Metal Rates      │   ✓    │    ✗    │  ✗   │   ✗    │
│ Pricing Rules    │   ✓    │    ✗    │  ✗   │   ✗    │
│ Products (SKU)   │   ✓    │    ✗    │  ✗   │   ✗    │
│ Users            │   ✓    │    ✗    │  ✗   │   ✗    │
└──────────────────┴────────┴─────────┴──────┴────────┘
* user chỉ edit draft invoice của chính mình

COLUMN VISIBILITY (giá / pricing):
┌────────────────────┬────────┬─────────┬──────┬────────┐
│  Cột               │ admin  │ manager │ user │ viewer │
├────────────────────┼────────┼─────────┼──────┼────────┤
│ Gold Value USD     │   ✓    │    ✓    │  ✓   │   ✗    │
│ HPUSA              │   ✓    │    ✓    │  ✓   │   ✗    │
│ CIF Price          │   ✓    │    ✓    │  ✓   │   ✗    │
│ Tag Price          │   ✓    │    ✓    │  ✗   │   ✗    │
│ FR Price           │   ✓    │    ✓    │  ✗   │   ✗    │
│ Sell Price         │   ✓    │    ✓    │  ✗   │   ✗    │
│ Discount %         │   ✓    │    ✓    │  ✗   │   ✗    │
└────────────────────┴────────┴─────────┴──────┴────────┘
```

---

## 8. LUỒNG HÀNG NGÀY — QUICK REFERENCE

```
  SÁNG SỚM (Admin/Manager)
  ─────────────────────────
  /admin/metal-rates → Add Rate (ngày hôm nay)
  Nhập: 24K, 18KW, 18KY, 14KY, PT, AG, PD (USD/gram)

  TẠO INVOICE (User)
  ──────────────────
  /import → chọn invoice → upload .xlsx → preview → [Import N rows]
  hoặc /invoices/new → nhập thủ công

  KIỂM TRA (User)
  ───────────────
  /invoices → click invoice
  Tab [JM Form View] → xem 15 cột dạng spreadsheet
  Tab [Detail View]  → edit chi tiết, thêm gem

  SUBMIT (User)
  ─────────────
  Workflow Bar → [Submit for Approval] → note (optional) → Confirm
  Status: draft → pending_approval

  DUYỆT (Manager)
  ────────────────
  Dashboard → "Pending: N" → click
  /invoices?status=pending_approval → mở từng invoice
  [Approve] → status: approved
  [Return to Draft] + note lý do → user sửa lại

  LOCK (Admin)
  ────────────
  Invoice approved → [Mark as Invoiced]
  → PostgreSQL trigger: snapshot + lock
  Status: invoiced (FROZEN 🔒)

  EXPORT / IN ẤN (Mọi role)
  ──────────────────────────
  Invoice detail → [Export Excel] → .xlsx
  Invoice detail → [Print] → /invoices/[id]/print → Ctrl+P
```

---

## 9. ĐIỂM QUAN TRỌNG — BUSINESS RULES

```
  🔒  is_locked = true
      → KHÔNG THỂ sửa bất cứ thứ gì
      → Chỉ trigger PostgreSQL set (không bao giờ từ app code)

  📸  snapshot_data
      → Lưu toàn bộ data tại thời điểm invoiced (header + items + gems + rate + rule)
      → Bất biến, không bao giờ thay đổi dù rate/rule sau này thay đổi

  ⚡  Recalculate chain
      → Chạy server-side sau mỗi lần thay đổi weight, fee, gem, rate, rule
      → KHÔNG tính trong TypeScript — đọc GENERATED columns từ PostgreSQL

  🗓️  Rate lock
      → Invoice gắn với metal_rate_id tại thời điểm tạo
      → Thay đổi rate sau KHÔNG ảnh hưởng invoice đã tạo
      → Trừ khi admin bấm bulk recalculate

  🛡️  Delete rate guard
      → Không xóa được daily_metal_rate nếu có invoice đang dùng
      → API trả 409 với số lượng invoice bị ảnh hưởng

  1️⃣  Pricing rule
      → Chỉ 1 rule có is_active = true tại một thời điểm
      → Invoice dùng rule tại thời điểm tạo (không đổi sau)

  👁️  Role từ database
      → Role lấy từ app_users.role — KHÔNG từ JWT
      → Query fresh mỗi request → thay đổi role có hiệu lực ngay
```

---

## 10. API ENDPOINTS — TÓM TẮT

```
  AUTH
  POST   /api/auth/login          → đăng nhập
  GET    /api/auth/me             → user hiện tại
  POST   /api/auth/logout         → đăng xuất

  INVOICES
  GET    /api/invoices            → danh sách (filter, pagination)
  POST   /api/invoices            → tạo mới
  GET    /api/invoices/[id]       → chi tiết
  PATCH  /api/invoices/[id]       → cập nhật header
  DELETE /api/invoices/[id]       → xóa (admin, chưa locked)
  POST   /api/invoices/[id]/status → chuyển trạng thái

  ITEMS
  GET    /api/invoices/[id]/items                        → danh sách items
  POST   /api/invoices/[id]/items                        → thêm item
  PUT    /api/invoices/[id]/items/[itemId]               → sửa item
  DELETE /api/invoices/[id]/items/[itemId]               → xóa item
  GET    /api/invoices/[id]/items/[itemId]/gems          → gem list
  POST   /api/invoices/[id]/items/[itemId]/gems          → thêm gem

  ADMIN
  GET    /api/metal-rates          → danh sách rates
  POST   /api/metal-rates          → thêm rate
  PATCH  /api/metal-rates/[id]     → sửa rate
  DELETE /api/metal-rates/[id]     → xóa (có FK guard)

  GET/POST/PATCH/DELETE /api/pricing-rules
  GET/POST/PATCH/DELETE /api/products
  GET/POST/PATCH/DELETE /api/users

  IMPORT / EXPORT
  POST   /api/import               → import Excel → invoice_items
  GET    /api/export?invoiceId=... → export .xlsx
  GET    /api/export/template      → download template JM format

  DASHBOARD
  GET    /api/dashboard/stats      → 4 status counts + totals
  GET    /api/dashboard/recent     → 5 invoices mới nhất

  RESPONSE FORMAT:
  Success: { success: true,  data: any }
  Error:   { success: false, message: string }
```
