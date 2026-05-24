# Import / Export Excel — JM Format Spec

> **Phạm vi:** Import page `/import` + Export button trong Invoice Detail
> **Library:** SheetJS (`xlsx`) cho cả read và write
> **Format:** JM Excel format (cột A–L, 1 row/SKU)

---

## 1. IMPORT — COLUMN MAPPING

### JM Excel Format → `invoice_items`

| Excel Col | DB Column | Type | Ghi chú |
|-----------|-----------|------|---------|
| A | `store` | TEXT | Cửa hàng (VD: "US ONL", "VN SR") |
| B | `location_store` | TEXT | Vị trí trong cửa hàng |
| C | `sku_jwmold` | TEXT | **SKU — lookup bom_products** |
| D | `so_mo_code` | TEXT | SO/MO number |
| E | `vendor_model` | TEXT | Vendor model number |
| F | `description` | TEXT | Mô tả sản phẩm |
| G | `qty_pcs` | INTEGER | Số lượng (parse int) |
| H | `weight_total_gr` | NUMERIC | Tổng trọng lượng (gram) |
| I | `weight_gold_actual_gr` | NUMERIC | Trọng lượng vàng thực (gram) |
| J | `metal_type` | TEXT | Loại kim loại (18KW, 18KY, 14KY, ...) |
| K | `class` | TEXT | Phân loại sản phẩm |
| L | `sub_class` | TEXT | Phân loại con |

### Row Rules

- **Row 1**: Header row → bỏ qua
- **Empty rows**: Bỏ qua nếu cột C (SKU) blank
- **1-based line_no**: Server gán `line_no = index + 1` sau khi import

---

## 2. IMPORT FLOW

### Step 1 — Upload & Parse

```typescript
// Client: drag-drop hoặc file input → <input type="file" accept=".xlsx,.xls,.csv">
// Parse với SheetJS:
import * as XLSX from 'xlsx'

function parseExcelFile(file: File): Promise<ExcelRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const data = new Uint8Array(e.target!.result as ArrayBuffer)
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,       // array of arrays
        defval: '',      // default empty cell = ''
        blankrows: false // skip fully blank rows
      })
      resolve(rows.slice(1))  // skip header row 1
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}
```

### Step 2 — Validate Rows

```typescript
interface ImportRow {
  rowNum:   number       // 1-based Excel row number (for error display)
  store:    string
  location: string
  sku:      string
  soMo:     string
  vendorModel: string
  description: string
  qty:      number
  weightTotal: number
  weightGold:  number
  metalType:   string
  class:    string
  subClass: string
}

interface ValidationError {
  row:     number
  sku:     string
  message: string
}

async function validateRows(rows: any[][]): Promise<{
  valid: ImportRow[]
  errors: ValidationError[]
}> {
  const valid: ImportRow[] = []
  const errors: ValidationError[] = []
  
  // Collect all SKUs → batch lookup bom_products
  const skus = rows.map(r => String(r[2] || '').trim()).filter(Boolean)
  const { data: products } = await fetch(`/api/products?skus=${skus.join(',')}`).then(r => r.json())
  const productSet = new Set(products?.map((p: any) => p.sku_jwmold) ?? [])
  
  rows.forEach((row, idx) => {
    const rowNum = idx + 2  // +2: header + 0-based index
    const sku = String(row[2] || '').trim()
    
    // Skip truly empty rows
    if (!sku && !row[3] && !row[6]) return
    
    // Validate SKU
    if (!sku) {
      errors.push({ row: rowNum, sku: '(empty)', message: 'SKU is required' })
      return
    }
    
    if (!productSet.has(sku)) {
      errors.push({ row: rowNum, sku, message: `SKU "${sku}" not found in product catalog` })
      return
    }
    
    // Validate qty
    const qty = parseInt(String(row[6] || '0'))
    if (isNaN(qty) || qty < 1) {
      errors.push({ row: rowNum, sku, message: 'Qty must be ≥ 1' })
      return
    }
    
    // Validate weights
    const weightTotal = parseFloat(String(row[7] || '0'))
    const weightGold  = parseFloat(String(row[8] || '0'))
    if (weightGold > weightTotal) {
      errors.push({ row: rowNum, sku, message: 'Gold weight cannot exceed total weight' })
      return
    }
    
    valid.push({
      rowNum,
      store:       String(row[0] || '').trim(),
      location:    String(row[1] || '').trim(),
      sku,
      soMo:        String(row[3] || '').trim(),
      vendorModel: String(row[4] || '').trim(),
      description: String(row[5] || '').trim(),
      qty,
      weightTotal: isNaN(weightTotal) ? 0 : weightTotal,
      weightGold:  isNaN(weightGold)  ? 0 : weightGold,
      metalType:   String(row[9]  || '').trim(),
      class:       String(row[10] || '').trim(),
      subClass:    String(row[11] || '').trim(),
    })
  })
  
  return { valid, errors }
}
```

### Step 3 — Preview & Confirm

```
┌──────────────────────────────────────────────────────────────┐
│ IMPORT PREVIEW                                               │
├──────────────────────────────────────────────────────────────┤
│ ✓ 18 rows valid                                              │
│ ✗ 3 rows with errors (see below)                            │
│                                                              │
│ [VALID ROWS TABLE]                                           │
│  # | SKU | Description | Qty | Weight | Metal              │
│  ─────────────────────────────────────────────              │
│  1 | RING-001 | Gold Ring 18KW | 2 | 5.2000g | 18KW       │
│  ...                                                        │
│                                                              │
│ [ERROR TABLE]                                                │
│  Row | SKU | Error                                          │
│  ─────────────────────────────────────────                  │
│  5   | PEND-999 | SKU not found in product catalog         │
│  12  | (empty)  | SKU is required                          │
│  17  | RING-002 | Gold weight cannot exceed total weight   │
│                                                              │
│                [Cancel]  [Import N Valid Rows]              │
└──────────────────────────────────────────────────────────────┘
```

### Step 4 — POST /api/import

```typescript
// Payload:
{
  invoiceId: string,
  rows: ImportRow[]
}

// Server logic:
// 1. Check is_locked → 403 nếu locked
// 2. Check invoice exists + user has access
// 3. Load invoice → get metal_rate_id → load rate for pricing
// 4. Load pricing_rule từ invoice.pricing_rule_id
// 5. Batch lookup fees từ bom_products (labor_fee, casting_fee, design_fee, resin_fee, misc_fee)
// 6. GET max line_no từ invoice_items → start từ max+1
// 7. Bulk INSERT invoice_items (N rows)
// 8. Trigger recalculateItem() cho từng item

// Fee auto-copy từ bom_products:
const { data: products } = await db
  .from('bom_products')
  .select('sku_jwmold, labor_fee, casting_fee, design_fee, resin_fee, misc_fee')
  .in('sku_jwmold', skus)
const feeMap = Object.fromEntries(products.map(p => [p.sku_jwmold, p]))

// Build insert rows:
const itemsToInsert = rows.map((row, idx) => ({
  invoice_id:           invoiceId,
  line_no:              startLineNo + idx,
  sku_jwmold:           row.sku,
  description:          row.description || feeMap[row.sku]?.description || '',
  qty_pcs:              row.qty,
  weight_total_gr:      row.weightTotal,
  weight_gold_actual_gr: row.weightGold,
  metal_type:           row.metalType,
  class:                row.class,
  sub_class:            row.subClass,
  labor_fee:            feeMap[row.sku]?.labor_fee ?? 0,
  casting_fee:          feeMap[row.sku]?.casting_fee ?? 0,
  design_fee:           feeMap[row.sku]?.design_fee ?? 0,
  resin_fee:            feeMap[row.sku]?.resin_fee ?? 0,
  misc_fee:             feeMap[row.sku]?.misc_fee ?? 0,
}))

await db.from('invoice_items').insert(itemsToInsert)
// Sau đó: recalculateItem() cho từng item vừa insert
```

---

## 3. IMPORT PAGE UI

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│ PAGE HEADER: "Import Items" (serif h1)                       │
│ Back to: Invoice #[PO]                                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  STEP 1 — Upload File                                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                                                      │   │
│  │     [fa-file-import icon large]                      │   │
│  │     Drag & drop Excel file here                      │   │
│  │     or [Browse File] button                          │   │
│  │     Accepts: .xlsx, .xls                             │   │
│  │                                                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  [Download Template] — download blank JM format template    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Drop Zone States

```tsx
// Idle: dashed border var(--border-base), bg transparent
// Drag over: dashed border var(--border-strong), bg var(--bg-hover)
// File selected: solid border var(--color-success), show filename

const DropZone = styled.div<{ isDragOver: boolean; hasFile: boolean }>`
  border: 2px dashed ${props =>
    props.hasFile ? 'var(--color-success)'
    : props.isDragOver ? 'var(--border-strong)'
    : 'var(--border-base)'};
  background: ${props => props.isDragOver ? 'var(--bg-hover)' : 'transparent'};
  padding: 3rem;
  text-align: center;
  transition: all 0.2s;
  cursor: pointer;
`
```

### Error Table Display

```tsx
// Chỉ hiện khi có errors:
<table>
  <thead>
    <tr>
      <th>Row</th>
      <th>SKU</th>
      <th>Error</th>
    </tr>
  </thead>
  <tbody>
    {errors.map(err => (
      <tr key={err.row}>
        <td style={{ color: 'var(--color-danger)', fontFamily: 'var(--font-mono)' }}>
          {err.row}
        </td>
        <td style={{ fontFamily: 'var(--font-mono)' }}>{err.sku}</td>
        <td style={{ color: 'var(--color-danger)' }}>{err.message}</td>
      </tr>
    ))}
  </tbody>
</table>
```

---

## 4. EXPORT EXCEL

### Trigger

```tsx
// Button trong Invoice Detail action bar:
<button onClick={handleExport}>
  <i className="fa-solid fa-file-export" /> Export Excel
</button>
// GET /api/export?invoiceId=...
```

### GET /api/export?invoiceId=...

```typescript
// 1. Load invoice_headers + invoice_items + item_gem_details
// 2. Build workbook với SheetJS
// 3. Return as binary file download

import * as XLSX from 'xlsx'

// Sheet 1: Invoice Items (JM format compatible)
const itemRows = items.map((item, idx) => ({
  'No.':            item.line_no,
  'SKU':            item.sku_jwmold,
  'Description':    item.description,
  'Class':          item.class,
  'Sub Class':      item.sub_class,
  'Qty':            item.qty_pcs,
  'Total Weight (g)': formatWeight(item.weight_total_gr),
  'Gold Weight (g)':  formatWeight(item.weight_gold_actual_gr),
  'No-Gem Weight (g)': formatWeight(item.weight_no_gem_gr),
  'Metal Type':     item.metal_type,
  'Gold Value (USD)':  formatUSD(item.gold_value_usd),
  'HPUSA':          formatUSD(item.hpusa),
  'CIF Price':      formatUSD(item.cif_price),
  'Tag Price':      formatUSD(item.tag_price),   // admin/manager only
  'FR Price':       formatUSD(item.fr_price),    // admin/manager only
}))

// Sheet 2: Invoice Header
const headerRow = [{
  'PO Number':     invoice.po_number,
  'Status':        invoice.status,
  'Customer':      invoice.customer_name,
  'Date':          invoice.invoice_date,
  'Metal Rate Date': metalRate?.rate_date,
  'Pricing Rule':  pricingRule?.name,
}]

// Build workbook:
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemRows), 'Items')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(headerRow), 'Header')

// Response:
const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
return new NextResponse(buffer, {
  headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="invoice-${invoice.po_number}.xlsx"`,
  }
})
```

### Column Visibility by Role

```typescript
// admin/manager → export tất cả 15 cột kể cả Tag/FR Price
// user/viewer   → export 13 cột, bỏ Tag Price và FR Price

const canSeePrice = role === 'manager' || role === 'admin'

const itemRows = items.map(item => {
  const base = { /* cols 1-13 */ }
  if (canSeePrice) {
    base['Tag Price'] = formatUSD(item.tag_price)
    base['FR Price']  = formatUSD(item.fr_price)
  }
  return base
})
```

---

## 5. EXCEL TEMPLATE DOWNLOAD

```typescript
// GET /api/export/template
// Returns blank JM format Excel with headers only

const templateRow = {
  'Store': '',
  'Location': '',
  'SKU': '',
  'SO/MO': '',
  'Vendor Model': '',
  'Description': '',
  'Qty': '',
  'Total Weight (g)': '',
  'Gold Weight (g)': '',
  'Metal Type': '',
  'Class': '',
  'Sub Class': '',
}

const ws = XLSX.utils.json_to_sheet([templateRow])
// Style header row (bold) — SheetJS Pro feature, skip in Free version
```

---

## 6. COMPONENT STRUCTURE

```
app/(dashboard)/import/page.tsx
components/import/
  DropZone.tsx              ← File upload area
  ImportPreview.tsx         ← Valid rows table
  ImportErrorTable.tsx      ← Error rows table
  ImportProgress.tsx        ← Upload/save progress indicator
```

---

## 7. STATE FLOW

```typescript
type ImportState =
  | { stage: 'idle' }
  | { stage: 'parsing'; filename: string }
  | { stage: 'preview'; valid: ImportRow[]; errors: ValidationError[] }
  | { stage: 'importing'; progress: number; total: number }
  | { stage: 'done'; imported: number; invoiceId: string }
  | { stage: 'error'; message: string }
```

---

## 8. RÀNG BUỘC

```
✓ Invoice phải ở trạng thái KHÔNG locked (is_locked = false)
✓ SKU phải tồn tại trong bom_products
✓ weight_gold_actual_gr ≤ weight_total_gr
✓ qty_pcs ≥ 1
✓ Fees auto-copy từ bom_products (không user-input khi import)
✓ line_no auto-assign = MAX(line_no) + sequential (server-side)
✓ Sau import → trigger recalculate chain cho từng item
✓ Invalid rows hiển thị rõ Row#, SKU, Error — không block import của valid rows
✓ Empty rows (SKU blank) → silently skip
```
