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

// ============================================================
// SO/MO VALIDATION — QUYẾT ĐỊNH THIẾT KẾ
// ============================================================
// [THAM KHẢO] §2.2 nói "Nếu SKU hoặc SO#/MO# không tồn tại trong thư viện BOM"
//
// QUYẾT ĐỊNH: Chỉ validate SKU (từ bom_products), KHÔNG validate SO/MO.
// Lý do:
// - SO/MO (VD: "SO25.10008-MO26.36400") là mã đơn hàng bán/sản xuất từ hệ thống ERP ngoài
// - Chúng KHÔNG nằm trong bảng bom_products — không có catalog để lookup
// - SO/MO là optional field, user có thể để trống hoặc điền tự do
// - Validate SKU đã đủ để đảm bảo data integrity với BOM
// ============================================================

async function validateRows(rows: any[][]): Promise<{
  valid: ImportRow[]
  errors: ValidationError[]
}> {
  const valid: ImportRow[] = []
  const errors: ValidationError[] = []
  
  // Batch lookup tất cả SKUs trong 1 request
  const skus = rows.map(r => String(r[2] || '').trim()).filter(Boolean)
  const { data: products } = await fetch(`/api/products?skus=${skus.join(',')}`).then(r => r.json())
  const productSet = new Set(products?.map((p: any) => p.sku_jwmold) ?? [])
  
  rows.forEach((row, idx) => {
    const rowNum = idx + 2  // +2: header row + 0-based index
    const sku = String(row[2] || '').trim()
    
    // Skip truly empty rows (SKU, soMo, qty đều blank)
    if (!sku && !row[3] && !row[6]) return
    
    // ── Validation 1: SKU bắt buộc ──
    if (!sku) {
      errors.push({
        row: rowNum,
        sku: '(trống)',
        // Exact format từ [THAM KHẢO] §2.2:
        message: `Dòng số ${rowNum}: Mã SKU không tồn tại trong hệ thống. Vui lòng kiểm tra lại.`
      })
      return
    }
    
    // ── Validation 2: SKU phải tồn tại trong bom_products ──
    if (!productSet.has(sku)) {
      errors.push({
        row: rowNum,
        sku,
        message: `Dòng số ${rowNum}: Mã SKU "${sku}" không tồn tại trong hệ thống. Vui lòng kiểm tra lại.`
      })
      return
    }
    
    // ── Validation 3: qty ≥ 1 ──
    const qty = parseInt(String(row[6] || '0'))
    if (isNaN(qty) || qty < 1) {
      errors.push({
        row: rowNum,
        sku,
        message: `Dòng số ${rowNum}: Số lượng (Qty) phải ≥ 1.`
      })
      return
    }
    
    // ── Validation 4: gold weight ≤ total weight ──
    const weightTotal = parseFloat(String(row[7] || '0'))
    const weightGold  = parseFloat(String(row[8] || '0'))
    if (weightGold > weightTotal) {
      errors.push({
        row: rowNum,
        sku,
        message: `Dòng số ${rowNum}: Trọng lượng vàng thực (${weightGold}g) không thể lớn hơn trọng lượng tổng (${weightTotal}g).`
      })
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

// Auto-populate từ bom_products — bao gồm image_url
// [THAM KHẢO] §2.2: "hệ thống tự động tải hình ảnh từ thư viện sản phẩm"
const { data: products } = await db
  .from('bom_products')
  .select('sku_jwmold, description, class, sub_class, metal_type, labor_fee, casting_fee, design_fee, resin_fee, misc_fee, image_url')
  .in('sku_jwmold', skus)
const feeMap = Object.fromEntries(products.map(p => [p.sku_jwmold, p]))

// Build insert rows — bao gồm image_url (denormalized tại thời điểm import):
const itemsToInsert = rows.map((row, idx) => ({
  invoice_id:            invoiceId,
  line_no:               startLineNo + idx,
  sku_jwmold:            row.sku,
  so_mo_code:            row.soMo      || null,
  vendor_model:          row.vendorModel || null,
  description:           row.description || feeMap[row.sku]?.description || null,
  class:                 row.class      || feeMap[row.sku]?.class        || null,
  sub_class:             row.subClass   || feeMap[row.sku]?.sub_class    || null,
  metal_type:            row.metalType  || feeMap[row.sku]?.metal_type   || null,
  qty_pcs:               row.qty,
  weight_total_gr:       row.weightTotal,
  weight_gold_actual_gr: row.weightGold,
  image_url:             feeMap[row.sku]?.image_url ?? null,   // ← auto-load từ BOM
  labor_fee:             feeMap[row.sku]?.labor_fee   ?? 0,
  casting_fee:           feeMap[row.sku]?.casting_fee ?? 0,
  design_fee:            feeMap[row.sku]?.design_fee  ?? 0,
  resin_fee:             feeMap[row.sku]?.resin_fee   ?? 0,
  misc_fee:              feeMap[row.sku]?.misc_fee    ?? 0,
}))

await db.from('invoice_items').insert(itemsToInsert)
// Sau đó: recalculateItem() cho từng item vừa insert

// NOTE VỀ "CẢ 2 VIEW" ([THAM KHẢO] §2.2):
// "điền tự động toàn bộ thông tin chi tiết vào cả 2 View"
// → JM Form View và Detail View đều đọc từ invoice_items table
// → Khi insert xong, cả 2 views tự động phản ánh data mới sau onRefresh()
// → Không cần action gì thêm — 1 INSERT phục vụ cả 2 views
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

> **Nguồn:** [THAM KHẢO] §5 — "Xuất chính xác lưới dữ liệu đang hiển thị theo đúng định dạng mẫu, **giữ nguyên cấu trúc dòng Master-Detail (Merge cell hợp lý ở các cột thông tin chung sản phẩm)**."

### Trigger

```tsx
// Button trong Invoice Detail action bar:
<a href={`/api/invoices/${id}/export`} download>
  <i className="fa-solid fa-file-export" /> Export Excel
</a>
// Hoặc fetch + blob download:
// GET /api/invoices/[id]/export
```

---

### Format: Master-Detail Single Sheet với Merge Cells

**Layout mỗi item trong Excel:**

```
| MASTER columns (product info)          | GAP | DETAIL columns (gem info per row)     |
|----------------------------------------|-----|---------------------------------------|
| No | SKU | Desc | Qty | Wt | ... | CIF | --- | Gem Type | Quality | ... | Total Fee |
|  1 | R-001 | Ring | 2  | 5.2| ... |$660 |     | Diamond  | VVS1    | ... | $50       |
|    |       |      |    |    |     |     |     | Ruby     | VF      | ... | $24       |
|  2 | P-002 | Pend | 1  | 3.1| ... |$418 |     | (no gems)                            |
```

- Item có N gems → chiếm N rows, MASTER columns bị **merge dọc** N rows
- Item không có gems → 1 row, không merge
- SheetJS free version hỗ trợ merge cells qua `ws['!merges']`

---

### Column Spec

#### MASTER Columns (sản phẩm — merge dọc khi nhiều gem)

| Col | Header | DB Field | Visible |
|-----|--------|----------|---------|
| A | No. | `line_no` | All |
| B | SKU JWMold | `sku_jwmold` | All |
| C | SO/MO | `so_mo_code` | All |
| D | Description | `description` | All |
| E | Class | `class` | All |
| F | Sub Class | `sub_class` | All |
| G | Size | `size` | All |
| H | Metal | `metal_type` | All |
| I | Qty (pcs) | `qty_pcs` | All |
| J | Total Wt (g) | `weight_total_gr` | All |
| K | Gold Wt (g) | `weight_gold_actual_gr` | All |
| L | No-Gem Wt (g) | `weight_no_gem_gr` | All |
| M | Gold Value | `gold_value_usd` | admin/manager |
| N | HPUSA | `hpusa` | admin/manager |
| O | CIF | `cif_price` | admin/manager |
| P | Tag | `tag_price` | admin/manager |
| Q | FR | `fr_price` | admin/manager |

#### (Blank separator column R)

#### DETAIL Columns (đá tấm — mỗi gem 1 row)

| Col | Header | DB Field | Notes |
|-----|--------|----------|-------|
| S | Gem Type | `gem_type` | |
| T | Quality | `quality` | P. chất — VVS1, LG... |
| U | Shape | `shape` | |
| V | Size (mm) | `size_mm` | |
| W | Gem Qty | `qty_pcs` | |
| X | Wt After (ct) | `weight_ct_after` | |
| Y | Wt (gr) | `weight_gr` | GENERATED |
| Z | $/ct | `unit_price_per_ct` | |
| AA | T.Giá Xoàn | `total_price` | GENERATED |
| AB | Setting | `setting_type` | |
| AC | Fee/pc | `setting_fee_per_pcs` | |
| AD | Total Fee | `total_setting_fee` | GENERATED |

---

### Implementation — API Route

```typescript
// app/api/invoices/[id]/export/route.ts
import * as XLSX from 'xlsx'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false }, { status: 401 })

  const db = createServiceClient()
  const canSeePrice = ctx.role === 'admin' || ctx.role === 'manager'

  // Load header + items với gem details
  const [{ data: invoice }, { data: items }] = await Promise.all([
    db.from('invoice_headers').select('*, daily_metal_rates(*), pricing_rules(*)').eq('id', params.id).single(),
    db.from('invoice_items').select('*, item_gem_details(*)').eq('invoice_id', params.id).order('line_no'),
  ])
  if (!invoice || !items) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 })

  const wb = XLSX.utils.book_new()

  // ─── Sheet 1: Master-Detail ───────────────────────────────────────────
  const masterCols = [
    'No.', 'SKU JWMold', 'SO/MO', 'Description', 'Class', 'Sub Class',
    'Size', 'Metal', 'Qty', 'Total Wt (g)', 'Gold Wt (g)', 'No-Gem Wt (g)',
    ...(canSeePrice ? ['Gold Value', 'HPUSA', 'CIF', 'Tag', 'FR'] : []),
  ]
  const gemCols = ['', 'Gem Type', 'Quality', 'Shape', 'Size (mm)', 'Gem Qty',
    'Wt After (ct)', 'Wt (g)', '$/ct', 'T.Giá Xoàn', 'Setting', 'Fee/pc', 'Total Fee']

  // Build rows + track merges
  const wsData: any[][] = []
  const merges: XLSX.Range[] = []

  // Header row
  wsData.push([...masterCols, ...gemCols])

  let rowIdx = 1  // 0-based, row 0 = header

  for (const item of items ?? []) {
    const gems = (item.item_gem_details ?? []) as any[]
    const numRows = Math.max(gems.length, 1)  // at least 1 row even with no gems

    for (let g = 0; g < numRows; g++) {
      const gem = gems[g]
      const isFirstRow = g === 0

      // Master columns: only fill on first row
      const masterData = isFirstRow ? [
        item.line_no,
        item.sku_jwmold,
        item.so_mo_code ?? '',
        item.description ?? '',
        item.class ?? '',
        item.sub_class ?? '',
        item.size ?? '',
        item.metal_type ?? '',
        item.qty_pcs,
        fmt4(item.weight_total_gr),
        fmt4(item.weight_gold_actual_gr),
        fmt4(item.weight_no_gem_gr),
        ...(canSeePrice ? [
          fmt2(item.gold_value_usd),
          fmt2(item.hpusa),
          fmt2(item.cif_price),
          fmt2(item.tag_price),
          fmt2(item.fr_price),
        ] : []),
      ] : Array(masterCols.length).fill('')

      // Gem columns
      const gemData = gem ? [
        '',  // separator
        gem.gem_type ?? '',
        gem.quality ?? '',
        gem.shape ?? '',
        gem.size_mm ?? '',
        gem.qty_pcs ?? '',
        fmt4(gem.weight_ct_after),
        fmt4(gem.weight_gr),
        fmt2(gem.unit_price_per_ct),
        fmt2(gem.total_price),
        gem.setting_type ?? '',
        fmt2(gem.setting_fee_per_pcs),
        fmt2(gem.total_setting_fee),
      ] : Array(gemCols.length).fill('')

      wsData.push([...masterData, ...gemData])
    }

    // Add merge ranges for master columns when numRows > 1
    if (numRows > 1) {
      for (let c = 0; c < masterCols.length; c++) {
        merges.push({
          s: { r: rowIdx, c },
          e: { r: rowIdx + numRows - 1, c },
        })
      }
    }

    rowIdx += numRows
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws['!merges'] = merges

  // Column widths
  ws['!cols'] = [
    { wch: 5 }, { wch: 14 }, { wch: 18 }, { wch: 28 }, { wch: 10 }, { wch: 10 },
    { wch: 8 }, { wch: 8 }, { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    ...(canSeePrice ? [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }] : []),
    { wch: 2 },  // separator
    { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 8 },
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Invoice')

  // ─── Sheet 2: Header Info ─────────────────────────────────────────────
  const infoSheet = XLSX.utils.json_to_sheet([{
    'PO Number':    invoice.po_number,
    'MR Number':    invoice.mr_number ?? '',
    'Customer':     invoice.customer_name ?? '',
    'Invoice Date': invoice.invoice_date ?? '',
    'Status':       invoice.status,
    'Rate Date':    (invoice as any).daily_metal_rates?.rate_date ?? '',
    'Pricing Rule': (invoice as any).pricing_rules?.name ?? '',
    ...(canSeePrice ? {
      'CIF Multiplier': (invoice as any).pricing_rules?.cif_multiplier ?? '',
      'Tag Multiplier': (invoice as any).pricing_rules?.tag_multiplier ?? '',
      'FR Multiplier':  (invoice as any).pricing_rules?.fr_multiplier ?? '',
    } : {}),
  }])
  XLSX.utils.book_append_sheet(wb, infoSheet, 'Info')

  // ─── Response ────────────────────────────────────────────────────────
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return new NextResponse(buffer, {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="invoice-${invoice.po_number}.xlsx"`,
      'Cache-Control':       'no-store',
    },
  })
}

// Helpers
function fmt2(n: any): string {
  if (n == null) return ''
  const num = parseFloat(String(n))
  return isNaN(num) ? '' : `$${num.toFixed(2)}`
}
function fmt4(n: any): string {
  if (n == null) return ''
  const num = parseFloat(String(n))
  return isNaN(num) ? '' : num.toFixed(4)
}
```

---

### Role Visibility

```
admin/manager (canSeePrice = true):
  → Export tất cả: Master cols M-Q (Gold Value, HPUSA, CIF, Tag, FR)
  → Info sheet: CIF/Tag/FR multipliers

user/viewer (canSeePrice = false):
  → Bỏ Master cols M-Q
  → Info sheet: không có multipliers
```

---

### Ràng buộc Export

```
✓ SheetJS ws['!merges'] — merge master cols dọc khi item có nhiều gems
✓ GENERATED cols (weight_gr, total_price, total_setting_fee) — đọc từ DB, KHÔNG tính lại
✓ quality field (P. chất) phải có trong gem columns
✓ Filename: invoice-{po_number}.xlsx
✓ fmt4() cho weights (4 decimals), fmt2() cho prices ($X.XX)
✓ Cache-Control: no-store
✓ Server-side only — SheetJS KHÔNG bundle vào client
✓ Items không có gem → 1 row, không merge, gem columns rỗng
✓ Sort: items theo line_no ASC, gems theo sort_order ASC
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

## 8. ADD ROW THỦ CÔNG — Validation ([THAM KHẢO] §2.2)

> Áp dụng cho `AddItemModal.tsx` — khi user gõ SKU và bấm Lookup/Enter.

### Validation khi Add Row

```typescript
// Khi user nhập SKU → blur hoặc click Lookup:
async function lookupSku(sku: string) {
  if (!sku.trim()) {
    setSkuError('Mã SKU không được để trống.')
    return
  }

  const res  = await fetch(`/api/products?skus=${encodeURIComponent(sku.trim().toUpperCase())}`)
  const json = await res.json()

  if (!json.success || !json.data?.length) {
    // Exact format từ [THAM KHẢO] §2.2:
    setSkuError(`Mã SKU "${sku}" không tồn tại trong hệ thống. Vui lòng kiểm tra lại.`)
    setSkuResolved(false)
    return
  }

  const prod = json.data[0]
  // Auto-populate TẤT CẢ fields từ bom_products:
  setForm(v => ({
    ...v,
    sku_jwmold:  sku.trim().toUpperCase(),
    description: prod.description ?? v.description,
    class:       prod.class       ?? v.class,
    sub_class:   prod.sub_class   ?? v.sub_class,
    metal_type:  prod.metal_type  ?? v.metal_type,
    labor_fee:   String(prod.labor_fee   ?? 0),
    casting_fee: String(prod.casting_fee ?? 0),
    design_fee:  String(prod.design_fee  ?? 0),
    resin_fee:   String(prod.resin_fee   ?? 0),
    misc_fee:    String(prod.misc_fee    ?? 0),
    image_url:   prod.image_url   ?? '',   // ← auto-load ảnh từ thư viện
  }))
  setSkuResolved(true)
  // Success feedback: "SKU found — fields auto-filled from catalog"
}
```

### "Vào cả 2 View" sau khi Add Row

```
Khi user submit AddItemModal → POST /api/invoices/[id]/items → INSERT invoice_items
→ onSaved() callback → parent gọi fetchData() → reload toàn bộ invoice
→ JM Form View đọc lại items → hiện item mới
→ Detail View đọc lại items → hiện card mới
→ Cả 2 views tự động sync — KHÔNG cần xử lý gì thêm
```

---

## 9. ERROR MESSAGE FORMAT CHUẨN ([THAM KHẢO] §2.2)

Tất cả error messages liên quan đến SKU/validation phải theo format:

```
"Dòng số [X]: Mã SKU/SO-MO không tồn tại trong hệ thống. Vui lòng kiểm tra lại."
```

Áp dụng cụ thể:

| Trường hợp | Message |
|-----------|---------|
| SKU blank khi import | `"Dòng số 5: Mã SKU không tồn tại trong hệ thống. Vui lòng kiểm tra lại."` |
| SKU không trong BOM khi import | `"Dòng số 5: Mã SKU "RING-999" không tồn tại trong hệ thống. Vui lòng kiểm tra lại."` |
| SKU không trong BOM khi Add Row | `"Mã SKU "RING-999" không tồn tại trong hệ thống. Vui lòng kiểm tra lại."` |
| Qty < 1 | `"Dòng số 5: Số lượng (Qty) phải ≥ 1."` |
| Gold weight > Total | `"Dòng số 5: Trọng lượng vàng thực (X.Xg) không thể lớn hơn trọng lượng tổng (Y.Yg)."` |

---

## 10. RÀNG BUỘC

```
✓ Invoice phải ở trạng thái KHÔNG locked (is_locked = false)
✓ Invoice status phải là 'draft' hoặc 'pending_approval' (manager/admin) — xem invoice-workflow.md §3b
✓ SKU phải tồn tại trong bom_products — duy nhất validation được check với BOM
✓ SO/MO KHÔNG validate với BOM — đây là mã ERP ngoài, chỉ lưu text
✓ weight_gold_actual_gr ≤ weight_total_gr
✓ qty_pcs ≥ 1
✓ image_url auto-copy từ bom_products khi import + add row
✓ Fees auto-copy từ bom_products (labor, casting, design, resin, misc)
✓ line_no auto-assign = MAX(line_no) + sequential (server-side)
✓ Sau import/add → trigger recalculate chain cho từng item
✓ Invalid rows hiển thị Error Log rõ Row#, SKU, Error — không block valid rows
✓ Empty rows (SKU blank) → silently skip
✓ Partial import OK: valid rows được import, invalid rows hiện error table
✓ Cả 2 views (JM Form + Detail) tự động phản ánh data sau onRefresh()
```
