# Import Module — V-Invoice

> **Route:** `/import?invoiceId=xxx`
> **Library:** SheetJS (`xlsx`) — parse `.xlsx` / `.xls` / `.csv`
> **Format:** JM Excel format (cols A–L, 1 row/SKU, row 1 = header)
> **Guard:** Invoice must NOT be locked (`is_locked = false`)

---

## 1. TỔNG QUAN

Import page cho phép user upload file Excel JM format để thêm nhiều items vào 1 invoice cùng lúc. Flow gồm 4 giai đoạn: Upload → Parse → Preview & Validate → Confirm Import.

```
┌──────────────────────────────────────────────────────────────┐
│ Import Items                                                 │
│ ← Back to Invoice #PO-2026-001                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  STEP 1 — Upload File                                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                                                      │   │
│  │     [fa-file-import  48px]                           │   │
│  │     Drag & drop Excel file here                      │   │
│  │     or  [Browse File]                                │   │
│  │     Accepts: .xlsx, .xls                             │   │
│  │                                                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  [↓ Download Template]                                       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. JM EXCEL COLUMN MAPPING

| Excel Col | Header Label | DB Column | Type | Ghi chú |
|-----------|-------------|-----------|------|---------|
| A | Store | `store` | TEXT | VD: "US ONL", "VN SR" |
| B | Location | `location_store` | TEXT | Vị trí trong cửa hàng |
| C | **SKU** | `sku_jwmold` | TEXT | **Lookup key — bắt buộc** |
| D | SO/MO | `so_mo_code` | TEXT | SO/MO number |
| E | Vendor Model | `vendor_model` | TEXT | Vendor model number |
| F | Description | `description` | TEXT | Mô tả sản phẩm |
| G | Qty | `qty_pcs` | INTEGER | Số lượng — parse int |
| H | Total Weight (g) | `weight_total_gr` | NUMERIC | Tổng trọng lượng |
| I | Gold Weight (g) | `weight_gold_actual_gr` | NUMERIC | Trọng lượng vàng thực |
| J | Metal Type | `metal_type` | TEXT | 18KW, 18KY, 14KY, ... |
| K | Class | `class` | TEXT | Phân loại sản phẩm |
| L | Sub Class | `sub_class` | TEXT | Phân loại con |

### Row Rules

```
- Row 1: Header → skip
- Empty rows: Skip nếu col C (SKU) blank
- 1-based line_no: Server gán line_no = MAX(existing) + sequential index
```

---

## 3. STATE MACHINE

```typescript
type ImportState =
  | { stage: 'idle' }
  | { stage: 'parsing'; filename: string }
  | { stage: 'preview'; valid: ImportRow[]; errors: ValidationError[]; filename: string }
  | { stage: 'importing'; progress: number; total: number }
  | { stage: 'done'; imported: number; invoiceId: string }
  | { stage: 'error'; message: string }
```

### Stage Transitions

```
idle
  → [file dropped/selected] → parsing
  
parsing
  → [parse OK] → preview
  → [parse fail] → error

preview
  → [click Cancel] → idle
  → [click Import N rows] → importing

importing
  → [all rows saved] → done
  → [server error] → error

done
  → [click Import More] → idle
  → [click Back to Invoice] → navigate to /invoices/[id]

error
  → [click Try Again] → idle
```

---

## 4. PARSE LOGIC (Client-side)

```typescript
import * as XLSX from 'xlsx'

function parseExcelFile(file: File): Promise<any[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const data = new Uint8Array(e.target!.result as ArrayBuffer)
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,       // returns array of arrays
        defval: '',      // empty cell = ''
        blankrows: false // skip fully blank rows
      })
      resolve(rows.slice(1))  // skip header row 1
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}
```

---

## 5. VALIDATION (Client-side + Server-side)

### TypeScript Types

```typescript
interface ImportRow {
  rowNum:      number    // 1-based Excel row number (for error display)
  store:       string
  location:    string
  sku:         string
  soMo:        string
  vendorModel: string
  description: string
  qty:         number
  weightTotal: number
  weightGold:  number
  metalType:   string
  class:       string
  subClass:    string
}

interface ValidationError {
  row:     number
  sku:     string
  message: string
}
```

### Client-side Validation Flow

```typescript
async function validateRows(rows: any[][]): Promise<{
  valid: ImportRow[]
  errors: ValidationError[]
}> {
  const valid: ImportRow[] = []
  const errors: ValidationError[] = []

  // 1. Collect all non-blank SKUs for batch lookup
  const skus = rows
    .map(r => String(r[2] || '').trim())
    .filter(Boolean)

  // 2. Batch lookup: GET /api/products?skus=SKU1,SKU2,...
  const res = await fetch(`/api/products?skus=${skus.join(',')}`)
  const { data: products } = await res.json()
  const productSet = new Set<string>(products?.map((p: any) => p.sku_jwmold) ?? [])

  rows.forEach((row, idx) => {
    const rowNum = idx + 2  // +2: header row + 0-based index
    const sku = String(row[2] || '').trim()

    // Skip truly empty rows (no SKU, no SO/MO, no qty)
    if (!sku && !row[3] && !row[6]) return

    // Rule 1: SKU required
    if (!sku) {
      errors.push({ row: rowNum, sku: '(empty)', message: 'SKU is required' })
      return
    }

    // Rule 2: SKU must exist in bom_products and be active
    if (!productSet.has(sku)) {
      errors.push({ row: rowNum, sku, message: `SKU "${sku}" not found in product catalog` })
      return
    }

    // Rule 3: Qty >= 1
    const qty = parseInt(String(row[6] || '0'))
    if (isNaN(qty) || qty < 1) {
      errors.push({ row: rowNum, sku, message: 'Qty must be ≥ 1' })
      return
    }

    // Rule 4: Gold weight <= total weight
    const weightTotal = parseFloat(String(row[7] || '0'))
    const weightGold  = parseFloat(String(row[8] || '0'))
    if (weightGold > weightTotal) {
      errors.push({ row: rowNum, sku, message: 'Gold weight cannot exceed total weight' })
      return
    }

    valid.push({
      rowNum,
      store:       String(row[0]  || '').trim(),
      location:    String(row[1]  || '').trim(),
      sku,
      soMo:        String(row[3]  || '').trim(),
      vendorModel: String(row[4]  || '').trim(),
      description: String(row[5]  || '').trim(),
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

---

## 6. PREVIEW SCREEN

```
┌──────────────────────────────────────────────────────────────┐
│ IMPORT PREVIEW                         filename.xlsx         │
├──────────────────────────────────────────────────────────────┤
│ ✓ 18 rows valid                                              │
│ ✗ 3 rows with errors                                         │
│                                                              │
│ VALID ROWS                                                   │
│ ┌────┬───────────┬─────────────────┬─────┬──────────┬──────┐ │
│ │Row │ SKU       │ Description     │ Qty │ Total(g) │Metal │ │
│ ├────┼───────────┼─────────────────┼─────┼──────────┼──────┤ │
│ │ 2  │ RING-001  │ 18K White Ring  │   2 │  5.2000  │ 18KW │ │
│ │ 3  │ PEND-005  │ Diamond Pendant │   1 │  3.1000  │ 18KW │ │
│ └────┴───────────┴─────────────────┴─────┴──────────┴──────┘ │
│                                                              │
│ ERRORS (3 rows — will be skipped)                            │
│ ┌─────┬───────────┬────────────────────────────────────────┐ │
│ │ Row │ SKU       │ Error                                  │ │
│ ├─────┼───────────┼────────────────────────────────────────┤ │
│ │   5 │ PEND-999  │ SKU "PEND-999" not found in catalog   │ │
│ │  12 │ (empty)   │ SKU is required                        │ │
│ │  17 │ RING-002  │ Gold weight cannot exceed total weight │ │
│ └─────┴───────────┴────────────────────────────────────────┘ │
│                                                              │
│                          [Cancel]  [Import 18 Valid Rows →] │
└──────────────────────────────────────────────────────────────┘
```

### Valid Rows Table Columns

| Col | Field | Format |
|-----|-------|--------|
| Row | `rowNum` | Number (monospace, color: var(--text-secondary)) |
| SKU | `sku` | Monospace, bold |
| Description | `description` | Text |
| Qty | `qty` | Right-align, monospace |
| Total Weight | `weightTotal` | `X.XXXX g`, monospace |
| Gold Weight | `weightGold` | `X.XXXX g`, monospace |
| Metal | `metalType` | Badge outline |

### Error Table Columns

```tsx
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

## 7. POST /api/import

### Request

```typescript
// Method: POST
// Content-Type: application/json
// Body:
{
  invoiceId: string,
  rows: ImportRow[]
}
```

### Server Logic

```typescript
// app/api/import/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { invoiceId, rows } = await req.json()
    const db = createServiceClient()

    // ─── GUARD 1: Invoice exists ──────────────────────────────
    const { data: invoice, error: invErr } = await db
      .from('invoice_headers')
      .select('id, is_locked, status, pricing_rule_id, metal_rate_id')
      .eq('id', invoiceId)
      .single()

    if (invErr || !invoice) {
      return NextResponse.json({ success: false, message: 'Invoice not found.' }, { status: 404 })
    }

    // ─── GUARD 2: is_locked check ─────────────────────────────
    if (invoice.is_locked) {
      return NextResponse.json({
        success: false,
        message: 'Invoice is locked. Import is not allowed.'
      }, { status: 403 })
    }

    // ─── Load pricing rule ────────────────────────────────────
    const { data: pricingRule } = await db
      .from('pricing_rules')
      .select('*')
      .eq('id', invoice.pricing_rule_id)
      .single()

    // ─── Load metal rate ──────────────────────────────────────
    const { data: metalRate } = await db
      .from('daily_metal_rates')
      .select('*')
      .eq('id', invoice.metal_rate_id)
      .single()

    // ─── Batch fetch fees from bom_products ──────────────────
    const skus = rows.map(r => r.sku)
    const { data: products } = await db
      .from('bom_products')
      .select('sku_jwmold, description, labor_fee, casting_fee, design_fee, resin_fee, misc_fee')
      .in('sku_jwmold', skus)
      .eq('is_active', true)

    const feeMap = Object.fromEntries(
      (products ?? []).map(p => [p.sku_jwmold, p])
    )

    // ─── Validate all SKUs still active ──────────────────────
    const inactiveSkus = skus.filter(sku => !feeMap[sku])
    if (inactiveSkus.length > 0) {
      return NextResponse.json({
        success: false,
        message: `SKU(s) not found or inactive: ${inactiveSkus.join(', ')}`
      }, { status: 422 })
    }

    // ─── Get max line_no for this invoice ────────────────────
    const { data: maxLineData } = await db
      .from('invoice_items')
      .select('line_no')
      .eq('invoice_id', invoiceId)
      .order('line_no', { ascending: false })
      .limit(1)
      .single()

    const startLineNo = (maxLineData?.line_no ?? 0) + 1

    // ─── Build insert rows ────────────────────────────────────
    const itemsToInsert = rows.map((row, idx) => ({
      invoice_id:             invoiceId,
      line_no:                startLineNo + idx,
      sku_jwmold:             row.sku,
      description:            row.description || feeMap[row.sku]?.description || '',
      qty_pcs:                row.qty,
      weight_total_gr:        row.weightTotal,
      weight_gold_actual_gr:  row.weightGold,
      metal_type:             row.metalType,
      class:                  row.class,
      sub_class:              row.subClass,
      store:                  row.store,
      location_store:         row.location,
      so_mo_code:             row.soMo,
      vendor_model:           row.vendorModel,
      labor_fee:              feeMap[row.sku]?.labor_fee    ?? 0,
      casting_fee:            feeMap[row.sku]?.casting_fee  ?? 0,
      design_fee:             feeMap[row.sku]?.design_fee   ?? 0,
      resin_fee:              feeMap[row.sku]?.resin_fee    ?? 0,
      misc_fee:               feeMap[row.sku]?.misc_fee     ?? 0,
    }))

    // ─── Bulk INSERT ──────────────────────────────────────────
    const { data: insertedItems, error: insertError } = await db
      .from('invoice_items')
      .insert(itemsToInsert)
      .select('id')

    if (insertError) {
      return NextResponse.json({ success: false, message: insertError.message }, { status: 500 })
    }

    // ─── Trigger recalculate for each inserted item ───────────
    if (pricingRule && metalRate && insertedItems) {
      await Promise.all(
        insertedItems.map(item =>
          recalculateItem(db, item.id, metalRate, pricingRule)
        )
      )
    }

    return NextResponse.json({
      success: true,
      data: { imported: rows.length, startLineNo }
    })
  } catch (err) {
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
```

### Recalculate Chain (after import)

```typescript
// Gọi recalculateItem() cho từng item vừa INSERT
// Hàm này thực hiện đúng 6-step pricing chain:
// 1. weight_gold_actual_gr × metal_rate × (1 + casting_loss_pct/100) = gold_value_usd
// 2. gold_value_usd + Σgem.total_price + Σgem.total_setting_fee + labor_fee
//    + casting_fee + design_fee + resin_fee + misc_fee = hpusa
// 3. hpusa × cif_multiplier = cif_price
// 4. cif_price × tag_multiplier = tag_price
// 5. cif_price × fr_multiplier  = fr_price
// 6. UPDATE invoice_items SET all computed fields

import { recalculateItem } from '@/lib/pricing/recalculate'
```

---

## 8. DROP ZONE COMPONENT

### States

```
idle       → dashed border var(--border-base), transparent bg
drag-over  → dashed border var(--border-strong), bg var(--bg-hover)
has-file   → solid border var(--color-success), show filename
```

### Implementation

```tsx
// components/import/DropZone.tsx

import { useRef, useState, useCallback } from 'react'

interface DropZoneProps {
  onFile: (file: File) => void
  disabled?: boolean
}

export function DropZone({ onFile, disabled }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      alert('Please select an Excel file (.xlsx, .xls)')
      return
    }
    setSelectedFile(file)
    onFile(file)
  }, [onFile])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const dropZoneStyle: React.CSSProperties = {
    border: `2px dashed ${
      selectedFile ? 'var(--color-success)'
      : isDragOver ? 'var(--border-strong)'
      : 'var(--border-base)'
    }`,
    background: isDragOver ? 'var(--bg-hover)' : 'transparent',
    padding: '3rem',
    textAlign: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.2s',
    opacity: disabled ? 0.5 : 1,
  }

  return (
    <div
      style={dropZoneStyle}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />

      {selectedFile ? (
        <>
          <i className="fa-solid fa-file-excel"
             style={{ fontSize: 36, color: 'var(--color-success)', marginBottom: 12, display: 'block' }} />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
            {selectedFile.name}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 4 }}>
            {(selectedFile.size / 1024).toFixed(1)} KB
          </div>
        </>
      ) : (
        <>
          <i className="fa-solid fa-file-import"
             style={{ fontSize: 48, color: 'var(--text-muted)', marginBottom: 16, display: 'block' }} />
          <div style={{ fontSize: 'var(--text-base)', fontWeight: 500 }}>
            Drag & drop Excel file here
          </div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '8px 0' }}>
            or
          </div>
          <button
            type="button"
            style={{
              border: '1px solid var(--border-strong)',
              background: 'transparent',
              padding: '8px 20px',
              borderRadius: 0,
              fontSize: 'var(--text-xs)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
            onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}
          >
            Browse File
          </button>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 12 }}>
            Accepts: .xlsx, .xls
          </div>
        </>
      )}
    </div>
  )
}
```

---

## 9. IMPORT PREVIEW COMPONENT

```tsx
// components/import/ImportPreview.tsx

interface ImportPreviewProps {
  valid: ImportRow[]
  errors: ValidationError[]
  onConfirm: () => void
  onCancel: () => void
  importing?: boolean
}

export function ImportPreview({ valid, errors, onConfirm, onCancel, importing }: ImportPreviewProps) {
  return (
    <div>
      {/* Summary counts */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
        <div style={{ color: 'var(--color-success)', fontSize: 'var(--text-sm)' }}>
          <i className="fa-solid fa-circle-check" style={{ marginRight: 6 }} />
          {valid.length} rows valid
        </div>
        {errors.length > 0 && (
          <div style={{ color: 'var(--color-danger)', fontSize: 'var(--text-sm)' }}>
            <i className="fa-solid fa-circle-xmark" style={{ marginRight: 6 }} />
            {errors.length} rows with errors (will be skipped)
          </div>
        )}
      </div>

      {/* Valid rows table */}
      {valid.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase',
                        letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 8 }}>
            Valid Rows
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr>
                  {['Row', 'SKU', 'Description', 'Qty', 'Total (g)', 'Gold (g)', 'Metal'].map(h => (
                    <th key={h} style={{
                      fontSize: 'var(--text-xs)', textTransform: 'uppercase',
                      letterSpacing: '0.08em', color: 'var(--text-secondary)',
                      padding: '6px 10px', borderBottom: '1px solid var(--border-base)',
                      background: 'var(--bg-base)', textAlign: 'left', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {valid.map(row => (
                  <tr key={row.rowNum}>
                    <td style={{ padding: '5px 10px', fontFamily: 'var(--font-mono)',
                                 fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
                                 borderBottom: '1px solid var(--border-light)' }}>
                      {row.rowNum}
                    </td>
                    <td style={{ padding: '5px 10px', fontFamily: 'var(--font-mono)',
                                 fontWeight: 600, borderBottom: '1px solid var(--border-light)' }}>
                      {row.sku}
                    </td>
                    <td style={{ padding: '5px 10px', fontSize: 'var(--text-sm)',
                                 borderBottom: '1px solid var(--border-light)' }}>
                      {row.description || '—'}
                    </td>
                    <td style={{ padding: '5px 10px', fontFamily: 'var(--font-mono)',
                                 textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                      {row.qty}
                    </td>
                    <td style={{ padding: '5px 10px', fontFamily: 'var(--font-mono)',
                                 textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                      {row.weightTotal.toFixed(4)}
                    </td>
                    <td style={{ padding: '5px 10px', fontFamily: 'var(--font-mono)',
                                 textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                      {row.weightGold.toFixed(4)}
                    </td>
                    <td style={{ padding: '5px 10px', borderBottom: '1px solid var(--border-light)' }}>
                      {row.metalType && (
                        <span style={{ border: '1px solid var(--border-base)',
                                       padding: '1px 6px', fontSize: 'var(--text-xs)',
                                       fontFamily: 'var(--font-mono)' }}>
                          {row.metalType}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Error rows table */}
      {errors.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase',
                        letterSpacing: '0.1em', color: 'var(--color-danger)', marginBottom: 8 }}>
            Errors — {errors.length} rows skipped
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Row', 'SKU', 'Error'].map(h => (
                  <th key={h} style={{
                    fontSize: 'var(--text-xs)', textTransform: 'uppercase',
                    color: 'var(--text-secondary)', padding: '6px 10px',
                    borderBottom: '1px solid var(--border-base)',
                    background: 'var(--bg-base)', textAlign: 'left',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {errors.map(err => (
                <tr key={err.row}>
                  <td style={{ padding: '5px 10px', fontFamily: 'var(--font-mono)',
                               color: 'var(--color-danger)',
                               borderBottom: '1px solid var(--border-light)' }}>
                    {err.row}
                  </td>
                  <td style={{ padding: '5px 10px', fontFamily: 'var(--font-mono)',
                               borderBottom: '1px solid var(--border-light)' }}>
                    {err.sku}
                  </td>
                  <td style={{ padding: '5px 10px', color: 'var(--color-danger)',
                               fontSize: 'var(--text-sm)',
                               borderBottom: '1px solid var(--border-light)' }}>
                    {err.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          disabled={importing}
          style={{
            border: '1px solid var(--border-strong)', background: 'transparent',
            padding: '10px 24px', borderRadius: 0, cursor: 'pointer',
            fontSize: 'var(--text-xs)', letterSpacing: '0.1em', textTransform: 'uppercase',
          }}
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={valid.length === 0 || importing}
          style={{
            border: '1px solid var(--btn-dark-bg)',
            background: valid.length > 0 ? 'var(--btn-dark-bg)' : 'var(--bg-muted)',
            color: 'var(--text-inverse)',
            padding: '10px 24px', borderRadius: 0, cursor: valid.length > 0 ? 'pointer' : 'not-allowed',
            fontSize: 'var(--text-xs)', letterSpacing: '0.1em', textTransform: 'uppercase',
          }}
        >
          {importing ? (
            <><i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 6 }} />
              Importing...</>
          ) : (
            `Import ${valid.length} Valid Row${valid.length !== 1 ? 's' : ''} →`
          )}
        </button>
      </div>
    </div>
  )
}
```

---

## 10. IMPORT PROGRESS COMPONENT

```tsx
// components/import/ImportProgress.tsx

interface ImportProgressProps {
  progress: number   // 0–100
  total: number
  current: number
}

export function ImportProgress({ progress, total, current }: ImportProgressProps) {
  return (
    <div style={{ textAlign: 'center', padding: '3rem 0' }}>
      <i className="fa-solid fa-circle-notch fa-spin"
         style={{ fontSize: 32, color: 'var(--text-secondary)', display: 'block', marginBottom: 16 }} />
      <div style={{ fontSize: 'var(--text-base)', marginBottom: 12 }}>
        Importing items...
      </div>
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 16 }}>
        {current} / {total} rows
      </div>
      {/* Progress bar */}
      <div style={{
        width: '100%', maxWidth: 400, margin: '0 auto',
        height: 4, background: 'var(--bg-muted)', borderRadius: 0
      }}>
        <div style={{
          height: '100%', background: 'var(--btn-dark-bg)',
          width: `${progress}%`, transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  )
}
```

---

## 11. DONE STATE COMPONENT

```tsx
// After successful import:
<div style={{ textAlign: 'center', padding: '3rem 0' }}>
  <i className="fa-solid fa-circle-check"
     style={{ fontSize: 48, color: 'var(--color-success)', display: 'block', marginBottom: 16 }} />
  <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)', marginBottom: 8 }}>
    Import Successful
  </div>
  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 24 }}>
    {importedCount} items added to invoice
  </div>
  <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
    <button
      onClick={resetToIdle}
      style={{
        border: '1px solid var(--border-strong)', background: 'transparent',
        padding: '10px 24px', borderRadius: 0, cursor: 'pointer',
        fontSize: 'var(--text-xs)', letterSpacing: '0.1em', textTransform: 'uppercase',
      }}
    >
      Import More
    </button>
    <a
      href={`/invoices/${invoiceId}`}
      style={{
        border: '1px solid var(--btn-dark-bg)', background: 'var(--btn-dark-bg)',
        color: 'var(--text-inverse)', padding: '10px 24px',
        display: 'inline-block', textDecoration: 'none',
        fontSize: 'var(--text-xs)', letterSpacing: '0.1em', textTransform: 'uppercase',
      }}
    >
      Back to Invoice →
    </a>
  </div>
</div>
```

---

## 12. DOWNLOAD TEMPLATE

### GET /api/export/template

```typescript
// Returns blank JM format Excel with headers only

import * as XLSX from 'xlsx'
import { NextResponse } from 'next/server'

export async function GET() {
  const templateRow = [{
    'Store':            '',
    'Location':         '',
    'SKU':              '',
    'SO/MO':            '',
    'Vendor Model':     '',
    'Description':      '',
    'Qty':              '',
    'Total Weight (g)': '',
    'Gold Weight (g)':  '',
    'Metal Type':       '',
    'Class':            '',
    'Sub Class':        '',
  }]

  const ws = XLSX.utils.json_to_sheet(templateRow)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Import Template')

  // Set column widths
  ws['!cols'] = [
    { wch: 12 }, // A: Store
    { wch: 14 }, // B: Location
    { wch: 16 }, // C: SKU
    { wch: 14 }, // D: SO/MO
    { wch: 16 }, // E: Vendor Model
    { wch: 24 }, // F: Description
    { wch: 8  }, // G: Qty
    { wch: 16 }, // H: Total Weight
    { wch: 16 }, // I: Gold Weight
    { wch: 12 }, // J: Metal Type
    { wch: 14 }, // K: Class
    { wch: 14 }, // L: Sub Class
  ]

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="jm-import-template.xlsx"',
    }
  })
}
```

### Download Button UI

```tsx
<a
  href="/api/export/template"
  download="jm-import-template.xlsx"
  style={{
    display: 'inline-flex', alignItems: 'center', gap: 6,
    color: 'var(--text-secondary)', fontSize: 'var(--text-sm)',
    textDecoration: 'none',
  }}
>
  <i className="fa-solid fa-arrow-down-to-line" />
  Download Template
</a>
```

---

## 13. MAIN PAGE COMPONENT

```tsx
// app/(dashboard)/import/page.tsx

'use client'

import { useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { DropZone } from '@/components/import/DropZone'
import { ImportPreview } from '@/components/import/ImportPreview'
import { ImportProgress } from '@/components/import/ImportProgress'

export default function ImportPage() {
  const searchParams = useSearchParams()
  const invoiceId = searchParams.get('invoiceId') ?? ''

  const [state, setState] = useState<ImportState>({ stage: 'idle' })

  const handleFile = useCallback(async (file: File) => {
    setState({ stage: 'parsing', filename: file.name })
    try {
      const raw = await parseExcelFile(file)
      const { valid, errors } = await validateRows(raw)
      setState({ stage: 'preview', valid, errors, filename: file.name })
    } catch (err) {
      setState({ stage: 'error', message: String(err) })
    }
  }, [])

  const handleConfirm = useCallback(async () => {
    if (state.stage !== 'preview') return
    const { valid } = state

    setState({ stage: 'importing', progress: 0, total: valid.length })

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId, rows: valid }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message)

      setState({ stage: 'done', imported: data.data.imported, invoiceId })
    } catch (err) {
      setState({ stage: 'error', message: String(err) })
    }
  }, [state, invoiceId])

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <a
          href={`/invoices/${invoiceId}`}
          style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
                   textDecoration: 'none', letterSpacing: '0.08em', textTransform: 'uppercase' }}
        >
          <i className="fa-solid fa-arrow-left" style={{ marginRight: 6 }} />
          Back to Invoice
        </a>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)',
                     fontWeight: 400, marginTop: 8 }}>
          Import Items
        </h1>
      </div>

      {/* Content by stage */}
      {state.stage === 'idle' && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)', padding: '2rem' }}>
          <div style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase',
                        letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 16 }}>
            Step 1 — Upload File
          </div>
          <DropZone onFile={handleFile} />
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <a href="/api/export/template" download="jm-import-template.xlsx"
               style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                        color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', textDecoration: 'none' }}>
              <i className="fa-solid fa-arrow-down-to-line" />
              Download Template
            </a>
          </div>
        </div>
      )}

      {state.stage === 'parsing' && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          <i className="fa-solid fa-circle-notch fa-spin"
             style={{ fontSize: 32, display: 'block', marginBottom: 12 }} />
          Parsing {state.filename}...
        </div>
      )}

      {state.stage === 'preview' && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)', padding: '2rem' }}>
          <div style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase',
                        letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 16 }}>
            Step 2 — Preview & Confirm
          </div>
          <ImportPreview
            valid={state.valid}
            errors={state.errors}
            onConfirm={handleConfirm}
            onCancel={() => setState({ stage: 'idle' })}
          />
        </div>
      )}

      {state.stage === 'importing' && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)', padding: '2rem' }}>
          <ImportProgress
            progress={state.progress}
            total={state.total}
            current={Math.round(state.total * state.progress / 100)}
          />
        </div>
      )}

      {state.stage === 'done' && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)', padding: '2rem' }}>
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <i className="fa-solid fa-circle-check"
               style={{ fontSize: 48, color: 'var(--color-success)', display: 'block', marginBottom: 16 }} />
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)', marginBottom: 8 }}>
              Import Successful
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 24 }}>
              {state.imported} items added to invoice
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={() => setState({ stage: 'idle' })}
                style={{ border: '1px solid var(--border-strong)', background: 'transparent',
                         padding: '10px 24px', borderRadius: 0, cursor: 'pointer',
                         fontSize: 'var(--text-xs)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Import More
              </button>
              <a href={`/invoices/${state.invoiceId}`}
                style={{ border: '1px solid var(--btn-dark-bg)', background: 'var(--btn-dark-bg)',
                         color: 'var(--text-inverse)', padding: '10px 24px',
                         display: 'inline-block', textDecoration: 'none',
                         fontSize: 'var(--text-xs)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Back to Invoice →
              </a>
            </div>
          </div>
        </div>
      )}

      {state.stage === 'error' && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)', padding: '2rem' }}>
          <div style={{ borderLeft: '2px solid var(--color-danger)', padding: '12px 16px',
                        background: '#FAF2F2', color: 'var(--color-danger)', marginBottom: 16 }}>
            <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 8 }} />
            {state.message}
          </div>
          <button onClick={() => setState({ stage: 'idle' })}
            style={{ border: '1px solid var(--border-strong)', background: 'transparent',
                     padding: '10px 24px', borderRadius: 0, cursor: 'pointer',
                     fontSize: 'var(--text-xs)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Try Again
          </button>
        </div>
      )}
    </div>
  )
}
```

---

## 14. COMPONENT STRUCTURE

```
app/(dashboard)/import/page.tsx        ← Route page
components/import/
  DropZone.tsx                         ← Drag-drop file input
  ImportPreview.tsx                    ← Valid + error tables + confirm button
  ImportProgress.tsx                   ← Progress bar + spinner
  ImportErrorTable.tsx                 ← Standalone error table (reusable)
```

---

## 15. API ENDPOINTS

| Method | URL | Mô tả |
|--------|-----|-------|
| POST | `/api/import` | Submit validated rows → bulk INSERT + recalculate |
| GET | `/api/export/template` | Download blank JM format template |
| GET | `/api/products?skus=A,B` | Batch SKU validation lookup |

---

## 16. RÀNG BUỘC BẮT BUỘC

```
✓ Invoice phải ở trạng thái KHÔNG locked (is_locked = false) — server 403 nếu vi phạm
✓ SKU phải tồn tại trong bom_products VÀ is_active = true
✓ weight_gold_actual_gr ≤ weight_total_gr
✓ qty_pcs ≥ 1
✓ Fees auto-copy từ bom_products (labor_fee, casting_fee, design_fee, resin_fee, misc_fee)
✓ line_no auto-assign = MAX(existing line_no) + sequential (server-side)
✓ Sau import → trigger recalculate chain cho từng item vừa insert
✓ Invalid rows hiển thị rõ Row#, SKU, Error — KHÔNG block import của valid rows
✓ Empty rows (SKU blank) → silently skip
✓ invoiceId phải có trong query param → validate invoice exists trước khi render page
✓ Nếu invoice không tìm thấy hoặc locked → redirect về invoice list với error message
```

---

## 17. LOCKED INVOICE GUARD (Page Level)

```tsx
// Khi page load, check invoice status:
// app/(dashboard)/import/page.tsx — Server Component phần:

import { createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function ImportPageWrapper({
  searchParams
}: {
  searchParams: { invoiceId?: string }
}) {
  const invoiceId = searchParams.invoiceId
  if (!invoiceId) redirect('/invoices')

  const db = createServiceClient()
  const { data: invoice } = await db
    .from('invoice_headers')
    .select('id, is_locked, po_number')
    .eq('id', invoiceId)
    .single()

  if (!invoice) redirect('/invoices')

  if (invoice.is_locked) {
    // Redirect về invoice detail với error message
    redirect(`/invoices/${invoiceId}?error=locked`)
  }

  return <ImportPage invoiceId={invoiceId} poNumber={invoice.po_number} />
}
```
