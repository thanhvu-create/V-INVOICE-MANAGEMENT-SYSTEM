# V-Invoice — Project Overview

> **Version:** 1.0  
> **Date:** 2026-05-22  
> **Stack:** Next.js 14 + Supabase + Vercel

---

## 1. MỤC TIÊU DỰ ÁN

V-Invoice là hệ thống quản lý invoice trang sức (jewelry) cho nhà sản xuất/xuất khẩu. Hệ thống thay thế quy trình Excel thủ công bằng web app có approval workflow và audit trail.

**Core value:**
- Import Excel JM Form → tạo Draft Invoice trong < 30 giây
- Approval workflow: Draft → Pending → Approved → Invoiced (FROZEN)
- Tính giá tự động: Gold Value → HPUSA → CIF/Tag/FR
- 2 views: JM Form View (15 cột flat) + Detail View (có gem breakdown)
- Export Excel + Print PDF A4 landscape

---

## 2. USER ROLES

| Role | Mô tả | Quyền chính |
|------|-------|-------------|
| `user` | Nhân viên thông thường | Tạo draft, import, edit draft |
| `manager` | Quản lý | Approve/reject pending, edit pending |
| `admin` | Admin hệ thống | Toàn quyền, mark invoiced, quản lý master data |

**Visibility theo role trong Review table:**
- `user`: thấy Sell/Disc/AfterDisc (ẩn Cost)
- `manager`: thấy tất cả
- `admin`: thấy tất cả

---

## 3. INVOICE STATE MACHINE

```
draft ──submit──► pending_approval ──approve──► approved ──invoice──► invoiced
  ▲                     │ reject                   │ reject              │
  └─────────────────────┘                           │                    │ FROZEN
                                             pending_approval            │
                                                                   (cannot unlock)
```

**Khi status → `invoiced`:**
- PostgreSQL trigger tự động tạo JSONB snapshot
- `is_locked = true` — không ai edit được nữa
- Snapshot lưu: header + items + gems + metal rates + pricing rules tại thời điểm đó

---

## 4. PRICING CHAIN

```
weight_gold_actual_gr × metal_rate × (1 + casting_loss_pct/100)
    = gold_value_usd

gold_value + Σgem.total_price + Σgem.total_setting_fee + fees
    = HPUSA

HPUSA × cif_multiplier (A) = cif_price
cif_price × tag_multiplier (B) = tag_price
cif_price × fr_multiplier  (C) = fr_price
```

---

## 5. 2 VIEWS — INVOICE DETAIL

### JM Form View
- 15 cột flat table (1 row per product)
- SKU JWMold luôn highlight vàng `#FEF3C7`
- Notes "Ba Sao" → đỏ
- Export thẳng ra Excel JM format

### Detail View
- Hiển thị gem sub-rows (expandable)
- Inline edit cho tất cả fields
- Auto-recalculate khi thay đổi
- Realtime sync qua Supabase channel

---

## 6. TECH STACK

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Next.js 14 App Router + TypeScript | Vercel deploy |
| Database | Supabase PostgreSQL | RLS + Realtime + Triggers |
| Auth | Supabase Auth | Email/password |
| Excel | SheetJS (`xlsx`) | Import + Export |
| UI | CSS Variables (luxury cream) | Font Awesome 6 |
| Fonts | Cormorant Garamond + Jost + JetBrains Mono | Google Fonts |

---

## 7. PROJECT STRUCTURE

```
vinvoice/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (dashboard)/layout.tsx          ← Topbar + Nav
│   ├── (dashboard)/invoices/
│   │   ├── page.tsx                    ← Invoice list
│   │   ├── new/page.tsx                ← Create new
│   │   └── [id]/page.tsx               ← Invoice detail (2 views)
│   ├── (dashboard)/admin/
│   │   ├── metal-rates/page.tsx
│   │   ├── pricing-rules/page.tsx
│   │   └── products/page.tsx
│   ├── (dashboard)/import/page.tsx
│   └── api/
│       ├── invoices/route.ts
│       ├── invoices/[id]/route.ts
│       ├── invoices/[id]/status/route.ts
│       ├── invoices/[id]/items/route.ts
│       ├── invoices/[id]/items/[itemId]/route.ts
│       ├── invoices/[id]/items/[itemId]/gems/route.ts
│       ├── metal-rates/route.ts
│       ├── metal-rates/[id]/route.ts
│       ├── pricing-rules/route.ts
│       ├── products/route.ts
│       └── import/excel/route.ts
├── components/
│   ├── shared/                         ← DashboardShell, StatusBadge, ConfirmModal
│   ├── invoice/                        ← JMFormView, DetailView, WorkflowBar
│   └── admin/                          ← MetalRatesTable, PricingRulesTable
├── lib/
│   ├── supabase/server.ts
│   ├── supabase/client.ts
│   └── formulas/                       ← goldValue.ts, hpusa.ts, pricing.ts
├── hooks/
│   └── useInvoiceRealtime.ts
└── types/index.ts
```

---

## 8. SPRINT PLAN

| Sprint | Scope | Duration |
|--------|-------|---------|
| 1 | Auth + Dashboard + Invoice list | 3 ngày |
| 2 | Invoice Detail: JM Form View + Workflow | 4 ngày |
| 3 | Detail View: inline edit + gem breakdown | 4 ngày |
| 4 | Import Excel + Export + Print | 3 ngày |
| 5 | Admin: Metal Rates + Pricing Rules + Products | 3 ngày |
| 6 | Realtime sync + polish + deploy | 2 ngày |

**Total:** ~3 tuần (19 ngày development)

---

## 9. ENVIRONMENT VARIABLES

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...     # Server-only

# App
NEXT_PUBLIC_APP_NAME=V-Invoice
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

---

## 10. KEY RULES

1. **NEVER expose** `SUPABASE_SERVICE_ROLE_KEY` to client
2. **ALWAYS check** `is_locked` before any write operation
3. **Recalculate chain** runs server-side after any field change
4. API routes use `createServiceClient()` (bypasses RLS)
5. `GENERATED ALWAYS AS` columns: đọc từ DB, không tính trong code
6. Status transitions: validate with `ALLOWED_TRANSITIONS` map
7. Locked invoice: return 403 immediately, do not process
