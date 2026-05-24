# Export Module — V-Invoice

> **Trigger:** Button in Invoice Detail action bar
> **API:** `GET /api/invoices/[id]/export`
> **Library:** SheetJS (`xlsx`)
> **Access:** All roles that can view the invoice

---

## 1. EXPORT BUTTON

```tsx
// In InvoiceDetailActions component:
<button
  onClick={handleExport}
  disabled={exporting}
  style={{
    display:    'inline-flex',
    alignItems: 'center',
    gap:        '0.5rem',
    padding:    '0.5rem 1.25rem',
    border:     '1px solid var(--border-base)',
    background: 'transparent',
    color:      'var(--text-primary)',
    fontFamily: 'var(--font-body)',
    fontSize:   'var(--text-sm)',
    cursor:     exporting ? 'wait' : 'pointer',
    borderRadius: 0,
  }}
>
  {exporting
    ? <i className="fa-solid fa-circle-notch fa-spin" />
    : <i className="fa-solid fa-file-export" />
  }
  {exporting ? 'Exporting...' : 'Export Excel'}
</button>
```

```typescript
async function handleExport() {
  setExporting(true)
  try {
    const res = await fetch(`/api/invoices/${invoiceId}/export`)
    if (!res.ok) throw new Error('Export failed')
    const blob     = await res.blob()
    const url      = URL.createObjectURL(blob)
    const a        = document.createElement('a')
    a.href         = url
    a.download     = `invoice-${poNumber}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    alert('Export failed. Please try again.')
  } finally {
    setExporting(false)
  }
}
```

---

## 2. API ROUTE

### `GET /api/invoices/[id]/export`

```typescript
// app/api/invoices/[id]/export/route.ts
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

    const db = createServiceClient()
    const canSeePrice = ctx.role === 'admin' || ctx.role === 'manager'

    // 1. Load invoice header
    const { data: invoice, error: invErr } = await db
      .from('invoice_headers')
      .select(`
        id,
        po_number,
        customer_name,
        invoice_date,
        status,
        metal_rate_id,
        pricing_rule_id,
        metal_rates ( rate_date, gold_18kw, gold_18ky, gold_14ky, platinum ),
        pricing_rules ( name, cif_multiplier, tag_multiplier, fr_multiplier )
      `)
      .eq('id', params.id)
      .single()

    if (invErr || !invoice) {
      return NextResponse.json({ success: false, message: 'Invoice not found' }, { status: 404 })
    }

    // 2. Load invoice items with gem details
    const { data: items, error: itemsErr } = await db
      .from('invoice_items')
      .select(`
        line_no,
        sku_jwmold,
        description,
        store,
        location_store,
        so_mo_code,
        vendor_model,
        qty_pcs,
        weight_total_gr,
        weight_gold_actual_gr,
        weight_no_gem_gr,
        metal_type,
        class,
        sub_class,
        labor_fee,
        casting_fee,
        design_fee,
        resin_fee,
        misc_fee,
        gold_value_usd,
        hpusa,
        cif_price,
        tag_price,
        fr_price,
        sell_price,
        after_discount_price,
        item_gem_details (
          gem_type,
          shape,
          size_mm,
          qty_pcs,
          weight_gr,
          price_per_carat,
          total_price,
          setting_type,
          setting_fee_per_pcs,
          total_setting_fee
        )
      `)
      .eq('invoice_id', params.id)
      .order('line_no', { ascending: true })

    if (itemsErr) throw itemsErr

    // 3. Build workbook
    const wb = XLSX.utils.book_new()

    // Sheet 1: Items
    const itemRows = (items ?? []).map(item => {
      const base: Record<string, unknown> = {
        'No.':               item.line_no,
        'Store':             item.store             ?? '',
        'Location':          item.location_store    ?? '',
        'SKU':               item.sku_jwmold,
        'SO/MO':             item.so_mo_code        ?? '',
        'Vendor Model':      item.vendor_model      ?? '',
        'Description':       item.description       ?? '',
        'Class':             item.class             ?? '',
        'Sub Class':         item.sub_class         ?? '',
        'Metal Type':        item.metal_type        ?? '',
        'Qty':               item.qty_pcs,
        'Total Weight (g)':  fmt4(item.weight_total_gr),
        'Gold Weight (g)':   fmt4(item.weight_gold_actual_gr),
        'No-Gem Weight (g)': fmt4(item.weight_no_gem_gr),
        'Labor Fee':         fmt2(item.labor_fee),
        'Casting Fee':       fmt2(item.casting_fee),
        'Design Fee':        fmt2(item.design_fee),
        'Resin Fee':         fmt2(item.resin_fee),
        'Misc Fee':          fmt2(item.misc_fee),
        'Sell Price':        fmt2(item.sell_price),
        'After Discount':    fmt2(item.after_discount_price),
      }

      if (canSeePrice) {
        base['Gold Value (USD)'] = fmt2(item.gold_value_usd)
        base['HPUSA']            = fmt2(item.hpusa)
        base['CIF Price']        = fmt2(item.cif_price)
        base['Tag Price']        = fmt2(item.tag_price)
        base['FR Price']         = fmt2(item.fr_price)
      }

      return base
    })

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemRows), 'Items')

    // Sheet 2: Gems (if any gems exist)
    const gemRows: Record<string, unknown>[] = []
    ;(items ?? []).forEach(item => {
      ;(item.item_gem_details ?? []).forEach(gem => {
        gemRows.push({
          'Line No':             item.line_no,
          'SKU':                 item.sku_jwmold,
          'Gem Type':            gem.gem_type        ?? '',
          'Shape':               gem.shape           ?? '',
          'Size (mm)':           gem.size_mm         ?? '',
          'Qty':                 gem.qty_pcs,
          'Weight (g)':          fmt4(gem.weight_gr),
          'Price/Carat':         fmt2(gem.price_per_carat),
          'Total Price':         fmt2(gem.total_price),
          'Setting Type':        gem.setting_type    ?? '',
          'Setting Fee/pcs':     fmt2(gem.setting_fee_per_pcs),
          'Total Setting Fee':   fmt2(gem.total_setting_fee),
        })
      })
    })

    if (gemRows.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gemRows), 'Gems')
    }

    // Sheet 3: Header info
    const rate         = (invoice as any).metal_rates
    const pricingRule  = (invoice as any).pricing_rules
    const headerRow = [{
      'PO Number':       invoice.po_number,
      'Customer':        invoice.customer_name,
      'Invoice Date':    invoice.invoice_date,
      'Status':          invoice.status,
      'Metal Rate Date': rate?.rate_date     ?? '',
      'Pricing Rule':    pricingRule?.name   ?? '',
      'CIF Multiplier':  pricingRule?.cif_multiplier ?? '',
      'Tag Multiplier':  canSeePrice ? (pricingRule?.tag_multiplier ?? '') : '',
      'FR Multiplier':   canSeePrice ? (pricingRule?.fr_multiplier  ?? '') : '',
    }]

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(headerRow), 'Info')

    // 4. Write & return
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const filename = `invoice-${invoice.po_number}.xlsx`

    return new NextResponse(buffer, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}

// Helpers
function fmt2(n: unknown): string {
  if (n == null || n === '') return ''
  const num = parseFloat(String(n))
  return isNaN(num) ? '' : num.toFixed(2)
}

function fmt4(n: unknown): string {
  if (n == null || n === '') return ''
  const num = parseFloat(String(n))
  return isNaN(num) ? '' : num.toFixed(4)
}
```

---

## 3. SHEET STRUCTURE

### Sheet 1: Items

| Column | Description | Roles |
|--------|-------------|-------|
| No. | line_no | All |
| Store | store | All |
| Location | location_store | All |
| SKU | sku_jwmold | All |
| SO/MO | so_mo_code | All |
| Vendor Model | vendor_model | All |
| Description | description | All |
| Class | class | All |
| Sub Class | sub_class | All |
| Metal Type | metal_type | All |
| Qty | qty_pcs | All |
| Total Weight (g) | weight_total_gr | All |
| Gold Weight (g) | weight_gold_actual_gr | All |
| No-Gem Weight (g) | weight_no_gem_gr | All |
| Labor Fee | labor_fee | All |
| Casting Fee | casting_fee | All |
| Design Fee | design_fee | All |
| Resin Fee | resin_fee | All |
| Misc Fee | misc_fee | All |
| Sell Price | sell_price | All |
| After Discount | after_discount_price | All |
| Gold Value (USD) | gold_value_usd | admin + manager |
| HPUSA | hpusa | admin + manager |
| CIF Price | cif_price | admin + manager |
| Tag Price | tag_price | admin + manager |
| FR Price | fr_price | admin + manager |

### Sheet 2: Gems (only if gems exist)

| Column | Source |
|--------|--------|
| Line No | item.line_no |
| SKU | item.sku_jwmold |
| Gem Type | item_gem_details.gem_type |
| Shape | shape |
| Size (mm) | size_mm |
| Qty | qty_pcs |
| Weight (g) | weight_gr (GENERATED ALWAYS) |
| Price/Carat | price_per_carat |
| Total Price | total_price (GENERATED ALWAYS) |
| Setting Type | setting_type |
| Setting Fee/pcs | setting_fee_per_pcs |
| Total Setting Fee | total_setting_fee (GENERATED ALWAYS) |

### Sheet 3: Info

Invoice header metadata — PO, customer, date, status, rate date, pricing rule name, multipliers.

---

## 4. TEMPLATE DOWNLOAD

```typescript
// GET /api/export/template
// Returns blank JM-format Excel with column headers only

export async function GET() {
  const XLSX = await import('xlsx')

  const templateRow = {
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
  }

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet([templateRow])

  // Set column widths
  ws['!cols'] = [
    { wch: 10 }, // Store
    { wch: 12 }, // Location
    { wch: 16 }, // SKU
    { wch: 12 }, // SO/MO
    { wch: 16 }, // Vendor Model
    { wch: 30 }, // Description
    { wch: 6  }, // Qty
    { wch: 16 }, // Total Weight
    { wch: 14 }, // Gold Weight
    { wch: 10 }, // Metal Type
    { wch: 14 }, // Class
    { wch: 14 }, // Sub Class
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Import Template')
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buffer, {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="vinvoice-import-template.xlsx"',
      'Cache-Control':       'public, max-age=86400',
    },
  })
}
```

---

## 5. COMPONENT STRUCTURE

```
app/
  api/
    invoices/[id]/export/route.ts   ← GET — generate & return .xlsx
    export/template/route.ts        ← GET — download blank template
components/
  invoice/
    InvoiceDetailActions.tsx        ← Contains Export Excel button + handleExport()
```

---

## 6. CONSTRAINTS

```
✓ canSeePrice gate — tag_price, fr_price, gold_value_usd, hpusa, cif_price omitted for user/viewer
✓ Gems sheet only added when invoice has at least 1 gem detail row
✓ GENERATED ALWAYS columns (weight_gr, total_price, total_setting_fee) read from DB — never recomputed
✓ Filename: invoice-{po_number}.xlsx
✓ fmt4() for weights (4 decimal places), fmt2() for prices (2 decimal places)
✓ Cache-Control: no-store for invoice export (data changes); max-age=86400 for template
✓ SheetJS server-side only — not bundled to client
✓ Template route accessible without invoiceId — no auth required for blank template
```
