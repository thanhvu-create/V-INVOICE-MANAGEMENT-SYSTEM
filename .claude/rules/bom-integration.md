# BOM Integration — SKU Auto-populate & Product Image
> **Phạm vi:** AddItemModal + ItemCard (Detail View) + Import flow
> **Cập nhật:** 2026-05-29 — dựa trên [THAM KHẢO] §2.2 và §3 (Giao diện 2, col 1)
> **Source tables:** `bom_products` → `invoice_items`
> **Status:** GAP — cần implement (image chưa được copy/render, xem §2, §3, §4)

---

## 1. FIELDS TỰ ĐỘNG COPY TỪ BOM KHI ADD/IMPORT ITEM

Khi user nhập SKU và hệ thống tìm thấy trong `bom_products`, các fields sau được auto-populate:

```typescript
// Từ bom_products → invoice_items (tại thời điểm thêm item):
interface BOMAutoFill {
  description:  string | null   // mô tả sản phẩm
  class:        string | null   // phân loại
  sub_class:    string | null   // phân loại con
  metal_type:   string | null   // 18KW | 18KY | 14KY | PT950 | PT | 24K | AG | PD
  labor_fee:    number          // tiền công
  casting_fee:  number          // phí đúc
  design_fee:   number          // phí thiết kế
  resin_fee:    number          // phí resin
  misc_fee:     number          // phí phụ kiện
  image_url:    string | null   // ← QUAN TRỌNG: URL ảnh sản phẩm
}
```

**Lưu ý:** `image_url` hiện chưa được copy vào `invoice_items` khi thêm item. Cần cập nhật API.

---

## 1b. IMAGE "THEO MÃ SO/MO" — QUYẾT ĐỊNH THIẾT KẾ

> [THAM KHẢO] §3 Giao diện 2, col 1: "Hình ảnh — Tự động render từ thư viện sản phẩm **theo mã SO/MO**."

**Quyết định: Load image bằng SKU (sku_jwmold), KHÔNG phải SO/MO.**

| Lý do | Chi tiết |
|-------|---------|
| SO/MO là external code | SO/MO (VD: "SO25.10008-MO26.36400") là mã từ hệ thống ERP ngoài — không phải primary key trong bom_products |
| bom_products key by SKU | `bom_products.sku_jwmold` là lookup key duy nhất trong hệ thống này |
| Cùng ý nghĩa | Source doc dùng "SO/MO" để chỉ "sản phẩm đó" — implementation dùng SKU để identify sản phẩm trong BOM |

**Implementation:** `image_url` được copy từ `bom_products.image_url` (keyed by `sku_jwmold`) tại thời điểm add item/import, lưu vào `invoice_items.image_url` (denormalized).

---

## 2. API FIX — THÊM image_url VÀO INSERT

### `POST /api/invoices/[id]/items` (route.ts)

```typescript
// Cần thêm image_url vào productDefaults query:
const { data: prod } = await db
  .from('bom_products')
  .select('description, class, sub_class, metal_type, labor_fee, casting_fee, design_fee, resin_fee, misc_fee, image_url')  // ← thêm image_url
  .eq('sku_jwmold', body.sku_jwmold)
  .eq('is_active', true)
  .single()

// Và thêm vào INSERT:
const { data: item } = await db.from('invoice_items').insert({
  // ... các fields khác ...
  image_url: body.image_url ?? productDefaults.image_url ?? null,  // ← thêm dòng này
})
```

### `POST /api/import` (import route.ts)

```typescript
// Import flow: auto-copy image_url từ bom_products khi bulk import
const { data: products } = await db
  .from('bom_products')
  .select('sku_jwmold, description, class, sub_class, labor_fee, casting_fee, design_fee, resin_fee, misc_fee, image_url')  // ← thêm image_url
  .in('sku_jwmold', skus)

const prodMap = Object.fromEntries(products?.map(p => [p.sku_jwmold, p]) ?? [])

const itemsToInsert = rows.map(row => ({
  // ... các fields khác ...
  image_url: prodMap[row.sku]?.image_url ?? null,  // ← thêm dòng này
}))
```

---

## 3. CLIENT LOOKUP (AddItemModal)

```typescript
// AddItemModal.tsx — lookupSku() function:
async function lookupSku() {
  const sku = form.sku_jwmold.trim().toUpperCase()
  if (!sku) { setSkuError('SKU is required'); return }
  setLooking(true)
  setSkuError('')
  try {
    const res  = await fetch(`/api/products?skus=${encodeURIComponent(sku)}`)
    const json = await res.json()
    if (!json.success || !json.data?.length) {
      setSkuError(`SKU "${sku}" not found in product catalog`)
      return
    }
    const prod = json.data[0]
    setForm(v => ({
      ...v,
      sku_jwmold:  sku,
      description: prod.description ?? v.description,
      class:       prod.class       ?? v.class,
      sub_class:   prod.sub_class    ?? v.sub_class,
      metal_type:  prod.metal_type   ?? v.metal_type,
      labor_fee:   String(prod.labor_fee   ?? 0),
      casting_fee: String(prod.casting_fee ?? 0),
      design_fee:  String(prod.design_fee  ?? 0),
      resin_fee:   String(prod.resin_fee   ?? 0),
      misc_fee:    String(prod.misc_fee    ?? 0),
      image_url:   prod.image_url ?? '',   // ← thêm image_url vào Form state
    }))
    setSkuResolved(true)
  } finally {
    setLooking(false)
  }
}
```

---

## 4. IMAGE DISPLAY TRONG DETAIL VIEW (ItemCard)

Theo [THAM KHẢO] §3 Giao diện 2: "**Hình ảnh (Mới)**: Cột hiển thị hình ảnh trực quan của sản phẩm. Tự động render từ thư viện sản phẩm theo mã SO/MO."

### Vị trí hiển thị: Card Header của ItemCard

```tsx
{/* ItemCard.tsx — trong card header, bên trái SKU badge */}
<div style={{
  padding: '0.65rem 1rem',
  borderBottom: '1px solid var(--border-light)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '0.5rem',
  background: 'var(--bg-base)',
}}>
  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>

    {/* Product image thumbnail — NEW */}
    {item.image_url && (
      <div style={{
        width: 44, height: 44, flexShrink: 0,
        border: '1px solid var(--border-light)',
        overflow: 'hidden', background: 'var(--bg-muted)',
      }}>
        <img
          src={item.image_url}
          alt={item.sku_jwmold}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }}
        />
      </div>
    )}

    {/* Line no + SKU + description (existing) */}
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
      #{item.line_no}
    </span>
    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, background: 'var(--sku-highlight-bg)', padding: '1px 8px', color: '#92400E', fontSize: 'var(--text-sm)' }}>
      {item.sku_jwmold}
    </span>
    {item.description && (
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{item.description}</span>
    )}
    {isBaSao && (
      <span style={{ fontSize: 'var(--text-xs)', color: '#DC2626', fontWeight: 700 }}>★ BA SAO</span>
    )}
  </div>
  {/* ... action buttons ... */}
</div>
```

### Behavior:
- Nếu `item.image_url` là null/empty → không render div ảnh (không hiện placeholder)
- Nếu URL lỗi → `onError` ẩn container (graceful)
- Thumbnail size: 44×44px, `object-fit: cover`
- Không hiện trong JM Form View (chỉ Detail View)

---

## 5. API /api/products — THÊM image_url VÀO SELECT

```typescript
// app/api/products/route.ts — GET handler:
const { data: products } = await db
  .from('bom_products')
  .select('id, sku_jwmold, description, class, sub_class, metal_type, labor_fee, casting_fee, design_fee, resin_fee, misc_fee, image_url, is_active')
  //                                                                                                                                     ↑ đảm bảo có trường này
  .in('sku_jwmold', skuList)
  .eq('is_active', true)
```

---

## 6. FORM STATE — AddItemModal

```typescript
// Thêm image_url vào Form interface và EMPTY state:
interface Form {
  sku_jwmold:            string
  qty_pcs:               string
  description:           string
  class:                 string
  sub_class:             string
  metal_type:            string
  weight_total_gr:       string
  weight_gold_actual_gr: string
  labor_fee:             string
  casting_fee:           string
  design_fee:            string
  resin_fee:             string
  misc_fee:              string
  notes:                 string
  image_url:             string   // ← thêm
}

const EMPTY: Form = {
  // ... các fields khác ...
  image_url: '',   // ← thêm
}
```

---

## 7. THỨ TỰ TRIỂN KHAI

```
Step 1: API /api/products/route.ts — thêm image_url vào SELECT
Step 2: API /api/invoices/[id]/items/route.ts (POST) — thêm image_url vào productDefaults + INSERT
Step 3: API /api/import/route.ts — thêm image_url vào feeMap + itemsToInsert
Step 4: AddItemModal.tsx — thêm image_url vào Form interface, EMPTY state, lookupSku()
Step 5: ItemCard.tsx — render thumbnail trong card header
```

---

## 8. RÀNG BUỘC

```
✓ image_url là OPTIONAL — không bao giờ required
✓ Nếu SKU không có image → không render thumbnail (không show placeholder broken img)
✓ onError → ẩn container để không chiếm space
✓ KHÔNG dùng next/image — dùng <img> thường (các URL từ external storage)
✓ Chỉ hiển thị trong Detail View (ItemCard) — KHÔNG hiển thị trong JM Form View
✓ Không hiển thị trong print page (in nhỏ, không cần ảnh)
✓ image_url được copy TẠI THỜI ĐIỂM thêm item (denormalized) — nếu bom_products.image_url thay đổi sau, invoice_items.image_url KHÔNG tự update (giống pattern snapshot)
```
