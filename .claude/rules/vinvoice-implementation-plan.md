# V-Invoice — Master Implementation Plan
> **Nguồn:** `MODULE QUẢN LÝ & TẠO V-INVOICE.md` (requirements doc đầy đủ)
> **Cập nhật:** 2026-06-02 (final — 100% complete)
> **Mục đích:** Roadmap phát triển — cross-reference requirements → rules specs → implementation status

---

## 1. TỔNG QUAN YÊU CẦU → TRẠNG THÁI THỰC TẾ

| Requirement | Rules spec | Status |
|-------------|-----------|--------|
| 15-col JM Form View (flat table) | `jm-form-view.md` | ✅ Implemented |
| Detail View (Master-Detail cards + inline edit) | `invoice-detail-inline-edit.md` | ✅ Implemented |
| Inline edit — JM Form View | `invoice-detail-inline-edit.md` | ✅ Implemented |
| Inline edit — Detail View (card edit mode) | `invoice-detail-inline-edit.md` | ✅ Implemented |
| Import Excel (JM format A–L) | `import-export.md` §1–§3 | ✅ Implemented |
| Export Excel (Master-Detail + merge cells) | `import-export.md` §4 | ✅ Implemented |
| Export: quality (P.chất) column | `import-export.md` §4 | ✅ Implemented |
| Print A4 Landscape — base layout | `print-layout.md` | ✅ Implemented |
| Print: Logo công ty (graceful fallback) | `print-layout.md` §2, §8 | ✅ Implemented |
| Print: Signature block 3 cột | `print-layout.md` §5 | ✅ Implemented |
| Print: Total_Stone_Weight row trong tfoot | `print-layout.md` §4 | ✅ Implemented |
| Print: Role-filtered price totals | `print-layout.md` §9 | ✅ Implemented |
| BOM SKU auto-populate (add row) | `bom-integration.md` §3 | ✅ Implemented |
| image_url copy khi **import** Excel | `bom-integration.md` §2 | ✅ Implemented |
| image_url copy khi **add item** thủ công | `bom-integration.md` §2 | ✅ Implemented |
| image_url trong AddItemModal form state | `bom-integration.md` §6 | ✅ Implemented |
| ItemCard thumbnail ảnh 44×44px | `bom-integration.md` §4 | ✅ Implemented |
| HPUSA formula chain (server-side) | `pricing-formula.md` | ✅ Implemented |
| CIF / Tag / FR pricing rules | `pricing-formula.md` §6 | ✅ Implemented |
| Casting loss baked vào rate (derived) | `xlsx-realworld-analysis.md` §0 | ✅ Implemented |
| Metal rates daily CRUD | `metal-rates.md` | ✅ Implemented |
| Pricing rule config module (admin) | `pricing-formula.md` §10 | ✅ Implemented |
| Invoice workflow (Draft→Pending→Approved→Invoiced) | `invoice-workflow.md` | ✅ Implemented |
| Snapshot data khi Invoiced (PostgreSQL trigger) | `database-schema.md` §2 | ✅ Implemented |
| is_locked guard — server-side (mọi write route) | `invoice-workflow.md` §3 | ✅ Implemented |
| Status-based edit guard — server-side (7 routes) | `invoice-workflow.md` §3b | ✅ Implemented |
| Status-based canEdit — UI layer (page.tsx) | `invoice-workflow.md` §3b | ✅ Implemented |
| Ba Sao highlight (đỏ bold) | `jm-form-view.md` §4 | ✅ Implemented |
| Total row (6 totals) cuối JM table | `jm-form-view.md` §10 | ✅ Implemented |
| Total_Stone_Weight (Σ TL Xoàn) row trong JM tfoot | `jm-form-view.md` §10 | ✅ Implemented |
| Sub-total per item (gem subtotal tfoot) | `invoice-detail-inline-edit.md` §10 | ✅ Implemented |
| HPUSA breakdown display trong ItemCard | `invoice-detail-inline-edit.md` §10 | ✅ Implemented |
| Detail View total summary (sau ItemCards) | `invoice-detail-inline-edit.md` §12 | ✅ Implemented |
| Gem CRUD (add/edit/delete) | `invoice-detail-inline-edit.md` §2e | ✅ Implemented |
| GemModal: field `quality` (P. chất) | `invoice-detail-inline-edit.md` §2e | ✅ Implemented |
| Import validation (SKU lookup + error log) | `import-export.md` §2 | ✅ Implemented |
| Toast notifications (replace alert()) | `toast-notifications.md` | ✅ Implemented |
| apiCall() wrapper (lib/api.ts) | `toast-notifications.md` | ✅ Implemented |
| Role-based column visibility | `users-roles.md` §3 | ✅ Implemented |
| User management (admin) | `users-roles.md` §7 | ✅ Implemented |
| Auth (login/logout/session) | `users-roles.md` | ✅ Implemented |
| Dashboard (stats + recent invoices) | `CLAUDE.md` sprint 1 | ✅ Implemented |
| Invoice list (filter + pagination) | `CLAUDE.md` sprint 2 | ✅ Implemented |
| Help button + modal | — | ✅ Implemented |
| Logistics fields (ship_date, tracking_no, vinvoice_no) | `database-schema.md` | ✅ In schema + edit |

**Tổng:** 39 items. ✅ Done: 39 · ⚠️ Partial: 0 · ❌ Missing: 0

---

## 2. IMPLEMENTATION COMPLETE — TẤT CẢ GAPS ĐÃ XỬ LÝ

Tất cả gaps đã được implement và verify qua code audit (2026-06-02):

| Gap | Files đã sửa | Verified |
|-----|-------------|---------|
| F — canEdit UI + status banners | `invoices/[id]/page.tsx` | ✅ |
| A — image_url add item | `items/route.ts`, `AddItemModal.tsx`, `products/route.ts` | ✅ |
| B — ItemCard thumbnail | `ItemCard.tsx` | ✅ |
| C — Gem tfoot + HPUSA breakdown + quality col | `ItemCard.tsx` | ✅ |
| E — Σ TL Xoàn row in JM tfoot | `JMFormView.tsx` | ✅ |
| D — Detail View Total Summary | `DetailView.tsx` | ✅ |

**Bug found & fixed during audit:** `app/api/products/route.ts` SKU batch lookup (`?skus=`) was missing `image_url` in SELECT — fixed.

## 3. BƯỚC TIẾP THEO — DEPLOY

```
Pre-deploy checklist:
[ ] Vercel env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
[ ] Supabase: chạy migration.sql + seed.sql trên production DB
[ ] Supabase: chạy gem_price_catalog.sql
[ ] Upload /public/hp-logo.png (hoặc .svg) cho print page
[ ] Verify PostgreSQL trigger trg_snapshot_invoice đang active
[ ] Verify GENERATED columns (weight_gr, total_price, total_setting_fee) đang active
[ ] Test flow: Import Excel → view JM Form → view Detail → Export → Print
[ ] Test: approved invoice không cho edit (UI + API)
[ ] Test: user chỉ edit own draft (UI + API)
[ ] Test: gem add/edit → HPUSA recalc ngay lập tức
```

---

## 4. ĐÃ HOÀN CHỈNH — KHÔNG CẦN THAY ĐỔI

| Feature | File chính |
|---------|-----------|
| Toast system + apiCall() wrapper | `components/ui/Toast.tsx`, `lib/api.ts` |
| Help button + modal | `components/ui/HelpModal.tsx` |
| JM Form View 15-col + inline edit | `components/invoice/JMFormView.tsx` |
| Detail View card edit mode | `components/invoice/ItemCard.tsx` |
| Gem CRUD (quality field, GemModal) | `components/invoice/GemModal.tsx` |
| AddItemModal + SKU lookup (trừ image_url) | `components/invoice/AddItemModal.tsx` |
| Invoice workflow + WorkflowBar | `components/invoice/WorkflowBar.tsx` |
| Status-based edit guard — server-side | 5 route files + `lib/auth/editGuard.ts` |
| Metal Rates CRUD + FK guard | `app/(dashboard)/admin/metal-rates/` |
| Pricing Rules CRUD | `app/(dashboard)/admin/pricing-rules/` |
| Products CRUD | `app/(dashboard)/admin/products/` |
| User Management | `app/(dashboard)/admin/users/` |
| Import Excel + validation + preview | `app/(dashboard)/import/page.tsx` |
| image_url trong import flow | `app/api/import/route.ts` |
| Export Excel (Master-Detail + merge cells + quality) | `app/api/invoices/[id]/export/route.ts` |
| Print A4: layout + logo + signature + tfoot + role-filter | `app/(dashboard)/invoices/[id]/print/page.tsx` |
| Auth (login/logout/session) | `app/(auth)/`, `lib/auth/` |
| Dashboard stats + recent | `app/(dashboard)/dashboard/` |
| Invoice list filter + pagination | `app/(dashboard)/invoices/page.tsx` |
| Role-based nav + canDo() | `contexts/UserContext.tsx` |

---

## 5. DATABASE — TRẠNG THÁI

```sql
-- Tất cả đã có trong migration.sql (đã apply):
✅ invoice_items.image_url TEXT                          -- có
✅ item_gem_details.quality TEXT                         -- có
✅ item_gem_details GENERATED cols (weight_gr, total_price, total_setting_fee)
✅ invoice_headers.created_by_user_id UUID               -- có
✅ invoice_headers.status TEXT CHECK (...)               -- có
✅ trg_snapshot_invoice trigger                          -- có
✅ gem_price_catalog table (NVL pricing)                 -- có (gem_price_catalog.sql)

-- KHÔNG cần migration thêm cho các gaps còn lại.
-- Tất cả gaps A–F chỉ là changes ở application code.
```

---

## 6. RULES FILES INDEX

| Khi implement | Đọc file |
|--------------|----------|
| Bất kỳ write API (items/gems) | `invoice-workflow.md` §3, §3b |
| Pricing / recalc chain | `pricing-formula.md` |
| Add/edit items + BOM lookup | `bom-integration.md` |
| JM Form table display | `jm-form-view.md` |
| Detail View cards | `invoice-detail-inline-edit.md` |
| Import/Export Excel | `import-export.md` |
| Print page | `print-layout.md` |
| Metal rates | `metal-rates.md` |
| Role checks / canDo() | `users-roles.md` |
| DB schema questions | `database-schema.md` |
| UI component styling | `ui-design.md` |
| Toast/feedback | `toast-notifications.md` |
| Excel real-world analysis | `xlsx-realworld-analysis.md` |

---

## 7. BUSINESS RULES BẮT BUỘC

```
✓ is_locked = true → 403 trên MỌI write — check TRƯỚC mọi mutation
✓ checkEditPermission() → wire vào MỌI write route (đã done cho 7 routes)
✓ GENERATED cols (weight_gr, total_price, total_setting_fee) → KHÔNG compute trong TS
✓ snapshot_data + is_locked = true → CHỈ PostgreSQL trigger set, KHÔNG application code
✓ status transitions → server-side ALLOWED_TRANSITIONS map
✓ Total_Stone_Weight = Σ item_gem_details.weight_gr — KHÔNG dùng (totWt - totNoGem)
✓ image_url denormalized tại thời điểm add/import — KHÔNG update khi bom_products đổi
✓ Metal rate: casting_loss baked vào rate (derived) → casting_loss_pct thường = 0
✓ Metal rate lookup: getMetalRate(metal_type, rate_row) với fallback gold_24k
✓ window.confirm() → KHÔNG dùng — dùng custom ConfirmDialog component
✓ next/image → KHÔNG dùng cho product images — dùng <img> thường (external URLs)
✓ Role stored in app_users.role — KHÔNG từ JWT, query fresh mỗi request
✓ created_by_user_id (UUID) dùng cho ownership check — KHÔNG dùng created_by (TEXT display name)
```

---

## 8. FORMULA QUICK REFERENCE

```
gold_value_usd = weight_gold_actual_gr × metal_rate
  (metal_rate đã bao gồm casting loss — derived rate từ Excel)
  (nếu spot price: gold_value_usd = weight × rate × (1 + casting_loss_pct/100))

hpusa     = gold_value_usd
           + Σ gem.total_price          ← GENERATED col
           + Σ gem.total_setting_fee    ← GENERATED col
           + labor_fee + casting_fee + design_fee + resin_fee + misc_fee

cif_price = hpusa × cif_multiplier     (Hệ số A — thường 1.10)
tag_price = cif_price × tag_multiplier  (Hệ số B)
fr_price  = cif_price × fr_multiplier   (Hệ số C)

gem.weight_gr         = weight_ct_after × 0.2           ← GENERATED (PostgreSQL)
gem.total_price       = weight_ct_after × unit_price_per_ct  ← GENERATED
gem.total_setting_fee = qty_pcs × setting_fee_per_pcs    ← GENERATED
weight_no_gem_gr      = weight_total_gr - Σ gem.weight_gr   ← server computed
```
