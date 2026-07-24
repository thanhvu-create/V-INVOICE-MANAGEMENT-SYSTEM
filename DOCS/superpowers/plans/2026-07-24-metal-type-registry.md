# Metal Type Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép người dùng khai báo giá cho các mã kim loại ngoại lệ (SV925, 18KW, 18KY, …); engine định giá tra khớp mã chính xác trước rồi mới rơi về công thức cũ.

**Architecture:** Thêm bảng `metal_types` (registry override). Thêm hàm thuần `resolveMetalPricePerGram()` trong `pricing.ts`: khớp mã trong registry (fixed hoặc dynamic base+surcharge) → không có thì gọi `goldPricePerGram` cũ làm fallback. Nạp registry (live) ở mọi đường recalc; không snapshot vào `invoices`.

**Tech Stack:** Next.js 14 App Router, Supabase Postgres, TypeScript. **Thêm mới:** Vitest (unit test cho formula thuần).

## Global Constraints

- KHÔNG sửa/xoá logic `goldPricePerGram` hiện có — chỉ dùng nó làm fallback.
- KHÔNG ALTER bảng `invoices`; KHÔNG snapshot registry vào invoice (dùng live).
- `code` luôn so khớp & lưu dạng `UPPER(TRIM())`.
- Thêm tham số `registry` phải có default `[]` để giữ backward-compatible (registry rỗng ⇒ hành vi y hệt hiện tại).
- Quyền sửa registry: `manager+` (mẫu route `admin/gem-catalog`, dùng `getAuthContext` + check `['admin','manager']`).
- Spec nguồn: `docs/superpowers/specs/2026-07-24-metal-type-registry-design.md`.

---

## File Structure

**Tạo mới:**
- `vitest.config.ts` — cấu hình test.
- `lib/formulas/pricing.test.ts` — unit test cho resolver + recalc.
- `supabase/metal_types.sql` — migration bảng.
- `lib/metal-types.ts` — `loadActiveMetalTypes(db)` (DB loader, tách khỏi formula thuần).
- `app/api/admin/metal-types/route.ts` — CRUD registry (GET/POST/PATCH/DELETE).
- `components/admin/MetalTypeRegistry.tsx` — UI section "Loại đặc biệt".

**Sửa:**
- `package.json` — thêm vitest + script `test`.
- `lib/formulas/pricing.ts` — `MetalTypeRule`, `resolveMetalPricePerGram`, thêm param `registry` cho `recalcMetal`/`recalcItem`.
- `lib/formulas/recalc-helpers.ts` — nạp registry trong `triggerItemRecalc` + `bulkRecalcInvoice`.
- `app/api/import/route.ts` — nạp registry, truyền vào `recalcItem`.
- `app/api/invoices/[id]/items/route.ts` — nạp registry, truyền vào `recalcItem`.
- `app/api/invoices/[id]/items/[itemId]/route.ts` — nạp registry, truyền vào `recalcMetal`+`recalcItem`.
- `app/api/metal-types/route.ts` — gộp `metal_types.code` vào danh sách dropdown.
- `app/(dashboard)/admin/products/page.tsx` — render `MetalTypeRegistry`, bỏ localStorage custom-karat giả.

---

## Task 1: Vitest setup + resolver `resolveMetalPricePerGram` (TDD)

**Files:**
- Create: `vitest.config.ts`
- Create: `lib/formulas/pricing.test.ts`
- Modify: `package.json`
- Modify: `lib/formulas/pricing.ts`

**Interfaces:**
- Produces: `export interface MetalTypeRule { code: string; price_mode: 'dynamic'|'fixed'; base_kind?: 'karat'|'ag'|'pt'|'pd'|null; karat?: number|null; surcharge_per_gram?: number|null; fixed_per_gram?: number|null; active?: boolean }`
- Produces: `export function resolveMetalPricePerGram(code: string, nvl: NVLSnapshot, registry?: MetalTypeRule[]): number | null`

- [ ] **Step 1: Install vitest**

Run: `npm install -D vitest`
Expected: `vitest` added to `devDependencies`.

- [ ] **Step 2: Add test script to package.json**

Trong `package.json`, thêm 2 dòng vào `"scripts"`:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

- [ ] **Step 4: Write the failing test** — `lib/formulas/pricing.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { resolveMetalPricePerGram, goldPricePerGram, type NVLSnapshot, type MetalTypeRule } from './pricing'

const nvl: NVLSnapshot = {
  spot_gold_24k: 3000, spot_pt: 1000, spot_ag: 30, spot_pd: 900,
  loss_gold: 0.06, loss_pt: 0.17,
  tag_multiplier: 0, fr_multiplier: 0, cif_rate: null,
}

describe('resolveMetalPricePerGram', () => {
  it('fixed mode returns fixed_per_gram directly', () => {
    const reg: MetalTypeRule[] = [{ code: 'SV925', price_mode: 'fixed', fixed_per_gram: 3.2 }]
    expect(resolveMetalPricePerGram('SV925', nvl, reg)).toBe(3.2)
  })

  it('matches code case-insensitively and trimmed', () => {
    const reg: MetalTypeRule[] = [{ code: 'SV925', price_mode: 'fixed', fixed_per_gram: 3.2 }]
    expect(resolveMetalPricePerGram('  sv925 ', nvl, reg)).toBe(3.2)
  })

  it('dynamic karat + surcharge = karat base + surcharge', () => {
    const reg: MetalTypeRule[] = [{ code: '18KW', price_mode: 'dynamic', base_kind: 'karat', karat: 18, surcharge_per_gram: 1.5 }]
    const base = goldPricePerGram('18K', nvl)!
    expect(resolveMetalPricePerGram('18KW', nvl, reg)).toBeCloseTo(base + 1.5, 6)
  })

  it('dynamic ag with 0 surcharge equals AG formula', () => {
    const reg: MetalTypeRule[] = [{ code: 'SV999', price_mode: 'dynamic', base_kind: 'ag', surcharge_per_gram: 0 }]
    expect(resolveMetalPricePerGram('SV999', nvl, reg)).toBeCloseTo(goldPricePerGram('AG', nvl)!, 6)
  })

  it('falls back to goldPricePerGram when no registry match', () => {
    expect(resolveMetalPricePerGram('18K', nvl, [])).toBe(goldPricePerGram('18K', nvl))
  })

  it('unknown code with no override stays null (SV925 without registry)', () => {
    expect(resolveMetalPricePerGram('SV925', nvl, [])).toBeNull()
  })

  it('inactive rule is ignored (fallback used)', () => {
    const reg: MetalTypeRule[] = [{ code: 'SV925', price_mode: 'fixed', fixed_per_gram: 3.2, active: false }]
    expect(resolveMetalPricePerGram('SV925', nvl, reg)).toBeNull()
  })

  it('fixed mode with null price returns null, not 0', () => {
    const reg: MetalTypeRule[] = [{ code: 'X', price_mode: 'fixed', fixed_per_gram: null }]
    expect(resolveMetalPricePerGram('X', nvl, reg)).toBeNull()
  })
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `resolveMetalPricePerGram is not a function` / export không tồn tại.

- [ ] **Step 6: Implement `MetalTypeRule` + `resolveMetalPricePerGram`** trong `lib/formulas/pricing.ts`

Thêm ngay SAU khối `goldPricePerGram` (sau dòng 59), KHÔNG sửa `goldPricePerGram`:
```ts
/**
 * Registry ngoại lệ (metal_types). Override phủ lên goldPricePerGram theo mã chính xác.
 */
export interface MetalTypeRule {
  code:                string
  price_mode:          'dynamic' | 'fixed'
  base_kind?:          'karat' | 'ag' | 'pt' | 'pd' | null
  karat?:              number | null
  surcharge_per_gram?: number | null
  fixed_per_gram?:     number | null
  active?:             boolean
}

/**
 * Giá $/gram cho một mã loại vàng, tra registry TRƯỚC rồi fallback goldPricePerGram.
 * registry rỗng ⇒ y hệt goldPricePerGram (backward compatible).
 */
export function resolveMetalPricePerGram(
  code: string,
  nvl:  NVLSnapshot,
  registry: MetalTypeRule[] = []
): number | null {
  const key  = (code ?? '').trim().toUpperCase()
  const rule = registry.find(r => r.active !== false && r.code.trim().toUpperCase() === key)
  if (rule) {
    if (rule.price_mode === 'fixed') {
      return rule.fixed_per_gram ?? null
    }
    let base: number | null = null
    if      (rule.base_kind === 'karat' && rule.karat) base = goldPricePerGram(`${rule.karat}K`, nvl)
    else if (rule.base_kind === 'ag')                  base = goldPricePerGram('AG', nvl)
    else if (rule.base_kind === 'pt')                  base = goldPricePerGram('PT', nvl)
    else if (rule.base_kind === 'pd')                  base = goldPricePerGram('PD', nvl)
    if (base === null) return null
    return base + (rule.surcharge_per_gram ?? 0)
  }
  return goldPricePerGram(code, nvl)
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 8 test cases xanh.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts lib/formulas/pricing.ts lib/formulas/pricing.test.ts
git commit -m "feat(pricing): add metal_types resolver with vitest"
```

---

## Task 2: Thread `registry` qua `recalcMetal` + `recalcItem` (TDD)

**Files:**
- Modify: `lib/formulas/pricing.ts:136-139` (`recalcMetal`), `:147-190` (`recalcItem`)
- Modify: `lib/formulas/pricing.test.ts` (thêm test)

**Interfaces:**
- Consumes: `resolveMetalPricePerGram`, `MetalTypeRule` (Task 1)
- Produces: `recalcMetal(m, nvl, registry?: MetalTypeRule[])` ; `recalcItem(item, diamonds, nvl, template?, metals?, registry?: MetalTypeRule[])`

- [ ] **Step 1: Write the failing test** — thêm vào cuối `lib/formulas/pricing.test.ts`

```ts
import { recalcMetal, recalcItem } from './pricing'

describe('recalcMetal with registry', () => {
  it('uses fixed override for tien_vang', () => {
    const reg: MetalTypeRule[] = [{ code: 'SV925', price_mode: 'fixed', fixed_per_gram: 3.2 }]
    expect(recalcMetal({ loai_vang: 'SV925', weight_gr: 10 }, nvl, reg).tien_vang).toBeCloseTo(32, 6)
  })
  it('without registry falls back (18K formula)', () => {
    const expected = (goldPricePerGram('18K', nvl)! * 2)
    expect(recalcMetal({ loai_vang: '18K', weight_gr: 2 }, nvl).tien_vang).toBeCloseTo(expected, 6)
  })
})

describe('recalcItem with registry', () => {
  const reg: MetalTypeRule[] = [{ code: 'SV925', price_mode: 'fixed', fixed_per_gram: 3.2 }]
  it('single-metal path applies override', () => {
    const out = recalcItem({ loai_vang: 'SV925', t_pham_co_nvl_da: 10 }, [], nvl, 'CH1', [], reg)
    expect(out.tien_vang).toBeCloseTo(32, 6)
  })
  it('metals[] path applies override', () => {
    const out = recalcItem({}, [], nvl, 'CH1', [{ loai_vang: 'SV925', weight_gr: 10 } as any], reg)
    expect(out.tien_vang).toBeCloseTo(32, 6)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `recalcItem` chưa nhận tham số `registry`; `tien_vang` = 0 (SV925 fallback null).

- [ ] **Step 3: Modify `recalcMetal`** (`lib/formulas/pricing.ts`)

Thay hàm hiện tại:
```ts
export function recalcMetal(m: Partial<InvoiceItemMetal>, nvl: NVLSnapshot, registry: MetalTypeRule[] = []): { tien_vang: number } {
  const gpg = resolveMetalPricePerGram(m.loai_vang ?? '', nvl, registry)
  return { tien_vang: gpg !== null ? (m.weight_gr ?? 0) * gpg : 0 }
}
```

- [ ] **Step 4: Modify `recalcItem` signature + 2 internal calls** (`lib/formulas/pricing.ts`)

Đổi signature thành:
```ts
export function recalcItem(
  item:     Partial<InvoiceProduct>,
  diamonds: InvoiceDiamond[],
  nvl:      NVLSnapshot,
  template: InvoiceTemplate = 'CH1',
  metals:   InvoiceItemMetal[] = [],
  registry: MetalTypeRule[] = []
): Partial<InvoiceProduct> {
```
Trong nhánh `if (metals.length > 0)` đổi:
```ts
    goldValue   = metals.reduce((s, m) => s + recalcMetal(m, nvl, registry).tien_vang, 0)
```
Trong nhánh `else` đổi dòng `const gpg = goldPricePerGram(...)` thành:
```ts
    const gpg   = resolveMetalPricePerGram(item.loai_vang ?? '', nvl, registry)
```
(Giữ nguyên phần còn lại của hàm.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS — tất cả test (Task 1 + Task 2) xanh.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: không lỗi (các caller cũ vẫn hợp lệ nhờ default `[]`).

- [ ] **Step 7: Commit**

```bash
git add lib/formulas/pricing.ts lib/formulas/pricing.test.ts
git commit -m "feat(pricing): thread metal_types registry through recalcMetal/recalcItem"
```

---

## Task 3: Migration bảng `metal_types`

**Files:**
- Create: `supabase/metal_types.sql`

**Interfaces:**
- Produces: bảng `metal_types(id, code UNIQUE, label, price_mode, base_kind, karat, surcharge_per_gram, fixed_per_gram, active, created_at, updated_at)`

- [ ] **Step 1: Create `supabase/metal_types.sql`**

```sql
-- Metal Type Registry: override định giá theo mã chính xác (SV925, 18KW, ...).
-- An toàn chạy nhiều lần.
CREATE TABLE IF NOT EXISTS metal_types (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT NOT NULL UNIQUE,
  label               TEXT,
  price_mode          TEXT NOT NULL CHECK (price_mode IN ('dynamic','fixed')),
  base_kind           TEXT CHECK (base_kind IN ('karat','ag','pt','pd')),
  karat               INT,
  surcharge_per_gram  NUMERIC DEFAULT 0,
  fixed_per_gram      NUMERIC,
  active              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Chạy migration trên Supabase**

Chạy nội dung file qua cơ chế trong memory `project_db_access.md` (Supabase CLI / REST SQL). KHÔNG seed data row (theo spec §10).

- [ ] **Step 3: Verify bảng tồn tại**

Chạy: `SELECT count(*) FROM metal_types;`
Expected: trả `0` (bảng tồn tại, rỗng).

- [ ] **Step 4: Commit**

```bash
git add supabase/metal_types.sql
git commit -m "feat(db): add metal_types registry table"
```

---

## Task 4: DB loader `loadActiveMetalTypes`

**Files:**
- Create: `lib/metal-types.ts`

**Interfaces:**
- Consumes: `MetalTypeRule` (Task 1)
- Produces: `export async function loadActiveMetalTypes(db): Promise<MetalTypeRule[]>`

- [ ] **Step 1: Create `lib/metal-types.ts`**

```ts
import { createServiceClient } from '@/lib/supabase/server'
import type { MetalTypeRule } from '@/lib/formulas/pricing'

type DB = ReturnType<typeof createServiceClient>

// Nạp các loại đặc biệt đang active để đưa vào pipeline định giá.
export async function loadActiveMetalTypes(db: DB): Promise<MetalTypeRule[]> {
  const { data } = await db
    .from('metal_types')
    .select('code, price_mode, base_kind, karat, surcharge_per_gram, fixed_per_gram, active')
    .eq('active', true)
  return (data ?? []) as MetalTypeRule[]
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: không lỗi.

- [ ] **Step 3: Commit**

```bash
git add lib/metal-types.ts
git commit -m "feat: add loadActiveMetalTypes DB loader"
```

---

## Task 5: Nạp registry vào mọi đường recalc

**Files:**
- Modify: `lib/formulas/recalc-helpers.ts` (`triggerItemRecalc`, `bulkRecalcInvoice`)
- Modify: `app/api/import/route.ts:122`
- Modify: `app/api/invoices/[id]/items/route.ts:105`
- Modify: `app/api/invoices/[id]/items/[itemId]/route.ts:168,175`

**Interfaces:**
- Consumes: `loadActiveMetalTypes` (Task 4); `recalcMetal`/`recalcItem` với param `registry` (Task 2)

- [ ] **Step 1: `recalc-helpers.ts` — import loader**

Thêm import đầu file:
```ts
import { loadActiveMetalTypes } from '@/lib/metal-types'
```

- [ ] **Step 2: `triggerItemRecalc` — nạp + truyền registry**

Sau dòng `const nvl = nvlFromInvoice(invoice)` thêm:
```ts
  const registry = await loadActiveMetalTypes(db)
```
Đổi dòng metal:
```ts
  const metalList = (metals ?? []).map(m => ({ ...m, ...recalcMetal(m, nvl, registry) }))
```
Đổi dòng item:
```ts
  const updates = recalcItem(item, cleanGems as any, nvl, template, metalList as any, registry)
```

- [ ] **Step 3: `bulkRecalcInvoice` — nạp + truyền registry**

Sau dòng `const nvl = nvlFromInvoice(invoice)` (trong `bulkRecalcInvoice`) thêm:
```ts
  const registry = await loadActiveMetalTypes(db)
```
Đổi dòng metal trong vòng lặp:
```ts
      const derived = recalcMetal(m, nvl, registry)
```
Đổi dòng item:
```ts
    const updates = recalcItem(item, recalcedGems, nvl, template, recalcedMetals as any, registry)
```

- [ ] **Step 4: `app/api/import/route.ts` — nạp + truyền**

Thêm import:
```ts
import { loadActiveMetalTypes } from '@/lib/metal-types'
```
Sau `const nvl = nvlFromInvoice(invoice)` (dòng ~50) thêm:
```ts
    const registry = await loadActiveMetalTypes(db)
```
Đổi dòng ~122:
```ts
      ...recalcItem(row, [], nvl, template, [], registry),
```

- [ ] **Step 5: `app/api/invoices/[id]/items/route.ts` — nạp + truyền**

Thêm import `loadActiveMetalTypes`. Trước dòng ~105 `const derived = recalcItem(...)` nạp registry (sau khi có `nvl`):
```ts
    const registry = await loadActiveMetalTypes(db)
```
Đổi:
```ts
    const derived  = recalcItem(baseRow, [], nvl, template, [], registry)
```

- [ ] **Step 6: `app/api/invoices/[id]/items/[itemId]/route.ts` — nạp + truyền**

Thêm import `loadActiveMetalTypes`. Sau khi có `nvl` (trước dòng ~168) nạp:
```ts
      const registry = await loadActiveMetalTypes(db)
```
Đổi dòng ~168:
```ts
      const metalList = (metals ?? []).map(m => ({ ...m, ...recalcMetal(m, nvl, registry) }))
```
Đổi dòng ~175:
```ts
      const recalc = recalcItem(item, cleanGems as any, nvl, template, metalList as any, registry)
```

- [ ] **Step 7: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: build thành công, không lỗi type.

- [ ] **Step 8: Commit**

```bash
git add lib/formulas/recalc-helpers.ts app/api/import/route.ts "app/api/invoices/[id]/items/route.ts" "app/api/invoices/[id]/items/[itemId]/route.ts"
git commit -m "feat: load metal_types registry in all recalc paths"
```

---

## Task 6: Admin CRUD `/api/admin/metal-types`

**Files:**
- Create: `app/api/admin/metal-types/route.ts`

**Interfaces:**
- Produces: `GET` (list rows), `POST` (create), `PATCH` (update by body.id), `DELETE` (by ?id=) — shape `{ success, data? , message? }`

- [ ] **Step 1: Create `app/api/admin/metal-types/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'

function canEdit(role: string) { return ['admin', 'manager'].includes(role) }

// Chuẩn hoá + validate body cho create/update. Trả { error } hoặc { row }.
function buildRow(body: any): { error?: string; row?: Record<string, unknown> } {
  const code = body.code?.trim().toUpperCase()
  if (!code) return { error: 'code required' }
  const mode = body.price_mode
  if (!['dynamic', 'fixed'].includes(mode)) return { error: 'price_mode must be dynamic or fixed' }

  const row: Record<string, unknown> = {
    code,
    label: body.label?.trim() || null,
    price_mode: mode,
  }
  if (mode === 'dynamic') {
    const base = body.base_kind
    if (!['karat', 'ag', 'pt', 'pd'].includes(base)) return { error: 'base_kind invalid' }
    if (base === 'karat' && body.karat == null) return { error: 'karat required for base_kind=karat' }
    row.base_kind = base
    row.karat = base === 'karat' ? parseInt(body.karat) : null
    row.surcharge_per_gram = body.surcharge_per_gram != null ? parseFloat(body.surcharge_per_gram) : 0
    row.fixed_per_gram = null
  } else {
    if (body.fixed_per_gram == null || body.fixed_per_gram === '') return { error: 'fixed_per_gram required' }
    row.fixed_per_gram = parseFloat(body.fixed_per_gram)
    row.base_kind = null
    row.karat = null
    row.surcharge_per_gram = 0
  }
  return { row }
}

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  const db = createServiceClient()
  const { data, error } = await db.from('metal_types').select('*').order('code')
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  if (!canEdit(ctx.role)) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })

  const { error: verr, row } = buildRow(await req.json())
  if (verr) return NextResponse.json({ success: false, message: verr }, { status: 400 })

  const db = createServiceClient()
  const { data, error } = await db.from('metal_types').insert(row!).select().single()
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 409 })
  return NextResponse.json({ success: true, data })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  if (!canEdit(ctx.role)) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  if (!body.id) return NextResponse.json({ success: false, message: 'id required' }, { status: 400 })
  const { error: verr, row } = buildRow(body)
  if (verr) return NextResponse.json({ success: false, message: verr }, { status: 400 })

  const db = createServiceClient()
  const { data, error } = await db.from('metal_types')
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq('id', body.id).select().single()
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 409 })
  return NextResponse.json({ success: true, data })
}

export async function DELETE(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  if (!canEdit(ctx.role)) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ success: false, message: 'id required' }, { status: 400 })
  const db = createServiceClient()
  const { error } = await db.from('metal_types').delete().eq('id', id)
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: route xuất hiện trong build output, không lỗi.

- [ ] **Step 3: Manual smoke (dev server, đăng nhập manager+)**

Chạy `npm run dev`, sau đó trong DevTools console của app:
```js
await fetch('/api/admin/metal-types', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ code:'SV925', price_mode:'fixed', fixed_per_gram: 3.2 })}).then(r=>r.json())
```
Expected: `{ success: true, data: { code: 'SV925', ... } }`. Sau đó `GET` trả về dòng vừa tạo.

- [ ] **Step 4: Commit**

```bash
git add "app/api/admin/metal-types/route.ts"
git commit -m "feat(api): CRUD /api/admin/metal-types (manager+)"
```

---

## Task 7: Gộp registry codes vào dropdown feed `/api/metal-types`

**Files:**
- Modify: `app/api/metal-types/route.ts`

**Interfaces:**
- Consumes: bảng `metal_types` (Task 3)
- Produces: giữ shape `{ success, data: string[] }` (backward compatible với ItemCard/AddItemModal)

- [ ] **Step 1: Đọc thêm registry codes trong GET**

Trong `app/api/metal-types/route.ts`, sau khi tính mảng `used` và TRƯỚC khi `const merged = [...BASE]`, thêm truy vấn registry:
```ts
  const { data: mtData } = await db
    .from('metal_types')
    .select('code')
    .eq('active', true)
  const registryCodes: string[] = (mtData ?? [])
    .map((r: any) => r.code?.trim().toUpperCase())
    .filter(Boolean)
```
Sau `const merged = [...BASE]`, thêm gộp registry trước phần gộp `used`:
```ts
  registryCodes.forEach(v => { if (!merged.includes(v)) merged.push(v) })
```
(Giữ nguyên vòng gộp `used` phía sau.)

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: không lỗi.

- [ ] **Step 3: Manual smoke**

Với dòng `SV925` đã tạo ở Task 6, trong console app:
```js
await fetch('/api/metal-types').then(r=>r.json())
```
Expected: `data` chứa `'SV925'`.

- [ ] **Step 4: Commit**

```bash
git add "app/api/metal-types/route.ts"
git commit -m "feat(api): merge metal_types codes into dropdown feed"
```

---

## Task 8: Component `MetalTypeRegistry`

**Files:**
- Create: `components/admin/MetalTypeRegistry.tsx`

**Interfaces:**
- Consumes: `/api/admin/metal-types` (Task 6); `resolveMetalPricePerGram`, `NVLSnapshot`, `MetalTypeRule` (Task 1); `AdminModal` + styles từ `@/components/admin/AdminModal`; `toast` từ `@/components/ui/Toast`
- Produces: `export function MetalTypeRegistry({ nvlSnap, canEdit }: { nvlSnap: NVLSnapshot | null; canEdit: boolean })`

- [ ] **Step 1: Create `components/admin/MetalTypeRegistry.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { AdminModal, fieldStyle, labelStyle, inputStyle, btnPrimary, btnSecondary } from '@/components/admin/AdminModal'
import { toast } from '@/components/ui/Toast'
import { resolveMetalPricePerGram, type NVLSnapshot, type MetalTypeRule } from '@/lib/formulas/pricing'

interface Row extends MetalTypeRule {
  id: string
  label: string | null
}

const EMPTY: Record<string, string> = {
  code: '', label: '', price_mode: 'fixed',
  base_kind: 'karat', karat: '', surcharge_per_gram: '0', fixed_per_gram: '',
}

const th: React.CSSProperties = {
  padding: '0.45rem 0.75rem', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
  fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase',
  color: 'var(--text-secondary)', borderBottom: '2px solid var(--border-base)',
  background: 'var(--bg-base)', whiteSpace: 'nowrap', textAlign: 'left',
}
const td: React.CSSProperties = {
  padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)',
  fontSize: 'var(--text-sm)', verticalAlign: 'middle',
}

function describe(r: Row): string {
  if (r.price_mode === 'fixed') return 'cố định $/gram'
  const base = r.base_kind === 'karat' ? `${r.karat}K` : (r.base_kind ?? '').toUpperCase()
  const s = r.surcharge_per_gram ?? 0
  return s ? `${base} ${s > 0 ? '+' : ''}${s}` : base
}

export function MetalTypeRegistry({ nvlSnap, canEdit }: { nvlSnap: NVLSnapshot | null; canEdit: boolean }) {
  const [rows,    setRows]    = useState<Row[]>([])
  const [modal,   setModal]   = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Row | null>(null)
  const [form,    setForm]    = useState<Record<string, string>>(EMPTY)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  async function fetchRows() {
    const res = await fetch('/api/admin/metal-types')
    const json = await res.json()
    if (json.success) setRows(json.data)
  }
  useEffect(() => { fetchRows() }, [])

  function openAdd() { setForm(EMPTY); setEditing(null); setError(''); setModal('add') }
  function openEdit(r: Row) {
    setForm({
      code: r.code, label: r.label ?? '', price_mode: r.price_mode,
      base_kind: r.base_kind ?? 'karat',
      karat: r.karat != null ? String(r.karat) : '',
      surcharge_per_gram: r.surcharge_per_gram != null ? String(r.surcharge_per_gram) : '0',
      fixed_per_gram: r.fixed_per_gram != null ? String(r.fixed_per_gram) : '',
    })
    setEditing(r); setError(''); setModal('edit')
  }
  function close() { setModal(null); setEditing(null) }

  async function save() {
    setSaving(true); setError('')
    const body: Record<string, unknown> = {
      code: form.code.trim().toUpperCase(),
      label: form.label.trim() || null,
      price_mode: form.price_mode,
    }
    if (form.price_mode === 'dynamic') {
      body.base_kind = form.base_kind
      body.karat = form.base_kind === 'karat' && form.karat !== '' ? parseInt(form.karat) : null
      body.surcharge_per_gram = form.surcharge_per_gram !== '' ? parseFloat(form.surcharge_per_gram) : 0
    } else {
      body.fixed_per_gram = form.fixed_per_gram !== '' ? parseFloat(form.fixed_per_gram) : null
    }
    if (modal === 'edit') body.id = editing!.id
    const res = await fetch('/api/admin/metal-types', {
      method: modal === 'edit' ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!json.success) { setError(json.message); setSaving(false); return }
    toast(modal === 'edit' ? 'Đã cập nhật.' : 'Đã thêm loại đặc biệt.', 'success')
    close(); fetchRows(); setSaving(false)
  }

  async function remove(r: Row) {
    if (!confirm(`Xóa loại "${r.code}"?`)) return
    const res = await fetch(`/api/admin/metal-types?id=${r.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!json.success) toast(json.message || 'Xóa thất bại.', 'error')
    else { toast('Đã xóa.', 'success'); fetchRows() }
  }

  return (
    <div style={{ marginTop: '2.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            Loại đặc biệt (Override)
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 3 }}>
            Mã khớp chính xác được ưu tiên hơn công thức mặc định · $/gram theo LATEST spot
          </div>
        </div>
        {canEdit && <button onClick={openAdd} style={{ ...btnPrimary, padding: '0.35rem 0.9rem', fontSize: 'var(--text-xs)' }}>+ Thêm loại đặc biệt</button>}
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--border-light)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr>
              {['Mã', 'Tên', 'Cách tính', '$/gram', 'Active', ''].map((h, i) => (
                <th key={i} style={{ ...th, textAlign: i === 3 ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const price = nvlSnap ? resolveMetalPricePerGram(r.code, nvlSnap, rows) : null
              return (
                <tr key={r.id}>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{r.code}</td>
                  <td style={{ ...td, color: 'var(--text-muted)' }}>{r.label ?? '—'}</td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{describe(r)}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{price != null ? `$${price.toFixed(4)}` : '—'}</td>
                  <td style={{ ...td }}>{r.active === false ? '✕' : '✓'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {canEdit && <>
                      <button onClick={() => openEdit(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', marginRight: 8 }} title="Edit"><i className="fa-solid fa-pen" /></button>
                      <button onClick={() => remove(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)' }} title="Delete"><i className="fa-solid fa-trash" /></button>
                    </>}
                  </td>
                </tr>
              )
            })}
            {!rows.length && (
              <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>
                Chưa có loại đặc biệt. Thêm SV925 / 18KW… để định giá chính xác khi import.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <AdminModal title={modal === 'add' ? 'Thêm loại đặc biệt' : 'Sửa loại đặc biệt'} onClose={close} width={480}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Mã (code)</label>
              <input style={inputStyle} placeholder="SV925" value={form.code}
                onChange={e => setForm(v => ({ ...v, code: e.target.value }))} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Tên (label)</label>
              <input style={inputStyle} placeholder="Silver 925" value={form.label}
                onChange={e => setForm(v => ({ ...v, label: e.target.value }))} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Kiểu giá</label>
              <select style={inputStyle} value={form.price_mode}
                onChange={e => setForm(v => ({ ...v, price_mode: e.target.value }))}>
                <option value="fixed">Cố định $/gram</option>
                <option value="dynamic">Theo công thức (động)</option>
              </select>
            </div>
            {form.price_mode === 'fixed' ? (
              <div style={fieldStyle}>
                <label style={labelStyle}>Giá $/gram</label>
                <input type="number" step="0.01" min="0" style={inputStyle} placeholder="3.20" value={form.fixed_per_gram}
                  onChange={e => setForm(v => ({ ...v, fixed_per_gram: e.target.value }))} />
              </div>
            ) : (<>
              <div style={fieldStyle}>
                <label style={labelStyle}>Gốc</label>
                <select style={inputStyle} value={form.base_kind}
                  onChange={e => setForm(v => ({ ...v, base_kind: e.target.value }))}>
                  <option value="karat">Tuổi vàng (karat)</option>
                  <option value="ag">AG (bạc)</option>
                  <option value="pt">PT (platinum)</option>
                  <option value="pd">PD (palladium)</option>
                </select>
              </div>
              {form.base_kind === 'karat' && (
                <div style={fieldStyle}>
                  <label style={labelStyle}>Karat</label>
                  <input type="number" step="1" min="1" max="24" style={inputStyle} placeholder="18" value={form.karat}
                    onChange={e => setForm(v => ({ ...v, karat: e.target.value }))} />
                </div>
              )}
              <div style={fieldStyle}>
                <label style={labelStyle}>Phụ phí $/gram (±)</label>
                <input type="number" step="0.01" style={inputStyle} placeholder="0" value={form.surcharge_per_gram}
                  onChange={e => setForm(v => ({ ...v, surcharge_per_gram: e.target.value }))} />
              </div>
            </>)}
          </div>
          {error && <p style={{ color: 'var(--color-danger)', fontSize: 'var(--text-sm)', marginBottom: '1rem' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
            <button onClick={close} style={btnSecondary}>Hủy</button>
          </div>
        </AdminModal>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: không lỗi (component chưa được render ở đâu, chỉ kiểm type).

- [ ] **Step 3: Commit**

```bash
git add components/admin/MetalTypeRegistry.tsx
git commit -m "feat(ui): MetalTypeRegistry section component"
```

---

## Task 9: Gắn `MetalTypeRegistry` vào NVL Prices + bỏ custom-karat giả

**Files:**
- Modify: `app/(dashboard)/admin/products/page.tsx`

**Interfaces:**
- Consumes: `MetalTypeRegistry` (Task 8)

- [ ] **Step 1: Import component**

Thêm import:
```ts
import { MetalTypeRegistry } from '@/components/admin/MetalTypeRegistry'
```

- [ ] **Step 2: Xóa cơ chế localStorage custom-karat giả**

Xóa các phần sau trong `page.tsx`:
- Block `// ─── Custom karat localStorage ───` : hằng `LS_KEY`, hàm `loadCustomKarats`, `saveCustomKarats` (dòng ~39-44).
- State + ref: `customKarats`, `setCustomKarats`, `newKarat`, `setNewKarat`, `newKaratRef` (dòng ~125-127).
- `useEffect(() => { setCustomKarats(loadCustomKarats()) }, [])` (dòng ~129-131).
- Hàm `addKarat` và `removeKarat` (dòng ~170-186).
- Khối JSX "Add custom karat" (ô input + nút "+ Thêm karat") trong sub-header phần "Giá $/gram theo loại vàng" (dòng ~339-358).
- Thay `allGoldKarats` / `allMetalKarats` (dòng ~202-203) bằng dùng trực tiếp `GOLD_KARATS` / `METAL_KARATS`; bỏ prop `isCustom`/`onRemove` khi render `KaratCard` (đặt `isCustom={false}`).

- [ ] **Step 3: Render `MetalTypeRegistry`**

Ngay TRƯỚC block `{/* ── Modal ── */}` (cuối `return`), thêm:
```tsx
      <MetalTypeRegistry nvlSnap={nvlSnap} canEdit={canEdit} />
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: không lỗi; không còn tham chiếu `customKarats`/`addKarat`/`LS_KEY`.

- [ ] **Step 5: Manual functional check (end-to-end)**

Chạy `npm run dev`, đăng nhập `manager+`:
1. Vào `/admin/products` (NVL Prices) → thấy section "Loại đặc biệt".
2. Thêm `SV925` (fixed, $/gram = 3.20) → dòng hiện `$3.2000`.
3. Thêm `18KW` (dynamic, karat=18, phụ phí=1.50) → $/gram = giá 18K + 1.50.
4. Tạo/mở 1 invoice draft, thêm item `loai_vang = SV925`, weight → `tien_vang` > 0 (không còn $0).
5. Dropdown loại vàng khi thêm item có chứa `SV925`.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/admin/products/page.tsx"
git commit -m "feat(ui): wire MetalTypeRegistry into NVL Prices, remove fake custom-karat"
```

---

## Self-Review

**Spec coverage (spec §→task):**
- §3 bảng `metal_types` → Task 3 ✓
- §4 resolver + fallback → Task 1; thread vào recalc → Task 2 ✓
- §5 recalc plumbing (helpers + 3 direct callers: import, items POST, items PATCH) → Task 5 ✓ (spec §5 chỉ nêu import+helpers; plan bổ sung đủ 2 route trực tiếp còn lại)
- §6 API dropdown GET giữ shape + CRUD admin → Task 7 + Task 6 ✓
- §7 không snapshot vào invoices → không có task ALTER invoices; registry live qua Task 5 ✓
- §8 UI section + bỏ custom-karat giả → Task 8 + Task 9 ✓
- §9 quyền manager+ → Task 6 (`canEdit`) ✓
- §11 edge cases (validate, inactive, case-insensitive, fixed null→null) → phủ bởi test Task 1 + validate Task 6 ✓

**Placeholder scan:** không có TBD/TODO; mọi step có code/command cụ thể.

**Type consistency:** `MetalTypeRule` (Task 1) dùng nhất quán ở `loadActiveMetalTypes` (Task 4), `recalcMetal`/`recalcItem` (Task 2), `MetalTypeRegistry` (Task 8). Chữ ký `recalcItem(item, diamonds, nvl, template, metals, registry)` khớp giữa Task 2 và các caller Task 5. Field DB (`code, price_mode, base_kind, karat, surcharge_per_gram, fixed_per_gram, active`) khớp giữa migration (Task 3), loader (Task 4), CRUD (Task 6), component (Task 8).

**Ghi chú nợ kỹ thuật (ngoài phạm vi, spec §13):** `JMEditableCell.tsx` METAL_TYPES vẫn static — không nhận registry lần này.
