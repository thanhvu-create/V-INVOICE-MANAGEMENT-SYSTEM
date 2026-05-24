# Tech Stack — V-Invoice
> **Version:** 1.0 · **Date:** 2026-05-22

---

## 1. STACK OVERVIEW

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Framework | Next.js App Router | 14 | Server Components + API Routes |
| Language | TypeScript | 5+ | Strict mode |
| Database | Supabase PostgreSQL | Latest | RLS + Realtime + Triggers |
| Auth | Supabase Auth | Latest | Email/password session |
| Excel | SheetJS (`xlsx`) | Latest | Import + Export |
| UI | CSS Variables + FA6 | — | No Tailwind (luxury design system) |
| Fonts | Google Fonts | — | Cormorant Garamond + Jost |
| Deploy | Vercel | — | Edge + Serverless |

---

## 2. NEXT.JS CONFIG

```typescript
// next.config.ts
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
}
```

**App Router structure:**
```
app/
├── (auth)/login/page.tsx
├── (dashboard)/layout.tsx       ← DashboardShell (Topbar + Nav)
├── (dashboard)/page.tsx          ← Dashboard
├── (dashboard)/invoices/
│   ├── page.tsx                  ← Invoice list
│   ├── new/page.tsx              ← Create new
│   └── [id]/
│       ├── page.tsx              ← Invoice detail (2 views)
│       └── print/page.tsx        ← Print page (A4 landscape)
├── (dashboard)/import/page.tsx
└── (dashboard)/admin/
    ├── metal-rates/page.tsx
    ├── pricing-rules/page.tsx
    └── products/page.tsx
```

---

## 3. SUPABASE CLIENTS

```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// ANON client (auth-aware — Server Components)
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: ... } }
  )
}

// SERVICE ROLE (bypass RLS — API Routes only)
export function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}
```

```typescript
// lib/supabase/client.ts (browser)
import { createBrowserClient } from '@supabase/ssr'
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**Rule:** API Routes luôn dùng `createServiceClient()` để bypass RLS.

---

## 4. API ROUTE PATTERN

```typescript
// app/api/[feature]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const db = createServiceClient()
    const result = await db.from('table').select('*')
    return NextResponse.json({ success: true, data: result.data })
  } catch (err) {
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
```

**Response format (chuẩn):**
```typescript
{ success: true,  data: any }       // OK
{ success: false, message: string } // Error
```

---

## 5. ENVIRONMENT VARIABLES

```bash
# .env.local (không commit)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # Server-only — KHÔNG dùng NEXT_PUBLIC_

NEXT_PUBLIC_APP_NAME=V-Invoice
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

---

## 6. SHEETJS (EXCEL)

```typescript
// Import:
import * as XLSX from 'xlsx'

// Parse file:
const wb = XLSX.read(await file.arrayBuffer())
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json<ImportRow>(ws)

// Export:
const ws = XLSX.utils.aoa_to_sheet(data)
XLSX.writeFile(wb, 'Invoice.xlsx')
```

---

## 7. MIDDLEWARE (Auth Guard)

```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Tạo Supabase client để check session
  const supabase = createServerClient(...)
  const { data: { session } } = await supabase.auth.getSession()

  if (!session && !pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (session && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
```

---

## 8. SUPABASE REALTIME (Detail View)

```typescript
// hooks/useInvoiceRealtime.ts
import { createClient } from '@/lib/supabase/client'
import { useEffect } from 'react'

export function useInvoiceRealtime(invoiceId: string, onUpdate: () => void) {
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`invoice:${invoiceId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'invoice_items',
        filter: `invoice_id=eq.${invoiceId}`,
      }, onUpdate)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'item_gem_details',
      }, onUpdate)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [invoiceId, onUpdate])
}
```

---

## 9. TYPESCRIPT TYPES

```typescript
// types/index.ts
export type InvoiceStatus = 'draft' | 'pending_approval' | 'approved' | 'invoiced'
export type UserRole = 'user' | 'manager' | 'admin'
export type MetalType = '18KW' | '18KY' | '14KY' | 'PT950' | 'PT' | '24K' | 'AG' | 'PD'

export interface User {
  id: string
  email: string
  role: UserRole
}

export interface InvoiceHeader {
  id: string
  po_number: string
  mr_number?: string
  status: InvoiceStatus
  is_locked: boolean
  metal_rate_id?: string
  pricing_rule_id?: string
  store?: string
  notes?: string
  created_by: string
  created_at: string
  updated_at: string
  snapshot_at?: string
}

export interface InvoiceItem {
  id: string
  invoice_id: string
  line_no: number
  sku_jwmold: string
  qty_pcs: number
  store?: string
  location_store?: string
  so_mo_code?: string
  vendor_model?: string
  description?: string
  class?: string
  sub_class?: string
  notes?: string
  weight_total_gr?: number
  weight_gold_actual_gr?: number
  weight_no_gem_gr?: number
  metal_type?: string
  gold_value_usd?: number
  labor_fee?: number
  casting_fee?: number
  design_fee?: number
  resin_fee?: number
  misc_fee?: number
  hpusa?: number
  cif_price?: number
  tag_price?: number
  fr_price?: number
}

export interface GemDetail {
  id: string
  invoice_item_id: string
  gem_type?: string
  qty_pcs: number
  weight_ct_before?: number
  weight_ct_after?: number
  unit_price_per_ct?: number
  setting_fee_per_pcs?: number
  // GENERATED ALWAYS:
  weight_gr: number
  total_price: number
  total_setting_fee: number
}

export interface DailyMetalRate {
  id: string
  rate_date: string
  gold_24k?: number
  gold_18kw?: number
  gold_18ky?: number
  gold_14ky?: number
  platinum?: number
  silver?: number
  palladium?: number
}

export interface PricingRule {
  id: string
  name: string
  cif_multiplier: number
  tag_multiplier: number
  fr_multiplier: number
  casting_loss_pct: number
  is_active: boolean
}
```

---

## 10. PACKAGE.JSON

```json
{
  "name": "vinvoice",
  "version": "1.0.0",
  "dependencies": {
    "next": "14.x",
    "@supabase/supabase-js": "^2",
    "@supabase/ssr": "^0.5",
    "xlsx": "^0.18",
    "react": "^18",
    "react-dom": "^18"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18"
  }
}
```

---

## 11. VERCEL DEPLOYMENT

```json
// vercel.json
{}
// (Không cần cấu hình đặc biệt — Next.js 14 auto-detected)
```

**Deployment checklist:**
```
[ ] ENV vars set trong Vercel Dashboard (không commit .env.local)
[ ] SUPABASE_SERVICE_ROLE_KEY: Server-only (không NEXT_PUBLIC_)
[ ] Supabase: Enable Realtime cho invoice_items + item_gem_details
[ ] Supabase: Apply trigger trg_snapshot_invoice
[ ] Supabase: Seed pricing_rules (1 active rule)
[ ] Supabase: Seed daily_metal_rates (today)
[ ] Supabase: Seed bom_products (ít nhất vài SKUs)
[ ] Test: login → create invoice → import → workflow transitions
```
