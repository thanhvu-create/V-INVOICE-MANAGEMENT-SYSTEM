# Output & Export — Export Excel + Print PDF
> **Nguồn:** `MODULE QUẢN LÝ & TẠO V-INVOICE.md §5` + `import-export.md §4` + `print-layout.md`
> **Cập nhật:** 2026-06-02
> **Files:** `app/api/invoices/[id]/export/route.ts` + `app/(dashboard)/invoices/[id]/print/page.tsx`

---

## 1. EXPORT EXCEL — MASTER-DETAIL FORMAT

### Yêu cầu gốc
> "Xuất chính xác lưới dữ liệu đang hiển thị theo đúng định dạng mẫu, **giữ nguyên cấu trúc dòng Master-Detail** (Merge cell hợp lý ở các cột thông tin chung sản phẩm)."

### Vấn đề với code cũ (trước 2026-06-02)
```
❌ Dùng XLSX.utils.json_to_sheet() → flat rows, không merge cells
❌ Gems ở sheet riêng "Gems" — không phải inline sub-rows
❌ Thiếu cột: quality (P.chất), weight_ct_before, weight_ct_after, unit_price_per_ct
❌ Items sheet và Gems sheet là 2 views riêng — không phải Master-Detail layout
```

### Fix đã áp dụng (2026-06-02)

Rewrite hoàn toàn — dùng `aoa_to_sheet` + `ws['!merges']`:

```typescript
// Cấu trúc chính:
const wsData: (string|number)[][] = []   // array of arrays
const merges: XLSX.Range[] = []          // merge ranges

// Header row:
wsData.push([...masterHeaders, ...gemHeaders])

// Với mỗi item:
//   numRows = Math.max(gems.length, 1)
//   Lặp g = 0..numRows-1:
//     - masterData: chỉ điền ở g=0, blank ở g>0
//     - gemData: điền nếu gems[g] tồn tại, blank nếu item không có gem
//   Nếu numRows > 1: push merge range cho từng master column

const ws = XLSX.utils.aoa_to_sheet(wsData)
ws['!merges'] = merges
```

### Column Layout (đã implement)

#### MASTER Columns — A đến L (tất cả) + M–Q (chỉ admin/manager)

| Col | Label | DB Field | Role |
|-----|-------|----------|------|
| A | No. | `line_no` | All |
| B | SKU JWMold | `sku_jwmold` | All |
| C | SO/MO | `so_mo_code` | All |
| D | Description | `description` | All |
| E | Class | `class` | All |
| F | Sub Class | `sub_class` | All |
| G | Size | `size` | All |
| H | Metal | `metal_type` | All |
| I | Qty (pcs) | `qty_pcs` | All |
| J | Total Wt (g) | `weight_total_gr` fmt4 | All |
| K | Gold Wt (g) | `weight_gold_actual_gr` fmt4 | All |
| L | No-Gem Wt (g) | `weight_no_gem_gr` fmt4 | All |
| M | Gold Value | `gold_value_usd` fmt2 | admin/manager |
| N | HPUSA | `hpusa` fmt2 | admin/manager |
| O | CIF | `cif_price` fmt2 | admin/manager |
| P | Tag | `tag_price` fmt2 | admin/manager |
| Q | FR | `fr_price` fmt2 | admin/manager |

#### Separator column (R — blank)

#### GEM DETAIL Columns — S đến AE

| Col | Label | DB Field | Ghi chú |
|-----|-------|----------|---------|
| S | (blank) | — | separator |
| T | Gem Type | `gem_type` | |
| U | Quality | `quality` | **P.chất** — VVS1, VS1, LG... |
| V | Shape | `shape` | |
| W | Size (mm) | `size_mm` | |
| X | Qty | `qty_pcs` | |
| Y | Wt After (ct) | `weight_ct_after` fmt4 | |
| Z | Wt (g) | `weight_gr` fmt4 | GENERATED |
| AA | $/ct | `unit_price_per_ct` fmt2 | |
| AB | T.Giá Xoàn | `total_price` fmt2 | GENERATED |
| AC | Setting | `setting_type` | |
| AD | Fee/pc | `setting_fee_per_pcs` fmt2 | |
| AE | Total Fee | `total_setting_fee` fmt2 | GENERATED |

### Merge Cell Logic

```
Item với 3 gems → 3 rows trong Excel:
  Row 1: [master data ✓] [gem 1]
  Row 2: [            ] [gem 2]  ← master cols A-Q MERGED với row 1
  Row 3: [            ] [gem 3]  ← master cols A-Q MERGED với row 1

Item với 0 gems → 1 row:
  Row 1: [master data ✓] [gem cols blank]  ← không merge
```

```typescript
// Merge range object:
merges.push({
  s: { r: rowIdx,              c },   // start: first sub-row, column c
  e: { r: rowIdx + numRows - 1, c },  // end: last sub-row, same column
})
// Áp dụng cho c = 0..masterCount-1 (tất cả master columns)
```

### Sheets

| Sheet | Content | Format |
|-------|---------|--------|
| `Invoice` | Master-Detail merged | `aoa_to_sheet` + `!merges` |
| `Info` | Header metadata | `json_to_sheet` (single row) |

### Filename
```
invoice-{po_number}.xlsx
Cache-Control: no-store
```

### GENERATED Columns — đọc từ DB, KHÔNG tính lại
```typescript
// ✅ Đúng — đọc từ DB response (PostgreSQL GENERATED ALWAYS AS):
fmt4(gem.weight_gr)          // = weight_ct_after × 0.2
fmt2(gem.total_price)        // = weight_ct_after × unit_price_per_ct
fmt2(gem.total_setting_fee)  // = qty_pcs × setting_fee_per_pcs
```

---

## 2. PRINT PDF — A4 LANDSCAPE

### Yêu cầu gốc
> "Hệ thống kết xuất dữ liệu sang layout file PDF chuẩn khổ giấy A4 nằm ngang (Landscape). Layout phải căn chỉnh bao gồm đầy đủ **logo công ty**, **thông tin Header (PO/MR)**, **bảng danh mục sản phẩm thu gọn** (Giao diện 1) và **dòng ký tên của các bên**."

### Fix đã áp dụng (2026-06-02)

| Element | Trước | Sau |
|---------|-------|-----|
| Logo công ty | ❌ Chỉ text "HP Jewelry" | ✅ `<img src="/hp-logo.png">` + graceful text fallback |
| Signature block | ❌ Không có | ✅ 3-col: Prepared by / Approved by / Customer |
| Ba Sao red in print | ❌ Plain text | ✅ `#DC2626` + `print-color-adjust: exact` |
| Total_Stone_Weight | ❌ Không có | ✅ Row riêng Σ `gem.weight_gr` trong tfoot |
| Role-filtered prices | ❌ Show all | ✅ `adminOnly` cols theo `canSeePrice` |
| Notes col | ✅ Đã có | ✅ Giữ nguyên |

### Cấu trúc Print Page

```
┌──────────────────────────────────────────────────────────────────┐
│ [LOGO]  HP Jewelry - Invoice           Printed: 2026-06-02       │
│ PO: 1000011528  MR: 1000011901  Store: US ONL                   │
│ Status: APPROVED  Rate: 2026-05-20  Rule: Standard               │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│ [JM TABLE — 8pt, fit A4 landscape, color-preserved]              │
│  No │ SKU       │ Qty │ Desc │ Metal │ Wt  │ HPUSA │ CIF  │ Tag │
│  ─────────────────────────────────────────────────────────────── │
│   1 │ RING-001  │  1  │ ...  │  18KW │ 5.2 │ $660  │ $726 │     │
│   2 │ PEND-002  │  2  │ ...  │  18KY │ 3.1 │ ...   │ ...  │     │
│  ─────────────────────────────────────────────────────────────── │
│  TOTAL           2       ...         8.3   $1240   $1364        │
│  Σ Stone Weight (g): 0.4500                                      │
│                                                                   │
│ Notes: Batch 2026-Q2 — check certification                       │
├──────────────────────────────────────────────────────────────────┤
│  Prepared by:       Approved by:        Customer Acknowledgment:  │
│  _______________    ________________    _________________________  │
│  Signature / Date   Signature / Date    Signature / Date         │
└──────────────────────────────────────────────────────────────────┘
```

### Print Columns (role-filtered)

```typescript
const JM_COLS = [
  { key: 'line_no',              label: 'No.'            },
  { key: 'sku_jwmold',           label: 'SKU JWMold', sku: true  },
  { key: 'qty_pcs',              label: 'Qty',        mono: true },
  { key: 'description',          label: 'Description'           },
  { key: 'class',                label: 'Class'                 },
  { key: 'sub_class',            label: 'Sub Class'             },
  { key: 'metal_type',           label: 'Metal'                 },
  { key: 'notes',                label: 'Notes',      notes: true },
  { key: 'weight_total_gr',      label: 'Total Wt (g)', mono: true },
  { key: 'weight_gold_actual_gr',label: 'Gold Wt (g)',  mono: true },
  { key: 'weight_no_gem_gr',     label: 'No-Gem Wt (g)', mono: true },
  { key: 'gold_value_usd',  label: 'Gold Value', price: true, adminOnly: true },
  { key: 'hpusa',           label: 'HPUSA',      price: true, adminOnly: true },
  { key: 'cif_price',       label: 'CIF',        price: true, adminOnly: true },
  { key: 'tag_price',       label: 'Tag',        price: true, adminOnly: true },
]
// viewer/user: chỉ thấy cols không có adminOnly
// admin/manager: thấy tất cả
```

### Color Preservation (print)
```css
/* Phải dùng cả 2 vendor prefix: */
-webkit-print-color-adjust: exact;
print-color-adjust: exact;

/* SKU yellow:   background #FEF3C7 */
/* Ba Sao red:   color #DC2626, fontWeight 700 */
/* Header bg:    #F0EBE4 */
/* Tfoot bg:     #F0EBE4 */
```

### Logo Setup
```
File: /public/hp-logo.png (hoặc .svg)
Height in print: 36pt (~48px)
onError handler: ẩn img → "HP Jewelry" text vẫn visible
```

### @page CSS
```css
@page { size: A4 landscape; margin: 15mm 10mm; }
thead { display: table-header-group; }  /* repeat header mỗi trang */
tfoot { display: table-footer-group; }  /* repeat footer */
tr    { page-break-inside: avoid; }
```

---

## 3. SO SÁNH EXPORT vs PRINT

| Feature | Export Excel | Print PDF |
|---------|-------------|-----------|
| Format | Master-Detail, merge cells | JM Form (flat), A4 landscape |
| Logo | ❌ Không cần | ✅ Bắt buộc |
| Signature block | ❌ Không cần | ✅ Bắt buộc |
| Gem details | ✅ Inline sub-rows (Sheet 1) | ❌ Không show (compact view) |
| Total Stone Weight | Có trong master L col (No-Gem Wt) | ✅ Riêng row trong tfoot |
| Role filter | ✅ canSeePrice (M–Q) | ✅ adminOnly cols |
| Ba Sao | N/A (text only) | ✅ Red #DC2626 preserved |
| Trigger | GET /api/invoices/[id]/export | window.open('/invoices/[id]/print') |
| Filename | invoice-{PO}.xlsx | Browser print dialog / Save PDF |

---

## 4. RÀNG BUỘC BẮT BUỘC

```
Export:
✓ GENERATED cols (weight_gr, total_price, total_setting_fee) → đọc từ DB, KHÔNG tính lại
✓ canSeePrice → admin/manager: hiện M–Q; user/viewer: bỏ M–Q
✓ Merge cells chỉ khi item có >= 2 gems
✓ Item không có gem → 1 row, gem cols empty, không merge
✓ Filename: invoice-{po_number}.xlsx
✓ Cache-Control: no-store
✓ quality (P.chất) phải có trong gem columns
✓ KHÔNG bundle SheetJS vào client — route.ts là server-only

Print:
✓ Logo /public/hp-logo.png + onError graceful fallback
✓ Signature block 3 cột bắt buộc
✓ SKU #FEF3C7 + -webkit-print-color-adjust: exact
✓ Ba Sao #DC2626 + print-color-adjust: exact
✓ Tfoot: adminOnly totals chỉ hiện khi canSeePrice
✓ Total_Stone_Weight row: chỉ khi totGemWt > 0
✓ Auto-print sau 300ms khi data load
✓ thead display: table-header-group (repeat header)
✓ Không render nav/topbar trong print (no-print class)
```

---

## 5. TRIGGER BUTTONS (UI)

```tsx
{/* Export — không cần JS, href direct download */}
<a href={`/api/invoices/${id}/export`}>
  <i className="fa-solid fa-file-export" /> Export Excel
</a>

{/* Print — mở tab mới */}
<a href={`/invoices/${id}/print`} target="_blank" rel="noreferrer">
  <i className="fa-solid fa-print" /> Print
</a>
```

Cả 2 buttons đã có trong `app/(dashboard)/invoices/[id]/page.tsx` lines 100–105. Không cần sửa.

---

## 6. KIỂM TRA SAU KHI DEPLOY

```
Export Excel:
[ ] Download file .xlsx thành công
[ ] Sheet "Invoice" có cấu trúc Master-Detail
[ ] Item với 2 gems → 2 rows, master cols A-L merged
[ ] Item với 0 gems → 1 row, gem cols trống
[ ] quality (P.chất) hiện trong col U
[ ] GENERATED cols (weight_gr, total_price, total_setting_fee) đúng giá trị từ DB
[ ] admin: thấy cols M-Q (Gold Value, HPUSA, CIF, Tag, FR)
[ ] user/viewer: cols M-Q không xuất hiện

Print:
[ ] A4 landscape khi in
[ ] Logo hiện (hoặc text fallback nếu file chưa có)
[ ] SKU cells màu vàng #FEF3C7 được giữ khi print
[ ] Ba Sao notes màu đỏ được giữ khi print
[ ] Signature block 3 cột cuối trang
[ ] Total_Stone_Weight row trong tfoot (khi có gems)
[ ] Header repeat trên mỗi trang (nhiều items)
[ ] Totals (HPUSA, CIF) chỉ hiện với admin/manager
```
