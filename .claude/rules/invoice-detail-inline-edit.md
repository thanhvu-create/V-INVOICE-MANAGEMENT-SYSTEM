# Invoice Detail — Inline Edit Feature Plan
> **Cập nhật:** 2026-05-29
> **Trạng thái:** ✅ IMPLEMENTED (inline edit) + 2 gaps cần bổ sung
> **Mục tiêu:** Cho phép edit trực tiếp invoice items trong trang detail mà không cần popup riêng

---

## 1. HIỆN TRẠNG

### ✅ Đã implement
| Feature | File |
|---------|------|
| API PATCH/DELETE items/gems | `app/api/invoices/[id]/items/[itemId]/route.ts` |
| JM Form View inline cell edit | `components/invoice/JMFormView.tsx` + `JMEditableCell.tsx` |
| Detail View card edit mode | `components/invoice/ItemCard.tsx` |
| Add Item Modal + SKU lookup | `components/invoice/AddItemModal.tsx` |
| Gem CRUD (GemModal) | `components/invoice/GemModal.tsx` |

### ❌ Chưa có — cần bổ sung
1. **Sub-total row per item** (yêu cầu từ [THAM KHẢO] §3-B): Sau gem table, hiển thị Σ gem values + Σ setting fees trước khi show HPUSA
2. **Product image thumbnail** (yêu cầu từ [THAM KHẢO] §3 col 1): Hiển thị ảnh từ `item.image_url` trong card header — xem `.claude/rules/bom-integration.md`

---

## 2. PHẠM VI FEATURE

### 2a. JM Form View — Inline cell edit

Người dùng click vào cell bất kỳ (không phải computed cell) → input xuất hiện → blur/Enter → auto-save.

**Editable cells (PATCH /items/[itemId]):**
| Col | Field | Input type |
|-----|-------|-----------|
| 3 | `qty_pcs` | `number`, min=1 |
| 4 | `description` | `text` |
| 5 | `class` | `text` |
| 6 | `sub_class` | `text` |
| 7 | `notes` | `text` |
| 8 | `weight_total_gr` | `number`, step=0.0001 |
| 9 | `weight_gold_actual_gr` | `number`, step=0.0001 |
| 11 | `metal_type` | `select` (18KW/18KY/14KY/PT950/PT/24K/AG/PD) |

**Readonly cells (computed — không edit):**
| Col | Field | Lý do |
|-----|-------|-------|
| 10 | `weight_no_gem_gr` | Server computed |
| 12 | `gold_value_usd` | Server computed |
| 13 | `hpusa` | Server computed |
| 14 | `cif_price` | Server computed |
| 15 | `tag_price` | Server computed |

**Behavior khi save:**
1. PATCH item field → API recalculate
2. Re-fetch item row (hoặc optimistic update computed cols)
3. Toast: `'Item saved.'` success / error

**Behavior khi locked (`is_locked = true`):**
- Tất cả cells → readonly, không click được
- Cursor: `default`, không có hover effect

---

### 2b. Detail View — Card Display Spec (theo [THAM KHẢO] §3 Giao diện 2)

Mỗi item là 1 card theo cấu trúc **Master-Detail**:
- **Master**: thông tin tổng quan sản phẩm
- **Detail** (expandable bên dưới): gem/đá tấm rows

#### Card Header (luôn hiển thị)

```tsx
<div style={{ /* card header */ }}>
  {/* Thumbnail ảnh — từ bom_products.image_url via SKU (xem bom-integration.md) */}
  {item.image_url && <img src={item.image_url} style={{ width: 44, height: 44, objectFit: 'cover' }} />}

  {/* Line no + SKU badge */}
  <span>#{item.line_no}</span>
  <span style={{ background: '#FEF3C7' }}>{item.sku_jwmold}</span>

  {/* SO/MO & Tên KH — MULTILINE ([THAM KHẢO] §3 col 2) */}
  {(item.so_mo_code || item.customer_name) && (
    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.4 }}>
      {item.so_mo_code && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
          {item.so_mo_code}
        </span>
      )}
      {item.customer_name && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {item.customer_name}
        </span>
      )}
    </div>
  )}

  {/* Ba Sao indicator */}
  {isBaSao && <span style={{ color: '#DC2626', fontWeight: 700, fontSize: 'var(--text-xs)' }}>★ BA SAO</span>}
</div>
```

#### Card Body — Display Mode

Theo [THAM KHẢO] §3 Giao diện 2, display theo nhóm:

```tsx
{/* NHÓM 1: Kích thước & Số lượng ([THAM KHẢO] §3 col 3) */}
<DisplayField label="Size"   value={item.size ?? '—'} />
<DisplayField label="Qty"    value={item.qty_pcs} />
<DisplayField label="Metal"  value={item.metal_type ?? '—'} />

{/* NHÓM 2: Trọng lượng 3 cột ([THAM KHẢO] §3 col 6) */}
{/* Label group header */}
<div style={{ gridColumn: '1/-1', borderTop: '1px solid var(--border-light)', paddingTop: 4,
  fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
  Trọng lượng (gr)
</div>
{/* T.Phẩm (có NVL đá) = weight_total_gr */}
<DisplayField label="Wt Total (gr)"  value={fmt4(item.weight_total_gr)} mono />
{/* T.Phẩm (trừ NVL đá) = weight_no_gem_gr */}
<DisplayField label="Wt No-Gem (gr)" value={fmt4(item.weight_no_gem_gr)} mono computed />
{/* T.Phẩm (vàng thực tế) = weight_gold_actual_gr — YELLOW HIGHLIGHT */}
<DisplayField label="Wt Gold Actual (gr)" value={fmt4(item.weight_gold_actual_gr)} mono
  style={{ background: '#FFFBEB', color: '#92400E' }}
  title="Dùng để tính Tiền vàng" />

{/* NHÓM 3: Giá (admin/manager only) */}
{canSeePrice && (
  <>
    <DisplayField label="Tiền vàng"  value={fmt2(item.gold_value_usd)} mono />
    <DisplayField label="HPUSA"      value={fmt2(item.hpusa)} mono bold />
    <DisplayField label="CIF"        value={fmt2(item.cif_price)} mono />
    <DisplayField label="Tag"        value={fmt2(item.tag_price)} mono />
    <DisplayField label="FR"         value={fmt2(item.fr_price)} mono />
  </>
)}

{/* NHÓM 4: Chi phí sản xuất */}
<DisplayField label="Labor"    value={fmt2(item.labor_fee)} mono />
<DisplayField label="Casting"  value={fmt2(item.casting_fee)} mono />
<DisplayField label="Design"   value={fmt2(item.design_fee)} mono />
<DisplayField label="Resin"    value={fmt2(item.resin_fee)} mono />
<DisplayField label="Misc"     value={fmt2(item.misc_fee)} mono />

{/* NHÓM 5: Logistics */}
{item.ship_date   && <DisplayField label="Ship Date"  value={item.ship_date} />}
{item.tracking_no && <DisplayField label="Tracking"   value={item.tracking_no} mono />}
{item.vinvoice_no && <DisplayField label="V-Invoice"  value={item.vinvoice_no} mono />}
{item.notes       && <DisplayField label="Notes"
  value={item.notes}
  style={{ color: isBaSao ? '#DC2626' : 'var(--text-secondary)', fontWeight: isBaSao ? 700 : 400 }} />}
```

#### Card inline edit — Edit Mode

**Fields trong edit mode (thêm `size` so với spec cũ):**
- `qty_pcs`, `size`, `description`, `class`, `sub_class`, `metal_type`
- `weight_total_gr`, `weight_gold_actual_gr`
- `labor_fee`, `casting_fee`, `design_fee`, `resin_fee`, `misc_fee`
- `notes`, `so_mo_code`, `customer_name`, `vendor_model`
- `ship_date`, `tracking_no`, `vinvoice_no`
- `sell_price`, `discount_pct` (admin/manager only)

**Computed fields hiển thị readonly trong edit mode:**
- `weight_no_gem_gr`, `gold_value_usd`, `hpusa`, `cif_price`, `tag_price`, `fr_price`

---

### 2c. Add Item (cả 2 views)

Button "+ Add Item" trên action bar (chỉ khi `!is_locked`).  
→ Mở modal "Add Item":

```
┌─────────────────────────────────────────┐
│ ADD ITEM                                │
├─────────────────────────────────────────┤
│ SKU (JWMold) *   [input + lookup btn]   │
│                  [auto-fill từ BOM khi  │
│                   blur nếu SKU match]   │
│ Description      [input]               │
│ Qty *            [number]              │
│ Metal Type       [select]              │
│ Total Weight (g) [number]              │
│ Gold Weight (g)  [number]              │
│                                        │
│          [Cancel]  [Add Item]          │
└─────────────────────────────────────────┘
```

Khi submit:
- `POST /api/invoices/[id]/items`
- API auto-fetch fees từ BOM, recalculate
- Toast: `'Item added.'` success
- Refresh danh sách items

---

### 2d. Delete Item

Button fa-trash trên mỗi row/card (chỉ khi `!is_locked` và role có quyền edit).  
→ Custom ConfirmDialog: `"Delete item [SKU]? This cannot be undone."`  
→ `DELETE /api/invoices/[id]/items/[itemId]`  
→ Toast: `'Item deleted.'` success

---

### 2e. Gem CRUD (Detail View only)

Bên dưới mỗi item card có gem sub-table. Khi `!is_locked`:

**Add gem:** Button "+ Add Gem" → GemModal (form nhập gem fields)  
**Edit gem:** Click row gem → GemModal với data điền sẵn  
**Delete gem:** Button fa-trash trên gem row → ConfirmDialog

```
GemModal fields (theo [THAM KHẢO] §3 + database-schema.md):
  gem_type         [text — Diamond, Ruby, Sapphire, Emerald...]
  quality          [text — VVS1, VS1, SI1, LG, F, VF...]   ← THÊM MỚI (P. chất)
  shape            [text — Round, Oval, Princess, Cushion...]
  size_mm          [text — 1.5mm, 3x4mm...]
  qty_pcs          [number, min=1]
  weight_ct_before [number, step=0.0001]
  weight_ct_after  [number, step=0.0001]  ← dùng để tính GENERATED cols
  unit_price_per_ct [number, step=0.01]
  setting_type     [text — Prong, Bezel, Pave, Channel...]
  setting_fee_per_pcs [number, step=0.01]

Readonly (GENERATED — hiển thị sau khi save):
  weight_gr        = weight_ct_after × 0.2
  total_price      = weight_ct_after × unit_price_per_ct
  total_setting_fee = qty_pcs × setting_fee_per_pcs
```

**Gem table display columns (cập nhật để có `quality`):**
```
Type | Quality | Shape | Size | Qty | Wt After (ct) | Wt (g) | $/ct | Total | Setting | Fee/pc | Total Fee | Actions
```

**Thứ tự field trong GemModal form:**
```tsx
// Row 1: gem_type + quality (2 cols — thông tin chất lượng đi cùng loại đá)
// Row 2: shape + size_mm
// Row 3: qty_pcs + weight_ct_before + weight_ct_after
// Row 4: unit_price_per_ct + setting_type + setting_fee_per_pcs
// Readonly: weight_gr / total_price / total_setting_fee (hiện sau save)
```

---

## 3. PHÂN TÍCH KỸ THUẬT

### 3a. Edit pattern cho JM Form View — Single cell

```typescript
// State cho mỗi cell đang edit:
const [editCell, setEditCell] = useState<{
  itemId: string
  field:  string
  value:  string
} | null>(null)

// Click cell → bắt đầu edit:
function startEdit(itemId: string, field: string, currentValue: any) {
  if (isLocked || !canEdit) return
  setEditCell({ itemId, field, value: String(currentValue ?? '') })
}

// Blur/Enter → save:
async function commitEdit() {
  if (!editCell) return
  const payload = { [editCell.field]: parseValue(editCell.field, editCell.value) }
  const data = await apiCall(
    () => fetch(`/api/invoices/${id}/items/${editCell.itemId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    { successMsg: 'Item saved.' }
  )
  setEditCell(null)
  if (data) updateItemInState(editCell.itemId, data)
}

// Escape → cancel:
function cancelEdit() { setEditCell(null) }
```

### 3b. State update sau PATCH — "Lập tức thay đổi mà không cần Reload"

> **Nguồn:** [THAM KHẢO] DEV GUIDELINES — "các hàm tính toán Sub-total → HPUSA → HP for CIF price phải **lập tức thay đổi** trên màn hình mà không cần Reload lại trang."

**Nguyên tắc:** KHÔNG gọi `onRefresh()` (full re-fetch) sau mỗi cell save. Thay vào đó:

```typescript
// invoices/[id]/page.tsx — state management:
const [data, setData] = useState<{ header: any; items: any[] } | null>(null)

// Hàm cập nhật 1 item trong local state:
function updateItemInState(itemId: string, updatedFields: Record<string, any>) {
  setData(prev => {
    if (!prev) return prev
    return {
      ...prev,
      items: prev.items.map(item =>
        item.id === itemId
          ? { ...item, ...updatedFields }
          : item
      ),
    }
  })
}

// Hàm re-fetch 1 item từ server (dùng khi gem thay đổi — computed cols):
async function refreshSingleItem(itemId: string) {
  const res  = await fetch(`/api/invoices/${invoiceId}/items/${itemId}`)
  const json = await res.json()
  if (json.success) updateItemInState(itemId, json.data)
}
```

**Flow khi edit item field (JM Form hoặc Detail View):**
```
1. commitEdit() → PATCH /api/invoices/[id]/items/[itemId]
2. API recalculates: gold_value_usd, hpusa, cif_price, tag_price, fr_price, weight_no_gem_gr
3. API returns { success: true, data: updatedItem }
4. updateItemInState(itemId, updatedItem)  ← chỉ update 1 item trong state
5. JM Form View re-renders → CIF cell mới ngay lập tức
6. Detail View re-renders → HPUSA/CIF cards mới ngay lập tức
7. Total Row re-renders → totals mới ngay lập tức
✓ KHÔNG cần page reload, KHÔNG cần full re-fetch
```

**Flow khi edit gem (add/edit/delete):**
```
1. GemModal.handleSave() → POST/PATCH/DELETE /api/.../gems/[gemId]
2. Gem GENERATED cols update (server-side PostgreSQL)
3. Server recalculates parent item: weight_no_gem_gr, hpusa, cif_price
4. refreshSingleItem(itemId) → fetch 1 item với gems mới
5. updateItemInState(itemId, { ...updatedItem, item_gem_details: newGems })
6. Sub-total row, HPUSA breakdown, JM Form CIF → tất cả update ngay
```

API response trả về item đã recalculate → computed fields tự động cập nhật.

### 3c. Visual feedback khi saving

```typescript
const [savingCell, setSavingCell] = useState<string | null>(null) // itemId:field

// Khi đang save:
// - Cell opacity: 0.6
// - Tiny spinner icon trong cell
// - Disable click vào cell khác trong cùng row
```

### 3d. Permission guard

```typescript
const canEditItems = !header.is_locked && (canDo('edit') || canDo('create'))

// Trong JM Form View: chỉ show input khi canEditItems
// Trong Detail View: chỉ show edit button khi canEditItems
// viewer role: không bao giờ edit
```

---

## 4. COMPONENT STRUCTURE

```
components/invoice/
  JMFormView.tsx             ← Refactor thành component riêng (hiện là JMFormTable trong page.tsx)
    JMEditableCell.tsx       ← Single editable cell (input/select/readonly)
  DetailView.tsx             ← Refactor thành component riêng (hiện là DetailTable)
    ItemCard.tsx             ← Single item card với edit mode
    GemSubTable.tsx          ← Gem rows + CRUD actions
  AddItemModal.tsx           ← Modal thêm item mới (SKU lookup + form)
  GemModal.tsx               ← Modal thêm/sửa đá
```

---

## 5. THỨ TỰ TRIỂN KHAI

```
Sprint 1 — Foundation (~2 giờ):
  [ ] Tách JMFormTable ra JMFormView.tsx (component riêng)
  [ ] Tách DetailTable ra DetailView.tsx + ItemCard.tsx
  [ ] Thêm editCell state + startEdit/commitEdit/cancelEdit logic
  [ ] JMEditableCell.tsx — cell có input/select mode

Sprint 2 — JM Form View edit (~2 giờ):
  [ ] Editable cells cho tất cả editable fields
  [ ] Readonly style cho computed cells
  [ ] Keyboard: Enter = save, Escape = cancel, Tab = next cell
  [ ] Visual saving feedback (opacity + spinner)
  [ ] Toast via apiCall()

Sprint 3 — Detail View edit (~2 giờ):
  [ ] ItemCard edit mode (toggle button)
  [ ] Save/Cancel buttons trong card
  [ ] All editable fields rendered as inputs
  [ ] Computed fields readonly display

Sprint 4 — Add/Delete Item (~1 giờ):
  [ ] AddItemModal.tsx — form + SKU auto-fill
  [ ] "+ Add Item" button trong action bar
  [ ] Delete button + ConfirmDialog
  [ ] Toast feedback

Sprint 5 — Gem CRUD (~2 giờ):
  [ ] GemModal.tsx — add + edit form
  [ ] "+ Add Gem" button trong GemSubTable
  [ ] Click gem row → edit mode
  [ ] Delete gem + ConfirmDialog
  [ ] GENERATED cols display sau save

Sprint 6 — Polish (~1 giờ):
  [ ] Locked state: tất cả cells/buttons ẩn/disabled
  [ ] Permission guard: viewer không thấy edit controls
  [ ] Keyboard navigation: Tab giữa cells trong JM view
  [ ] Mobile responsive: edit mode trong Detail View
```

---

## 6. FIELD FORMATTING KHI PARSE

```typescript
// Trước khi PATCH — convert string → typed value:
function parseValue(field: string, value: string): number | string | null {
  const numberFields = [
    'qty_pcs', 'weight_total_gr', 'weight_gold_actual_gr',
    'labor_fee', 'casting_fee', 'design_fee', 'resin_fee', 'misc_fee',
    'sell_price', 'discount_pct',
    'weight_ct_before', 'weight_ct_after', 'unit_price_per_ct', 'setting_fee_per_pcs', 'qty_pcs',
  ]
  if (numberFields.includes(field)) {
    const n = parseFloat(value)
    return isNaN(n) ? null : n
  }
  return value.trim() || null
}
```

---

## 7. VALIDATION CLIENT-SIDE

```typescript
// Trước khi save — validate:
// weight_gold_actual_gr ≤ weight_total_gr
// qty_pcs ≥ 1
// metal_type trong ALLOWED_METAL_TYPES
// weight_ct_after ≤ weight_ct_before (nếu có before)

// Lỗi validation → toast warn (không save), focus lại cell
```

---

## 8. RÀNG BUỘC

```
✓ is_locked = true → toàn bộ UI readonly (không render edit controls)
✓ GENERATED cols (weight_gr, total_price, total_setting_fee) — không gửi trong PATCH body
✓ Computed cols (gold_value_usd, hpusa, cif, tag, fr) — đọc từ API response sau save
✓ Không re-fetch toàn bộ invoice sau mỗi cell save — chỉ update item trong local state
✓ viewer role — không bao giờ thấy edit controls
✓ Không dùng window.confirm() — dùng ConfirmDialog component
✓ Toast qua apiCall() wrapper (lib/api.ts)
✓ Keyboard: Enter/blur = save, Escape = cancel trong JM view
```

---

## 9. KHÔNG THAY ĐỔI

- API endpoints — đã hoàn chỉnh, không sửa
- `lib/formulas/pricing.ts` — server xử lý, không cần client
- WorkflowBar — giữ nguyên
- AuditTimeline — giữ nguyên
- Locked invoice display — giữ nguyên banner

---

## 10. SUB-TOTAL PER ITEM (THIẾU — cần implement)

> **Nguồn:** [THAM KHẢO] §3-B: "Cuối mỗi nhóm dòng Detail của một sản phẩm, hệ thống phải có một dòng ngầm tích hợp hiển thị: Tổng cộng tiền đá (Σ T.Giá Xoàn) và Tổng phí nhận hột của riêng sản phẩm đó trước khi đưa lên công thức tính HPUSA."

### Vị trí: Trong GemSubTable — tfoot row sau tất cả gem rows

```tsx
{/* Trong ItemCard.tsx — sau gems.map() tbody, thêm tfoot: */}
{gems.length > 0 && (
  <tfoot>
    <tr style={{ background: 'var(--bg-base)', borderTop: '1px solid var(--border-base)' }}>
      <td colSpan={4} style={{ padding: '4px 8px', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', textAlign: 'right' }}>
        Gem Subtotal
      </td>
      {/* Wt After (ct) — empty */}
      <td style={{ padding: '4px 8px' }} />
      {/* Wt (gr) total */}
      <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
        {gems.reduce((s: number, g: any) => s + (g.weight_gr ?? 0), 0).toFixed(4)}
      </td>
      {/* $/ct — empty */}
      <td />
      {/* Total gem value Σ */}
      <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)' }}>
        {fmt2(gems.reduce((s: number, g: any) => s + (g.total_price ?? 0), 0))}
      </td>
      {/* Setting type — empty */}
      <td />
      {/* Fee/pc — empty */}
      <td />
      {/* Total setting fee Σ */}
      <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)' }}>
        {fmt2(gems.reduce((s: number, g: any) => s + (g.total_setting_fee ?? 0), 0))}
      </td>
      {/* Actions — empty */}
      <td />
    </tr>
  </tfoot>
)}
```

### HPUSA Breakdown Display — trong Display Mode của ItemCard

Thay vì chỉ hiển thị HPUSA một số, thêm breakdown nhỏ bên dưới:

```tsx
{/* Trong display grid của ItemCard, thay thế dòng HPUSA thành: */}
{canSeePrice && (
  <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border-light)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
      HPUSA Breakdown
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}>
      <span>Gold: {fmt2(item.gold_value_usd)}</span>
      <span style={{ color: 'var(--text-muted)' }}>+</span>
      <span>Gems: {fmt2(gems.reduce((s: number, g: any) => s + (g.total_price ?? 0), 0))}</span>
      <span style={{ color: 'var(--text-muted)' }}>+</span>
      <span>Setting: {fmt2(gems.reduce((s: number, g: any) => s + (g.total_setting_fee ?? 0), 0))}</span>
      <span style={{ color: 'var(--text-muted)' }}>+</span>
      <span>Fees: {fmt2((item.labor_fee ?? 0) + (item.casting_fee ?? 0) + (item.design_fee ?? 0) + (item.resin_fee ?? 0) + (item.misc_fee ?? 0))}</span>
      <span style={{ color: 'var(--text-muted)' }}>=</span>
      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>HPUSA: {fmt2(item.hpusa)}</span>
    </div>
  </div>
)}
```

### Quy tắc:
```
✓ Sub-total row chỉ hiển thị khi gems.length > 0
✓ GENERATED cols (total_price, total_setting_fee, weight_gr) — đọc từ DB, KHÔNG tính trong TS
✓ Hiển thị cả khi isLocked = true (read-only display)
✓ HPUSA breakdown chỉ hiển thị cho canSeePrice = true (admin/manager)
✓ Viewer không thấy breakdown (không thấy HPUSA, gold_value)
```

---

## 11. IMAGE DISPLAY (THIẾU — cần implement)

> **Nguồn:** [THAM KHẢO] §3 Giao diện 2, col 1: "Hình ảnh (Mới): Tự động render từ thư viện sản phẩm"

Xem spec đầy đủ trong `.claude/rules/bom-integration.md` — Section 4.

**Tóm tắt:** Thêm `<img src={item.image_url}>` vào card header của ItemCard, 44×44px thumbnail, graceful fallback nếu image lỗi.

---

## 12. DETAIL VIEW — TOTAL ROW (THIẾU — cần implement)

> **Nguồn:** [THAM KHẢO] §4 — "Dòng TOTAL ở cuối trang của **cả hai giao diện**"
> JM Form View đã có tfoot. Detail View **chưa có** total summary.

### Vị trí: Sau tất cả ItemCards trong `DetailView.tsx`

```tsx
// DetailView.tsx — sau danh sách ItemCards, thêm Total Summary:
export function DetailView({ invoiceId, items, canSeePrice, canEdit, isLocked, onRefresh }: Props) {

  // Compute totals — dùng actual gem data (tương tự JMFormView):
  const totQty   = items.reduce((s, i) => s + (i.qty_pcs ?? 0), 0)
  const totWt    = items.reduce((s, i) => s + (i.weight_total_gr ?? 0), 0)
  const totGoldV = items.reduce((s, i) => s + (i.gold_value_usd ?? 0), 0)
  const totHpusa = items.reduce((s, i) => s + (i.hpusa ?? 0), 0)
  const totCif   = items.reduce((s, i) => s + (i.cif_price ?? 0), 0)
  const totTag   = items.reduce((s, i) => s + (i.tag_price ?? 0), 0)
  // Total_Stone_Weight — từ actual gem data:
  const totGemWt = items.reduce((s, i) =>
    s + (i.item_gem_details ?? []).reduce((gs: number, g: any) => gs + (g.weight_gr ?? 0), 0),
    0
  )

  return (
    <div>
      {/* ItemCards */}
      {items.map(item => <ItemCard key={item.id} ... />)}

      {/* Total Summary — hiển thị khi có ít nhất 1 item */}
      {items.length > 0 && (
        <div style={{
          marginTop: '1.5rem',
          border: '2px solid var(--border-strong)',
          background: 'var(--bg-base)',
          padding: '1rem 1.25rem',
        }}>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
            Invoice Total
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
            {/* Total_Qty */}
            <TotalField label="Total Qty (pcs)" value={totQty} />

            {/* Total_Weight */}
            <TotalField label="Total Weight (gr)" value={fmt4(totWt)} mono />

            {/* Total_Stone_Weight */}
            {totGemWt > 0 && (
              <TotalField label="Σ TL Xoàn (gr)" value={fmt4(totGemWt)} mono muted />
            )}

            {/* Total_Gold_Amount — admin/manager only */}
            {canSeePrice && (
              <TotalField label="Total Gold Value" value={fmt2(totGoldV)} mono />
            )}

            {/* Total_HPUSA — admin/manager only */}
            {canSeePrice && (
              <TotalField label="Total HPUSA" value={fmt2(totHpusa)} mono bold />
            )}

            {/* Total_CIF — admin/manager only */}
            {canSeePrice && (
              <TotalField label="Total CIF" value={fmt2(totCif)} mono />
            )}

            {/* Total_Tag — admin/manager only */}
            {canSeePrice && totTag > 0 && (
              <TotalField label="Total Tag" value={fmt2(totTag)} mono />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Helper component:
function TotalField({ label, value, mono, bold, muted }: {
  label: string; value: any; mono?: boolean; bold?: boolean; muted?: boolean
}) {
  return (
    <div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)',
        fontSize: 'var(--text-sm)',
        fontWeight: bold ? 700 : 400,
        color: muted ? 'var(--text-muted)' : 'var(--text-primary)',
      }}>
        {value}
      </div>
    </div>
  )
}
```

### Ràng buộc Total Row — Detail View

```
✓ Hiển thị khi items.length > 0
✓ totGemWt: dùng actual item_gem_details.weight_gr — KHÔNG dùng totWt - totNoGem
✓ totGemWt row: chỉ hiển thị khi totGemWt > 0
✓ Total_Gold_Amount, Total_HPUSA, Total_CIF, Total_Tag: chỉ hiện khi canSeePrice
✓ viewer: chỉ thấy Total_Qty + Total_Weight + Σ TL Xoàn
✓ Cập nhật sau mỗi onRefresh() — không cần real-time subscription riêng
✓ Giữ nguyên khi isLocked = true (display only, không thay đổi)
```
