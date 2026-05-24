# V-Invoice Documentation Index

> Tài liệu đầy đủ để triển khai V-Invoice từ đầu (vibe coding ready).
> Stack: **Next.js 14 App Router + TypeScript + Supabase + Vercel**

---

## Core Docs

| File | Nội dung |
|------|----------|
| [OVERVIEW.md](OVERVIEW.md) | Mục tiêu, roles, invoice state machine, pricing formula tóm tắt |
| [TECH-STACK.md](TECH-STACK.md) | Next.js setup, packages, folder structure, env vars, deploy |
| [DATABASE.md](DATABASE.md) | Tất cả tables, columns, indexes, triggers, RPC functions |
| [LOGIC.md](LOGIC.md) | Business rules: pricing chain, is_locked guard, status transitions |
| [UI-UX.md](UI-UX.md) | Design system: CSS vars, fonts, colors, components, luxury theme |
| [RESPONSIVE.md](RESPONSIVE.md) | Breakpoints, mobile layout, table scroll, touch targets |

---

## Module Docs

| File | Route | Mô tả |
|------|-------|--------|
| [modules/invoice-module.md](modules/invoice-module.md) | `/invoices/[id]` | Invoice Detail — JM view, gem detail, pricing display, action bar, status transitions |
| [modules/review-module.md](modules/review-module.md) | `/invoices` | Invoice List — filter bar, table with role-aware columns, URL-persisted filters, pagination |
| [modules/import-module.md](modules/import-module.md) | `/import` | Excel import — JM col mapping, SheetJS parse, validation, preview, bulk insert, fee auto-copy |
| [modules/export-module.md](modules/export-module.md) | `GET /api/invoices/[id]/export` | Excel export — 3 sheets (Items/Gems/Info), role-gated price columns, template download |
| [modules/metal-rates-module.md](modules/metal-rates-module.md) | `/admin/metal-rates` | Gold/platinum daily rates — CRUD, active rate lookup, rate lookup map |
| [modules/pricing-rules-module.md](modules/pricing-rules-module.md) | `/admin/pricing-rules` | CIF/Tag/FR multipliers — activate swap RPC, only 1 active at a time |
| [modules/products-module.md](modules/products-module.md) | `/admin/products` | SKU catalog (bom_products) — fee defaults, is_active guard, immutable SKU |
| [modules/users-module.md](modules/users-module.md) | `/admin/users` | Auth + user management — Supabase Auth, roles, requireRole(), canDo(), UserContext |
| [modules/audit-log-module.md](modules/audit-log-module.md) | Invoice Detail (section) | Audit timeline — append-only log, status transitions, who/when/note |
| [modules/dashboard-module.md](modules/dashboard-module.md) | `/dashboard` | Stats overview — status counts, CIF this month, recent invoices, quick links |

---

## Rules Files (`.claude/rules/`)

| File | Nội dung |
|------|----------|
| `invoice-workflow.md` | State machine + is_locked + snapshot trigger |
| `pricing-formula.md` | Full pricing chain with TypeScript code |
| `jm-form-view.md` | JM Form 15-column layout spec |
| `database-schema.md` | Complete DDL for all tables |
| `ui-design.md` | CSS variables, fonts, luxury design system |
| `metal-rates.md` | Rate lookup map + active rate fetch pattern |
| `import-export.md` | JM Excel format column mapping A–L |

---

## Key Constraints (apply across ALL modules)

```
✓ is_locked = true → 403 on ANY write (even admin) — data integrity, not permission
✓ createServiceClient() for ALL API routes (bypass RLS)
✓ getAuthContext() → verify session before processing
✓ GENERATED ALWAYS AS columns (weight_gr, total_price, total_setting_fee) — NEVER write from app
✓ trg_snapshot_invoice — DB trigger fires on status → 'invoiced', sets snapshot_data + is_locked
✓ activate_pricing_rule(id) — atomic RPC swap, only 1 active rule
✓ Timezone: Asia/Ho_Chi_Minh for ALL display
✓ SERVICE_ROLE_KEY — server-only, NEVER in NEXT_PUBLIC_ vars
✓ Role stored in app_users.role (not JWT) — queried fresh each request
```

---

## Implementation Order (recommended)

```
Phase 1 — Foundation
  1. Database schema (DATABASE.md)
  2. Supabase auth + app_users table
  3. Middleware + UserContext + requireRole()
  4. Design system (CSS vars, fonts)

Phase 2 — Core Invoice
  5. Invoice list (review-module)
  6. Invoice detail (invoice-module)
  7. Invoice create/edit forms
  8. Status transitions + audit log

Phase 3 — Data Entry
  9.  Import Excel (import-module)
  10. Export Excel (export-module)
  11. Gem detail management

Phase 4 — Admin
  12. Metal rates (metal-rates-module)
  13. Pricing rules (pricing-rules-module)
  14. Products / SKU catalog (products-module)
  15. User management (users-module)

Phase 5 — Polish
  16. Dashboard (dashboard-module)
  17. Responsive layout (RESPONSIVE.md)
  18. Print PDF view
```
