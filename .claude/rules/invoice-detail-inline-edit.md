# Invoice Detail — Inline Edit Feature Plan
> **Cập nhật:** 2026-05-26
> **Trạng thái:** PLAN — chưa implement
> **Mục tiêu:** Cho phép edit trực tiếp invoice items trong trang detail mà không cần popup riêng

---

## 1. HIỆN TRẠNG

### ✅ Đã có (API — 100% sẵn sàng)
| Endpoint | Mô tả |
|----------|-------|
| `POST   /api/invoices/[id]/items` | Thêm item mới (auto-fetch defaults từ BOM) |
| `PATCH  /api/invoices/[id]/items/[itemId]` | Sửa field + trigger recalculate |
| `DELETE /api/invoices/[id]/items/[itemId]` | Xóa item |
| `POST   /api/invoices/[id]/items/[itemId]/gems` | Thêm đá |
| `PATCH  /api/invoices/[id]/items/[itemId]/gems/[gemId]` | Sửa đá |
| `DELETE /api/invoices/[id]/items/[itemId]/gems/[gemId]` | Xóa đá |

### ❌ Chưa có (UI)
- JM Form View: cells chỉ display, không edit được
- Detail View: cards chỉ display, không edit được
- Không có Add Item form
- Không có Gem CRUD UI

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

### 2b. Detail View — Card inline edit

Mỗi card item có edit button (fa-pen). Click → card chuyển sang edit mode: tất cả fields thành inputs. Có Save + Cancel buttons.

**Fields trong edit mode:**
- `qty_pcs`, `description`, `class`, `sub_class`, `metal_type`
- `weight_total_gr`, `weight_gold_actual_gr`
- `labor_fee`, `casting_fee`, `design_fee`, `resin_fee`, `misc_fee`
- `notes`, `so_mo_code`, `vendor_model`
- `ship_date`, `tracking_no`, `vinvoice_no`
- `sell_price`, `discount_pct` (admin/manager only)

**Computed fields hiển thị readonly:**
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
GemModal fields:
  gem_type         [text — Diamond, Ruby, Sapphire...]
  shape            [text — Round, Oval, Princess...]
  size_mm          [text — 1.5mm, 3x4mm...]
  qty_pcs          [number]
  weight_ct_before [number, step=0.0001]
  weight_ct_after  [number, step=0.0001]  ← dùng để tính GENERATED cols
  unit_price_per_ct [number, step=0.01]
  setting_type     [text — Prong, Bezel, Pave...]
  setting_fee_per_pcs [number, step=0.01]

Readonly (GENERATED — hiển thị sau khi save):
  weight_gr        = weight_ct_after × 0.2
  total_price      = weight_ct_after × unit_price_per_ct
  total_setting_fee = qty_pcs × setting_fee_per_pcs
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

### 3b. State update sau PATCH

Thay vì re-fetch toàn bộ invoice (expensive), cập nhật item trong local state:

```typescript
function updateItemInState(itemId: string, updatedItem: Partial<InvoiceItem>) {
  setData(prev => {
    if (!prev) return prev
    return {
      ...prev,
      items: prev.items.map(item =>
        item.id === itemId ? { ...item, ...updatedItem } : item
      )
    }
  })
}
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
