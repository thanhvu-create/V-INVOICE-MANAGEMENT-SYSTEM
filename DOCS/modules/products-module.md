# Products Module — SKU Catalog (bom_products)

> **Phạm vi:** Admin page `/admin/products` + API `/api/products`
> **Bảng chính:** `bom_products` — danh mục SKU, auto-copy fees khi import invoice items
> **Vai trò:** Admin quản lý CRUD; Import engine lookup SKU validation + fee defaults

---

## 1. DATABASE SCHEMA

```sql
CREATE TABLE bom_products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_jwmold    TEXT NOT NULL UNIQUE,   -- Mã SKU chính, lookup key
  description   TEXT,                   -- Mô tả sản phẩm
  class         TEXT,                   -- Phân loại chính (VD: RING, PEND, BRAC)
  sub_class     TEXT,                   -- Phân loại con (VD: SOLITAIRE, ETERNITY)
  metal_type    TEXT,                   -- Kim loại mặc định (18KW, 18KY, 14KY, ...)
  labor_fee     NUMERIC(12,4) DEFAULT 0,    -- USD — phí nhân công
  casting_fee   NUMERIC(12,4) DEFAULT 0,    -- USD — phí đúc
  design_fee    NUMERIC(12,4) DEFAULT 0,    -- USD — phí thiết kế
  resin_fee     NUMERIC(12,4) DEFAULT 0,    -- USD — phí resin/mẫu
  misc_fee      NUMERIC(12,4) DEFAULT 0,    -- USD — phí khác
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bom_products_sku ON bom_products (sku_jwmold);
CREATE INDEX idx_bom_products_class ON bom_products (class, sub_class);
```

**Tổng phí per SKU (tham chiếu):**
```sql
-- Computed khi cần display (không stored):
total_fees = labor_fee + casting_fee + design_fee + resin_fee + misc_fee
```

---

## 2. VAI TRÒ TRONG HỆ THỐNG

### 2.1 Import Validation

```typescript
// Khi import JM Excel → validate SKU:
// 1. Collect tất cả SKU từ Excel (col C)
// 2. Batch query bom_products
// 3. SKU không tồn tại → error row (không block valid rows)

const { data: products } = await db
  .from('bom_products')
  .select('sku_jwmold, labor_fee, casting_fee, design_fee, resin_fee, misc_fee, description')
  .in('sku_jwmold', skus)

const productMap = Object.fromEntries(products.map(p => [p.sku_jwmold, p]))
```

### 2.2 Fee Auto-Copy khi Import

```typescript
// Khi INSERT invoice_items từ import:
const item = {
  sku_jwmold:   row.sku,
  description:  row.description || productMap[row.sku]?.description || '',
  // Fees auto-copy từ bom_products:
  labor_fee:    productMap[row.sku]?.labor_fee   ?? 0,
  casting_fee:  productMap[row.sku]?.casting_fee ?? 0,
  design_fee:   productMap[row.sku]?.design_fee  ?? 0,
  resin_fee:    productMap[row.sku]?.resin_fee   ?? 0,
  misc_fee:     productMap[row.sku]?.misc_fee    ?? 0,
}
// Fees có thể edit lại từng item sau import nếu cần
```

### 2.3 Lookup API cho Client

```typescript
// Dùng bởi import page khi validate trước khi gọi POST /api/import:
// GET /api/products?skus=SKU1,SKU2,SKU3
// → trả về danh sách SKU valid để client check

// Dùng bởi add item manually trong invoice detail:
// GET /api/products?search=RING → tìm kiếm SKU/description
```

---

## 3. API ENDPOINTS

### GET /api/products

```typescript
// Query params:
// ?search=      — tìm theo sku_jwmold hoặc description (ilike)
// ?skus=        — lookup nhiều SKU cụ thể (comma-separated)
// ?class=       — filter theo class
// ?page=        — pagination (default 1)
// ?limit=       — rows per page (default 50)
// ?active=true  — filter is_active (default: tất cả)

export async function GET(req: NextRequest) {
  const db = createServiceClient()
  const { searchParams } = new URL(req.url)

  const search  = searchParams.get('search')
  const skusRaw = searchParams.get('skus')
  const cls     = searchParams.get('class')
  const page    = parseInt(searchParams.get('page') || '1')
  const limit   = parseInt(searchParams.get('limit') || '50')
  const offset  = (page - 1) * limit

  // Mode 1: lookup by specific SKUs (batch)
  if (skusRaw) {
    const skus = skusRaw.split(',').map(s => s.trim()).filter(Boolean)
    const { data } = await db
      .from('bom_products')
      .select('sku_jwmold, description, labor_fee, casting_fee, design_fee, resin_fee, misc_fee')
      .in('sku_jwmold', skus)
      .eq('is_active', true)
    return NextResponse.json({ success: true, data })
  }

  // Mode 2: search/filter list
  let query = db.from('bom_products')
    .select('*', { count: 'exact' })
    .order('sku_jwmold', { ascending: true })
    .range(offset, offset + limit - 1)

  if (search) {
    query = query.or(`sku_jwmold.ilike.%${search}%,description.ilike.%${search}%`)
  }
  if (cls) query = query.eq('class', cls)

  const { data, count } = await query
  return NextResponse.json({ success: true, data, total: count })
}
```

### POST /api/products

```typescript
// Body: ProductFormData (xem section 6)
// Validation:
// 1. sku_jwmold required + unique check
// 2. Tất cả fees >= 0

export async function POST(req: NextRequest) {
  const db = createServiceClient()
  const body = await req.json()

  // Validate SKU unique
  const { data: existing } = await db
    .from('bom_products')
    .select('id')
    .eq('sku_jwmold', body.sku_jwmold.trim().toUpperCase())
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { success: false, message: `SKU "${body.sku_jwmold}" already exists.` },
      { status: 409 }
    )
  }

  const { data, error } = await db.from('bom_products').insert({
    sku_jwmold:   body.sku_jwmold.trim().toUpperCase(),
    description:  body.description?.trim() || null,
    class:        body.class?.trim() || null,
    sub_class:    body.sub_class?.trim() || null,
    metal_type:   body.metal_type?.trim() || null,
    labor_fee:    parseOrZero(body.labor_fee),
    casting_fee:  parseOrZero(body.casting_fee),
    design_fee:   parseOrZero(body.design_fee),
    resin_fee:    parseOrZero(body.resin_fee),
    misc_fee:     parseOrZero(body.misc_fee),
    is_active:    body.is_active ?? true,
  }).select().single()

  if (error) throw error
  return NextResponse.json({ success: true, data })
}
```

### PATCH /api/products/[id]

```typescript
// Cập nhật SKU product
// KHÔNG cho đổi sku_jwmold (primary lookup key)
// → Nếu cần đổi SKU: delete rồi create mới

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const db = createServiceClient()
  const body = await req.json()
  const { id } = params

  // Check tồn tại
  const { data: existing } = await db
    .from('bom_products').select('id').eq('id', id).maybeSingle()
  if (!existing) {
    return NextResponse.json({ success: false, message: 'Product not found.' }, { status: 404 })
  }

  const { data, error } = await db.from('bom_products').update({
    description: body.description?.trim() || null,
    class:       body.class?.trim() || null,
    sub_class:   body.sub_class?.trim() || null,
    metal_type:  body.metal_type?.trim() || null,
    labor_fee:   parseOrZero(body.labor_fee),
    casting_fee: parseOrZero(body.casting_fee),
    design_fee:  parseOrZero(body.design_fee),
    resin_fee:   parseOrZero(body.resin_fee),
    misc_fee:    parseOrZero(body.misc_fee),
    is_active:   body.is_active,
    updated_at:  new Date().toISOString(),
  }).eq('id', id).select().single()

  if (error) throw error
  return NextResponse.json({ success: true, data })
}
```

### DELETE /api/products/[id]

```typescript
// CRITICAL: Check FK reference trong invoice_items trước khi xóa

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const db = createServiceClient()
  const { id } = params

  // Load product để lấy sku
  const { data: product } = await db
    .from('bom_products').select('id, sku_jwmold').eq('id', id).maybeSingle()
  if (!product) {
    return NextResponse.json({ success: false, message: 'Product not found.' }, { status: 404 })
  }

  // Check FK references
  const { count } = await db
    .from('invoice_items')
    .select('id', { count: 'exact', head: true })
    .eq('sku_jwmold', product.sku_jwmold)

  if (count && count > 0) {
    return NextResponse.json({
      success: false,
      message: `Cannot delete: SKU "${product.sku_jwmold}" is used in ${count} invoice item(s).`
    }, { status: 409 })
  }

  await db.from('bom_products').delete().eq('id', id)
  return NextResponse.json({ success: true })
}
```

### GET /api/products/classes

```typescript
// Lấy danh sách class/sub_class duy nhất cho dropdown filter
export async function GET() {
  const db = createServiceClient()
  const { data } = await db
    .from('bom_products')
    .select('class, sub_class')
    .not('class', 'is', null)
    .order('class')

  // Deduplicate
  const classMap = new Map<string, Set<string>>()
  for (const row of data ?? []) {
    if (!row.class) continue
    if (!classMap.has(row.class)) classMap.set(row.class, new Set())
    if (row.sub_class) classMap.get(row.class)!.add(row.sub_class)
  }

  const classes = Array.from(classMap.entries()).map(([cls, subs]) => ({
    class: cls,
    sub_classes: Array.from(subs).sort(),
  }))

  return NextResponse.json({ success: true, data: classes })
}
```

---

## 4. HELPER FUNCTIONS

```typescript
function parseOrZero(value: unknown): number {
  const n = parseFloat(String(value || '0'))
  return isNaN(n) || n < 0 ? 0 : n
}

// Format display
const formatFee = (v: number | null | undefined): string =>
  v != null ? `$${Number(v).toFixed(2)}` : '$0.00'

const formatTotalFees = (product: BOMProduct): string => {
  const total = (product.labor_fee ?? 0)
    + (product.casting_fee ?? 0)
    + (product.design_fee ?? 0)
    + (product.resin_fee ?? 0)
    + (product.misc_fee ?? 0)
  return `$${total.toFixed(2)}`
}
```

---

## 5. ADMIN PAGE UI

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│ PAGE HEADER: "Products / SKU Catalog" (serif h1)             │
│ Subtitle: "Manage SKU catalog and default fee settings"      │
├──────────────────────────────────────────────────────────────┤
│ [+ Add Product]        [🔍 Search SKU / Description...]      │
│                        [Class: All ▼]  [Status: Active ▼]   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ TABLE                                                │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  [Pagination]           Showing X–Y of Z products           │
└──────────────────────────────────────────────────────────────┘
```

### Table Columns

| Column | Width | Format | Notes |
|--------|-------|--------|-------|
| SKU | 140px | `font-mono`, bold | Primary key, uppercase |
| Description | 200px | text | Truncate 40 chars |
| Class | 100px | badge | |
| Sub Class | 100px | text | |
| Metal Type | 80px | badge | |
| Labor | 80px | `$X.XX` | font-mono, right-align |
| Casting | 80px | `$X.XX` | font-mono, right-align |
| Design | 80px | `$X.XX` | font-mono, right-align |
| Resin | 80px | `$X.XX` | font-mono, right-align |
| Misc | 80px | `$X.XX` | font-mono, right-align |
| Total Fees | 90px | `$X.XX` | font-mono, bold, right-align |
| Status | 70px | badge | Active / Inactive |
| Actions | 100px | Edit / Delete | Delete disabled if referenced |

### SKU Cell Style

```tsx
<td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.05em' }}>
  {product.sku_jwmold}
</td>
```

### Fee Cells Style

```tsx
// Highlight nếu fee > 0
<td style={{
  fontFamily: 'var(--font-mono)',
  textAlign: 'right',
  color: fee > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
}}>
  {formatFee(fee)}
</td>
```

### Status Badge

```tsx
<span style={{
  border: `1px solid ${product.is_active ? 'var(--color-success)' : 'var(--border-base)'}`,
  color: product.is_active ? 'var(--color-success)' : 'var(--text-muted)',
  padding: '2px 8px',
  fontSize: 'var(--text-xs)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}}>
  {product.is_active ? 'Active' : 'Inactive'}
</span>
```

### Delete Button State

```tsx
<button
  disabled={product.invoiceItemCount > 0}
  title={product.invoiceItemCount > 0
    ? `Used in ${product.invoiceItemCount} invoice item(s)`
    : 'Delete product'}
  onClick={() => handleDelete(product.id)}
>
  <i className="fa-solid fa-trash-can" />
</button>
```

---

## 6. ADD/EDIT MODAL

```
┌──────────────────────────────────────────────┐
│ Add Product / Edit Product                   │
│ ─────────────────────────────────────────    │
│                                              │
│ BASIC INFO                                   │
│ ┌────────────────────────────────────────┐  │
│ │ SKU (JW Mold) *    [____________]      │  │ ← uppercase auto
│ │ Description        [____________]      │  │
│ │ Class              [____________]      │  │
│ │ Sub Class          [____________]      │  │
│ │ Metal Type         [Select... ▼]       │  │
│ └────────────────────────────────────────┘  │
│                                              │
│ DEFAULT FEES (USD per unit)                  │
│ ┌────────────────────────────────────────┐  │
│ │ Labor Fee    [$________]               │  │
│ │ Casting Fee  [$________]               │  │
│ │ Design Fee   [$________]               │  │
│ │ Resin Fee    [$________]               │  │
│ │ Misc Fee     [$________]               │  │
│ │ ─────────────────────────────────────  │  │
│ │ TOTAL FEES:  $XX.XX  (auto sum)        │  │
│ └────────────────────────────────────────┘  │
│                                              │
│ Status:  ● Active  ○ Inactive                │
│                                              │
│ [Note khi Edit: SKU cannot be changed]       │
│                                              │
│              [Cancel]  [Save Product]        │
└──────────────────────────────────────────────┘
```

### SKU Auto-uppercase

```tsx
<input
  type="text"
  value={form.sku_jwmold}
  onChange={e => setForm(f => ({ ...f, sku_jwmold: e.target.value.toUpperCase() }))}
  disabled={isEdit}  // SKU readonly khi edit
  placeholder="RING-001"
  style={isEdit ? { background: 'var(--bg-muted)', color: 'var(--text-secondary)' } : {}}
/>
{isEdit && (
  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
    SKU cannot be changed after creation. Delete and recreate if needed.
  </p>
)}
```

### Live Total Fees

```tsx
function calcTotalFees(form: ProductFormData): number {
  return ['labor_fee', 'casting_fee', 'design_fee', 'resin_fee', 'misc_fee']
    .reduce((sum, key) => sum + (parseFloat(String(form[key] || '0')) || 0), 0)
}

// Trong modal footer:
<div style={{ textAlign: 'right', paddingRight: 16, color: 'var(--text-secondary)' }}>
  Total Fees: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
    ${calcTotalFees(form).toFixed(2)}
  </strong>
</div>
```

### Metal Type Options

```typescript
const METAL_TYPES = ['18KW', '18KY', '14KY', 'PT950', '24K', 'AG', 'PD']
// Match với METAL_RATE_MAP keys từ pricing-formula
```

---

## 7. SEARCH & FILTER

### Client-side Search (debounce 300ms)

```typescript
// Debounce input → gọi API với search param
const [search, setSearch] = useState('')
const [debouncedSearch, setDebouncedSearch] = useState('')

useEffect(() => {
  const t = setTimeout(() => setDebouncedSearch(search), 300)
  return () => clearTimeout(t)
}, [search])

useEffect(() => {
  loadProducts()  // reload khi debouncedSearch thay đổi
}, [debouncedSearch, classFilter, statusFilter, page])
```

### Filter Bar

```tsx
<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
  <input
    type="text"
    placeholder="Search SKU / Description..."
    value={search}
    onChange={e => { setSearch(e.target.value); setPage(1) }}
    style={{ width: 260 }}
  />
  <select value={classFilter} onChange={e => { setClassFilter(e.target.value); setPage(1) }}>
    <option value="">All Classes</option>
    {classes.map(c => <option key={c.class} value={c.class}>{c.class}</option>)}
  </select>
  <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
    <option value="">All Status</option>
    <option value="true">Active</option>
    <option value="false">Inactive</option>
  </select>
</div>
```

---

## 8. BULK IMPORT PRODUCTS (CSV/Excel)

```
┌──────────────────────────────────────────────┐
│ [Import Products from Excel]  [Download Template] │
└──────────────────────────────────────────────┘
```

### Import Template Columns (A–K)

| Col | Field | Required | Notes |
|-----|-------|----------|-------|
| A | SKU (JW Mold) | ✓ | Auto uppercase |
| B | Description | | |
| C | Class | | |
| D | Sub Class | | |
| E | Metal Type | | |
| F | Labor Fee | | Numeric, USD |
| G | Casting Fee | | Numeric, USD |
| H | Design Fee | | Numeric, USD |
| I | Resin Fee | | Numeric, USD |
| J | Misc Fee | | Numeric, USD |
| K | Is Active | | TRUE/FALSE |

```typescript
// Import logic:
// - Duplicate SKU → UPSERT (update fees nếu đã tồn tại)
// - Preview trước khi confirm
// - Báo cáo: X inserted, Y updated, Z errors
```

---

## 9. TYPESCRIPT TYPES

```typescript
export interface BOMProduct {
  id: string
  sku_jwmold: string
  description: string | null
  class: string | null
  sub_class: string | null
  metal_type: string | null
  labor_fee: number
  casting_fee: number
  design_fee: number
  resin_fee: number
  misc_fee: number
  is_active: boolean
  created_at: string
  updated_at: string
  // Computed (from JOIN)
  invoiceItemCount?: number
}

export interface ProductFormData {
  sku_jwmold: string
  description: string
  class: string
  sub_class: string
  metal_type: string
  labor_fee: string   // string vì input controlled
  casting_fee: string
  design_fee: string
  resin_fee: string
  misc_fee: string
  is_active: boolean
}

export interface ProductValidationErrors {
  sku_jwmold?: string
  labor_fee?: string
  casting_fee?: string
  design_fee?: string
  resin_fee?: string
  misc_fee?: string
}

export interface ProductClass {
  class: string
  sub_classes: string[]
}
```

---

## 10. VALIDATION RULES

```typescript
// Client-side:
function validateProduct(form: ProductFormData, isEdit: boolean): ProductValidationErrors {
  const errors: ProductValidationErrors = {}

  if (!isEdit) {
    if (!form.sku_jwmold.trim()) {
      errors.sku_jwmold = 'SKU is required'
    } else if (!/^[A-Z0-9\-_]+$/.test(form.sku_jwmold.trim())) {
      errors.sku_jwmold = 'SKU must contain only letters, numbers, hyphens, underscores'
    }
  }

  const feeFields = ['labor_fee', 'casting_fee', 'design_fee', 'resin_fee', 'misc_fee'] as const
  for (const field of feeFields) {
    const v = parseFloat(form[field] || '0')
    if (isNaN(v) || v < 0) {
      errors[field] = 'Must be ≥ 0'
    }
  }

  return errors
}

// Server-side:
// 1. sku_jwmold required + unique (409 on duplicate)
// 2. All fees >= 0
// 3. Admin role only → 403 otherwise
```

---

## 11. INVOICE ITEM COUNT (JOIN QUERY)

```typescript
// Hiển thị "X items" trong table để biết SKU đang được dùng
const { data: products } = await db
  .from('bom_products')
  .select('*')
  .order('sku_jwmold')

const { data: itemCounts } = await db
  .from('invoice_items')
  .select('sku_jwmold')

const countBySkU = itemCounts?.reduce((acc, row) => {
  acc[row.sku_jwmold] = (acc[row.sku_jwmold] || 0) + 1
  return acc
}, {} as Record<string, number>) ?? {}

const productsWithCount = products?.map(p => ({
  ...p,
  invoiceItemCount: countBySkU[p.sku_jwmold] ?? 0,
}))
```

---

## 12. LOADING & EMPTY STATES

```tsx
// Loading
<tr>
  <td colSpan={13} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
    <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 8 }} />
    Loading products...
  </td>
</tr>

// Empty (no products)
<tr>
  <td colSpan={13} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
    No products found. Add your first SKU to get started.
  </td>
</tr>

// Empty (search no result)
<tr>
  <td colSpan={13} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
    No products match "<strong>{search}</strong>"
  </td>
</tr>
```

---

## 13. COMPONENT STRUCTURE

```
app/(dashboard)/admin/products/page.tsx
components/admin/products/
  ProductsTable.tsx          ← Main table với pagination
  ProductModal.tsx           ← Add/Edit modal
  ProductSearch.tsx          ← Search + filter bar
  FeeInputGroup.tsx          ← 5 fee inputs + total sum
  DeleteProductButton.tsx    ← Delete với guard + tooltip
  ProductImport.tsx          ← Bulk import từ Excel
```

---

## 14. STATE MANAGEMENT

```typescript
interface ProductsPageState {
  products: BOMProduct[]
  total: number
  loading: boolean
  search: string
  classFilter: string
  statusFilter: string   // '' | 'true' | 'false'
  page: number
  pageSize: 25 | 50 | 100
  classes: ProductClass[]

  modal: {
    open: boolean
    mode: 'add' | 'edit'
    product: BOMProduct | null
    form: ProductFormData
    errors: ProductValidationErrors
    saving: boolean
  }

  deleteConfirm: {
    open: boolean
    product: BOMProduct | null
    deleting: boolean
  }

  importModal: {
    open: boolean
  }
}

const DEFAULT_FORM: ProductFormData = {
  sku_jwmold: '',
  description: '',
  class: '',
  sub_class: '',
  metal_type: '',
  labor_fee: '0',
  casting_fee: '0',
  design_fee: '0',
  resin_fee: '0',
  misc_fee: '0',
  is_active: true,
}
```

---

## 15. API ENDPOINTS SUMMARY

| Action | Method | URL |
|--------|--------|-----|
| List products | GET | `/api/products?search=&class=&page=&limit=` |
| Lookup by SKUs | GET | `/api/products?skus=SKU1,SKU2` |
| Create product | POST | `/api/products` |
| Update product | PATCH | `/api/products/[id]` |
| Delete product | DELETE | `/api/products/[id]` |
| Get class list | GET | `/api/products/classes` |

---

## 16. RÀNG BUỘC

```
✓ sku_jwmold UNIQUE — không thể có 2 SKU giống nhau
✓ SKU auto-uppercase tại client VÀ server
✓ Fees ≥ 0 (không âm)
✓ Delete guard: check invoice_items FK trước khi xóa
✓ SKU không đổi được sau khi tạo (delete + recreate nếu cần)
✓ Chỉ Admin role mới CRUD được (403 cho role khác)
✓ is_active = false → SKU không validate được khi import
✓ Fees auto-copy vào invoice_items khi import (user có thể edit lại per item)
✓ invoiceItemCount hiển thị trong table để admin biết SKU đang dùng
```
