# V-Invoice — System Overview (2026-06-10)

> Tài liệu này mô tả **trạng thái thực tế hiện tại** của toàn bộ web app.
> Đọc file này để nắm toàn cảnh trước khi sửa bất kỳ phần nào của hệ thống.

---

## 1. Stack Kỹ Thuật

| Layer       | Công nghệ                          |
|-------------|-------------------------------------|
| Frontend    | Next.js 14 (App Router), React 18   |
| Backend     | Next.js API Routes (server-side)    |
| Database    | Supabase PostgreSQL                 |
| Deploy      | Vercel                              |
| Excel       | SheetJS (`xlsx` ^0.18.5)            |
| Auth        | Supabase Auth (email/password)      |

---

## 2. Cấu Trúc Thư Mục

```
vinvoice/
├── app/
│   ├── (auth)/login/              ← Trang đăng nhập
│   ├── (dashboard)/               ← Layout có sidebar/nav (protected)
│   │   ├── dashboard/             ← Dashboard tổng quan
│   │   ├── invoices/              ← Danh sách + [id] + [id]/print
│   │   ├── import/                ← Import Excel bulk
│   │   └── admin/                 ← users / metal-rates / pricing-rules / products / gem-catalog / store-markup
│   ├── api/                       ← 44 API routes (xem §6)
│   ├── unauthorized/              ← Trang 403
│   ├── layout.tsx                 ← Root layout (providers)
│   └── page.tsx                   ← Redirect đến /dashboard
├── components/
│   ├── invoice/                   ← 11 components chính (xem §7)
│   ├── admin/, dashboard/, import/, layout/, ui/
├── contexts/
│   └── UserContext.tsx            ← Role + canDo() permission
├── lib/
│   ├── api.ts                     ← apiCall() wrapper
│   ├── formulas/pricing.ts        ← Toàn bộ công thức tính giá (178 dòng)
│   ├── auth/editGuard.ts          ← checkEditPermission()
│   ├── auth/getRole.ts            ← Lấy role từ DB (không từ JWT)
│   ├── supabase/{client,server,admin}.ts
│   ├── audit/log.ts
│   └── gold-fetch.ts
├── supabase/
│   ├── migration.sql              ← Schema chính (9 tables + 2 triggers)
│   ├── add_metal_rate_spot.sql    ← Thêm spot price fields
│   ├── gem_price_catalog.sql      ← Seed data cho gem catalog
│   └── nvl_store_markup.sql       ← Store markup tiers
├── types/index.ts                 ← Tất cả TypeScript interfaces
└── middleware.ts                  ← Auth gate + route-level RBAC
```

---

## 3. Database Schema (9 Tables)

### 3.1 Sơ đồ quan hệ

```
app_users ──────────────────────────────────────────────┐
                                                         │ created_by_user_id
daily_metal_rates ──┐ metal_rate_id                     │
                    ├──── invoice_headers ───────────────┘
pricing_rules ──────┘ pricing_rule_id         │ id
                                              │
                              invoice_items (invoice_id FK)
                                    │ id
                              item_gem_details (invoice_item_id FK)

bom_products (standalone — soft FK vào invoice_items.bom_product_id)
gem_price_catalog (standalone — lookup khi thêm gem)
audit_logs (invoice_id FK → invoice_headers)
```

### 3.2 Bảng chính

#### `invoice_headers`
| Column | Type | Ghi chú |
|--------|------|---------|
| `id` | UUID PK | |
| `invoice_no` | TEXT | Set bởi trigger `trg_set_invoice_no` — format: `INV-YYYYMM-xxxxxx` |
| `po_number` | TEXT UNIQUE | |
| `status` | TEXT | `draft \| pending_approval \| approved \| invoiced` |
| `is_locked` | BOOLEAN | **CHỈ trigger set** — khi `status → 'invoiced'` |
| `snapshot_data` | JSONB | **CHỈ trigger set** — bản snapshot frozen toàn bộ invoice |
| `metal_rate_id` | UUID FK | → `daily_metal_rates` |
| `pricing_rule_id` | UUID FK | → `pricing_rules` |
| `created_by_user_id` | UUID FK | → `app_users.id` |

> ⚠️ **MISMATCH**: TypeScript type `InvoiceStatus = 'draft' | 'finalized'` — chỉ 2 states.
> DB có 4 states. App hiện tại chỉ dùng `draft → finalized` (alias cho `invoiced`?).
> Cần verify route `/api/invoices/[id]/status` để rõ trạng thái nào đang được set thực sự.

#### `invoice_items`
| Column | Type | Ghi chú |
|--------|------|---------|
| `sku_jwmold` | TEXT | SKU chính |
| `weight_total_gr` | NUMERIC | T.Phẩm có NVL đá |
| `weight_no_gem_gr` | NUMERIC | T.Phẩm trừ NVL đá — server-side computed |
| `weight_gold_actual_gr` | NUMERIC | = `weight_no_gem_gr` |
| `hpusa` | NUMERIC | Vốn sản xuất (TypeScript gọi là `von_san_xuat`) |
| `cif_price` | NUMERIC | |
| `tag_price` | NUMERIC | |
| `fr_price` | NUMERIC | TypeScript gọi là `fb_price` ← name mismatch |

> ⚠️ **FIELD NAME MISMATCH** DB vs TypeScript:
> - DB `hpusa` ↔ TS `von_san_xuat` / `purchase_price`
> - DB `fr_price` ↔ TS `fb_price`

#### `item_gem_details`
| Column | Type | Ghi chú |
|--------|------|---------|
| `weight_ct_after` | NUMERIC | Input chính |
| `unit_price_per_ct` | NUMERIC | Giá/ct |
| `qty_pcs` | INTEGER | Số viên |
| `setting_fee_per_pcs` | NUMERIC | Phí gắn/viên |
| `weight_gr` | NUMERIC | **GENERATED ALWAYS AS** `weight_ct_after * 0.2` |
| `total_price` | NUMERIC | **GENERATED ALWAYS AS** `weight_ct_after * unit_price_per_ct` |
| `total_setting_fee` | NUMERIC | **GENERATED ALWAYS AS** `qty_pcs * setting_fee_per_pcs` |

> 🔴 **CRITICAL**: 3 cột GENERATED ALWAYS AS — **TUYỆT ĐỐI KHÔNG** compute hay INSERT từ TypeScript.

### 3.3 Triggers

#### `trg_snapshot_invoice` (BEFORE UPDATE)
- Fires khi `NEW.status = 'invoiced'` và `OLD.status != 'invoiced'`
- Set `NEW.is_locked = true`, `NEW.snapshot_data = {header, items, gems, rate, rule}`, `NEW.snapshot_at = now()`
- **App code KHÔNG ĐƯỢC set `is_locked` hay `snapshot_data`**

#### `trg_set_invoice_no` (BEFORE INSERT)
- Set `invoice_no = 'INV-' || TO_CHAR(created_at, 'YYYYMM') || '-' || SUBSTRING(id, 1, 6)`

---

## 4. Auth & RBAC

### 4.1 Luồng Auth
```
User → /login → POST /api/auth/login
  → supabase.auth.signInWithPassword()
  → Set cookie (Supabase session)
  → Redirect /dashboard

Mọi request:
  middleware.ts:
    1. Kiểm tra PUBLIC_ROUTES → bypass
    2. supabase.auth.getUser() → nếu không có user → redirect /login
    3. Nếu route là ADMIN/MANAGER → query app_users.role từ DB
    4. Role không đủ → redirect /unauthorized
```

### 4.2 Role System
```
Role lấy từ DB (app_users.role) — KHÔNG từ JWT

Roles: admin | manager | user | viewer

admin:   create, edit, delete, approve, invoice, import,
         manage_users, manage_rates, manage_rules, manage_products, see_prices
manager: create, edit, approve, import, see_prices
user:    create, edit, import
viewer:  (không có quyền gì)
```

### 4.3 Route Protection (middleware.ts)
```
PUBLIC:  /login, /api/auth/login, /api/export/template
ADMIN:   /admin/users, /admin/pricing-rules, /admin/products
MANAGER: /admin/metal-rates
Còn lại: chỉ cần authenticated
```

### 4.4 Edit Guard (`lib/auth/editGuard.ts`)
```typescript
checkEditPermission({ isLocked, status, role, createdBy, userId })
// → string (lỗi) | null (được phép)

Rules:
- isLocked = true → từ chối (finalized)
- role = 'viewer' → từ chối
- status = 'draft' AND role = 'user' AND createdBy != userId → từ chối
- Còn lại → cho phép
```

---

## 5. Pricing Pipeline

### 5.1 Luồng Tính Giá (pricing.ts)

```
spot_gold_24k ($/oz)
    ↓ goldPricePerGram(loai_vang, nvl)
price_per_gram ($/gr) — có casting loss baked in
    ↓ × weight_no_gem_gr
tien_vang ($)
    ↓ calcVonSanXuat(item, diamonds, template)
von_san_xuat / hpusa ($)  [= tien_vang + gia_cong + duc + thiet_ke + resin + phi_phu_kien + Σgem]
    ↓ calcCIFPrice(vonSX, template)
cif_price ($)
    ↓ × nvl.tag_multiplier
tag_price ($)
    ↓ × nvl.fr_multiplier
fb_price / fr_price ($)
```

### 5.2 `goldPricePerGram()` — Casting Loss Rules

| Karat | Formula | Loss |
|-------|---------|------|
| 24K | `spot / 31.103` | Không |
| 23K | `spot × (23/24) / 31.103` | Không |
| 22K | `spot × (22/24) / 31.103` | Không |
| 18K..10K | `spot × (1 + loss_gold) × (karat/24) / 31.103` | `loss_gold` (6%) |
| PT | `spot_pt × (1 + loss_pt) / 31.103` | `loss_pt` (17%) |
| **AG** | `spot_ag × (1 + loss_gold) / 31.103` | ⚠️ **BUG** — thiếu `× (1 + loss_pt)` |
| PD | `spot_pd × (1 + loss_pt) / 31.103` | `loss_pt` (17%) |

> 🔴 **BUG tại pricing.ts:46** — AG phải có CẢ HAI loss:
> Hiện tại: `spot_ag * (1 + loss_gold) / OUNCE_PER_GRAM`
> Đúng phải: `spot_ag * (1 + loss_gold) * (1 + loss_pt) / OUNCE_PER_GRAM`

### 5.3 `calcCIFPrice()` — CIF Rate Theo Template

| Template | Rate | Ghi chú |
|----------|------|---------|
| CH1 | × 1.05 (5%) | ✅ |
| CH1_AG3 | × 1.05 (5%) | ✅ |
| ADM | × 1.10 (10%) | ⚠️ **Tranh luận** — gap analysis nói 5%, code comment nói "confirmed 10% from actual Excel" |
| VNSI_AG3 | × 1.10 (10%) | ✅ |
| CH2 | null | Không có CIF |
| MANUAL | null | |

### 5.4 `calcVonSanXuat()` — Theo Template

| Template | Formula |
|----------|---------|
| CH1, CH2 | Σt_gia_xoan + Σt_phi + tien_vang + gia_cong + duc + thiet_ke + resin + phi_phu_kien |
| ADM | Σt_gia_xoan + Σt_phi + tien_vang |
| CH1_AG3, VNSI_AG3, MANUAL | tien_vang only |

### 5.5 Gem Diamond (`recalcDiamond()`)
```
tl_xoan_gr  = tl_truoc_xu_ly_ct / 5
t_gia_xoan  = tl_truoc_xu_ly_ct × don_gia
don_gia_phi = $1 (fixed)
t_phi       = sl_hot × 1
```

### 5.6 NVL Snapshot (`nvlFromInvoice()`)
NVL được freeze vào invoice lúc tạo. Defaults khi null:
- `spot_gold_24k = 3300`, `spot_pt = 1050`, `spot_ag = 33`, `spot_pd = 950`
- `loss_gold = 0.06`, `loss_pt = 0.17`
- `tag_multiplier = 0`, `fr_multiplier = 0`

---

## 6. API Routes (44 routes)

### Auth
| Method | Route | Mô tả |
|--------|-------|-------|
| POST | `/api/auth/login` | Đăng nhập email/password |
| POST | `/api/auth/logout` | Đăng xuất |
| GET | `/api/auth/me` | Profile user hiện tại |
| GET | `/api/auth/drive-token` | Google Drive token |
| POST | `/api/auth/google-drive` | Google Drive callback |

### Invoices
| Method | Route | Mô tả |
|--------|-------|-------|
| GET | `/api/invoices` | Danh sách (filter: status, search, date) |
| POST | `/api/invoices` | Tạo invoice mới |
| GET | `/api/invoices/[id]` | Chi tiết + items + gems |
| PATCH | `/api/invoices/[id]` | Cập nhật header |
| DELETE | `/api/invoices/[id]` | Xóa invoice |
| POST | `/api/invoices/[id]/status` | Chuyển trạng thái |
| GET | `/api/invoices/[id]/export` | Export XLSX |
| GET | `/api/invoices/[id]/audit-log` | Lịch sử thay đổi |
| GET | `/api/invoices/new-defaults` | Defaults cho form tạo mới |

### Invoice Items
| Method | Route | Mô tả |
|--------|-------|-------|
| POST | `/api/invoices/[id]/items` | Thêm item |
| PATCH | `/api/invoices/[id]/items/[itemId]` | Sửa item (trigger recalc) |
| DELETE | `/api/invoices/[id]/items/[itemId]` | Xóa item |

### Gems
| Method | Route | Mô tả |
|--------|-------|-------|
| GET | `/api/invoices/[id]/items/[itemId]/gems` | Danh sách gem |
| POST | `/api/invoices/[id]/items/[itemId]/gems` | Thêm gem |
| PATCH | `/api/invoices/[id]/items/[itemId]/gems/[gemId]` | Sửa gem |
| DELETE | `/api/invoices/[id]/items/[itemId]/gems/[gemId]` | Xóa gem |

### Metal Rates
| Method | Route | Mô tả |
|--------|-------|-------|
| GET | `/api/metal-rates` | Danh sách rates |
| POST | `/api/metal-rates` | Tạo rate mới |
| PATCH | `/api/metal-rates/[id]` | Cập nhật rate |
| DELETE | `/api/metal-rates/[id]` | Xóa rate |
| GET | `/api/metal-rates/fetch-market` | Fetch spot price từ thị trường |

### Admin
| Method | Route | Mô tả |
|--------|-------|-------|
| GET/POST/PATCH/DELETE | `/api/admin/gem-catalog` | Quản lý gem catalog |
| GET/POST/PATCH/DELETE | `/api/admin/store-markup` | Quản lý store markup tiers |
| GET/POST/PATCH/DELETE | `/api/users` | Quản lý users |

### Khác
| Method | Route | Mô tả |
|--------|-------|-------|
| GET | `/api/nvl-hot` | NVL HOT lookup (size → unit price) |
| GET | `/api/gem-catalog` | Search gem catalog |
| GET | `/api/dashboard/stats` | Thống kê tổng hợp |
| GET | `/api/dashboard/recent` | Invoices gần đây |
| POST | `/api/import` | Import XLSX bulk |
| GET | `/api/export/template` | Download template XLSX |

---

## 7. Components Chính

### Invoice Components (`components/invoice/`)
| Component | Mô tả |
|-----------|-------|
| `JMFormView.tsx` | Bảng 15 cột flat, 1 row/SKU, sticky cols 1+2, SKU bg #FEF3C7 |
| `DetailView.tsx` | Card per item + gem sub-table, inline edit, hiển thị HPUSA breakdown |
| `AddItemModal.tsx` | Modal thêm item mới vào invoice |
| `GemModal.tsx` | Modal thêm/sửa diamond/gem — lookup gem_price_catalog |
| `WorkflowBar.tsx` | Nút action theo status (`draft → finalized`) |
| `ItemCard.tsx` | Card hiển thị 1 item trong DetailView |
| `JMEditableCell.tsx` | Cell inline-editable trong JMFormView |
| `AuditTimeline.tsx` | Timeline lịch sử thay đổi |
| `FilterBar.tsx` | Filter bar cho danh sách invoice |
| `DriveImage.tsx` | Hiển thị ảnh từ Google Drive |
| `InvoiceTable.tsx` | Bảng danh sách invoices với pagination |

### UI Components (`components/ui/`)
| Component | Mô tả |
|-----------|-------|
| `Toast.tsx` | Toast notification system |
| `StatusBadge.tsx` | Badge màu theo status |
| `ConfirmDialog.tsx` | Dialog xác nhận trước action nguy hiểm |
| `Pagination.tsx` | Phân trang |
| `ModalPortal.tsx` | Portal render modal |
| `HelpModal.tsx` | Modal help/docs |

---

## 8. Patterns Quan Trọng

### 8.1 `apiCall()` Wrapper (`lib/api.ts`)
```typescript
// Tất cả API calls từ client dùng wrapper này
const data = await apiCall<InvoiceProduct>(
  () => fetch(`/api/invoices/${id}/items`, { method: 'POST', body: JSON.stringify(payload) }),
  { successMsg: 'Item added.' }
)
if (!data) return  // lỗi đã được toast tự động

// Sau khi PATCH item → update local state, KHÔNG re-fetch toàn bộ:
setItems(prev => prev.map(i => i.id === data.id ? data : i))
```

### 8.2 `checkEditPermission()` Guard
```typescript
// Mọi write API route đều phải check:
const editError = checkEditPermission({
  isLocked:  invoice.is_locked,
  status:    invoice.status,
  role:      ctx.role,
  createdBy: invoice.created_by_user_id,
  userId:    ctx.userId,
})
if (editError) return NextResponse.json({ success: false, message: editError }, { status: 403 })
```

### 8.3 `canDo()` Client-Side
```typescript
const { canDo } = useUser()

// Ẩn/hiện UI elements:
{canDo('see_prices') && <PriceColumns />}
{canDo('delete') && <DeleteButton />}
{canDo('manage_rates') && <EditRateButton />}
```

### 8.4 Recalc Chain (Server-Side)
```
PATCH /api/invoices/[id]/items/[itemId]
  → validate body
  → checkEditPermission()
  → UPDATE invoice_items SET ...
  → fetch latest diamonds for this item
  → recalcDiamond() for each gem
  → recalcItem(item, diamonds, nvl, template)
  → UPDATE invoice_items SET (tien_vang, von_san_xuat, cif_price, tag_price, fb_price, ...)
  → return updated item
```

### 8.5 Export Excel (Server-Side)
```
GET /api/invoices/[id]/export
  → Fetch invoice + items + gems từ DB
  → SheetJS: aoa_to_sheet + ws['!merges'] (Master-Detail với merge cells)
  → Return binary .xlsx file
```

---

## 9. Invoice Status Workflow

> ⚠️ **DISCREPANCY**: DB có 4 states, TypeScript type chỉ có 2.

**DB** (`migration.sql`): `draft → pending_approval → approved → invoiced`
- `invoiced` = trigger sets `is_locked = true` + `snapshot_data`

**TypeScript** (`types/index.ts`): `'draft' | 'finalized'`
- `editGuard.ts` check: `ctx.isLocked` (boolean) + `ctx.status === 'draft'`

**Thực tế chạy**: Route `/api/invoices/[id]/status` cần xem để biết app đang dùng state nào.
- Khả năng cao: app hiện tại chỉ dùng `draft` và `finalized` (map `finalized` vào `invoiced` ở DB).

---

## 10. 5 Invoice Templates

| Template | Đối tượng | CIF Rate | Von SX | Tag/FB |
|----------|-----------|----------|--------|--------|
| CH1 | CH1-Khách | 5% | Full (gems + fabrication) | Không |
| CH2 | CH2 | null | Full (gems + fabrication) | Không |
| ADM | ADM | 10% (tranh luận) | Gems + tien_vang only | Không |
| CH1_AG3 | CH1-AG3 | 5% | tien_vang only | Có (tag × multiplier) |
| VNSI_AG3 | VNSI-AG3 | 10% | tien_vang only | Có (fb × multiplier) |
| MANUAL | Manual | null | tien_vang only | Không |

---

## 11. Bugs & Issues Đã Biết

### 🔴 Critical

**Bug 1 — AG Silver Formula** (`pricing.ts:46`)
```typescript
// Hiện tại (SAI):
case 'AG': return spot_ag * (1 + loss_gold) / OUNCE_PER_GRAM

// Đúng phải (AG cần CẢ HAI loss):
case 'AG': return spot_ag * (1 + loss_gold) * (1 + loss_pt) / OUNCE_PER_GRAM
```

**Bug 2 — Status Type Mismatch** (`types/index.ts`)
```typescript
// TypeScript chỉ biết:
type InvoiceStatus = 'draft' | 'finalized'

// DB thực tế có:
CHECK (status IN ('draft','pending_approval','approved','invoiced'))
```

### 🟡 Medium

**Bug 3 — Field Name Mismatch** (DB ↔ TypeScript)
- DB `invoice_items.hpusa` ↔ TS `von_san_xuat` / `purchase_price`
- DB `invoice_items.fr_price` ↔ TS `fb_price`

**Bug 4 — ADM CIF Rate** (`pricing.ts:122`)
- Code: `× 1.10` với comment "confirmed from ADM Excel"
- Gap analysis nói: nên là `× 1.05` (5%)
- Cần verify lại từ Excel file gốc

**Bug 5 — GemModal per_pcs Mode**
- Khi `price_unit = 'per_pcs'`, hiện tại set `weight_ct_after = qty_pcs`
- Đúng phải: `weight_ct_after = 0` (XC/PL không có carat weight)

### 🔵 Missing Features

**F1 — Size Mapping** (`lib/formulas/size-mapping.ts` — chưa có)
- `mapSizeToRange()` cho 7 gem types: RD, RDL, PR, BG, MQ, PS, OV

**F2 — Theo Dõi Xoàn** (chưa có)
- Bảng `xoan_tracking` + import API + auto-fill khi nhập SO/MO

**F3 — SPHT Import** (chưa có)
- Route `/api/import/spht` + tab SPHT trong import page

---

## 12. Environment Variables

| Variable | Where Used | Ghi chú |
|----------|-----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + Middleware | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | 🔴 KHÔNG expose ra client |

---

## 13. Dependency Chính

| Package | Version | Dùng cho |
|---------|---------|---------|
| `next` | 14.2.29 | Framework |
| `@supabase/supabase-js` | ^2.47.0 | DB client |
| `@supabase/ssr` | ^0.5.2 | SSR auth cookies |
| `xlsx` | ^0.18.5 | Excel import/export |

---

## 14. Quick Reference — Nơi Tìm Thứ Gì

| Muốn tìm | File |
|----------|------|
| Công thức tính giá | `lib/formulas/pricing.ts` |
| TypeScript types | `types/index.ts` |
| DB schema | `supabase/migration.sql` |
| Role permissions | `contexts/UserContext.tsx` |
| Edit lock guard | `lib/auth/editGuard.ts` |
| API fetch wrapper | `lib/api.ts` |
| Route auth middleware | `middleware.ts` |
| Dashboard stats | `app/api/dashboard/stats/route.ts` |
| Invoice list view | `components/invoice/JMFormView.tsx` |
| Invoice detail view | `components/invoice/DetailView.tsx` |
| Add item form | `components/invoice/AddItemModal.tsx` |
| Add gem form | `components/invoice/GemModal.tsx` |
