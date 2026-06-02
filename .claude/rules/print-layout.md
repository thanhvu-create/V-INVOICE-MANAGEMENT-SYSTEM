# Print Layout — V-Invoice A4 Landscape
> **Route:** `/invoices/[id]/print`
> **Trigger:** `<a href="/invoices/[id]/print" target="_blank">` — mở tab mới → auto-print sau 300ms
> **Format:** A4 landscape, 15mm/10mm margins
> **Cập nhật:** 2026-05-29 — dựa trên [THAM KHẢO] §5 yêu cầu: logo + signature block

---

## 1. PAGE STRUCTURE

```
┌──────────────────────────────────────────────────────────────────┐
│  [LOGO left]          HP JEWELRY — INVOICE        [Date / Lock]  │  ← Header
│  PO: 1000011528   MR: 1000011901   Store: US ONL                │
│  Status: APPROVED    Rate Date: 2026-05-20    Rule: Standard     │
├──────────────────────────────────────────────────────────────────┤
│  ─── hairline ─────────────────────────────────────────────────  │
│                                                                   │
│  [JM Form Table — simplified, 8pt font, all visible columns]     │
│   No. │ SKU │ Qty │ Desc │ Class │ Metal │ Wt │ Gold │ HPUSA │  │
│   ─────────────────────────────────────────────────────────────  │
│   1   │ ... │ ... │ ...  │ ...   │ ...   │ ..│ ...  │ ...   │  │
│   ...                                                            │
│                                                                   │
│  ─── TOTAL row ────────────────────────────────────────────────  │
├──────────────────────────────────────────────────────────────────┤
│  Notes: [invoice.notes if any]                                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  SIGNATURE BLOCK (3 cols):                                        │
│  ┌──────────────┬──────────────────┬─────────────────────────┐  │
│  │ Prepared by: │ Approved by:     │ Customer acknowledgment: │  │
│  │              │                  │                          │  │
│  │ ____________ │ ________________ │ ________________________ │  │
│  │ Name / Date  │ Name / Date      │ Name / Date              │  │
│  └──────────────┴──────────────────┴─────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. HEADER SECTION

```tsx
{/* Logo + Company name row */}
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6pt' }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: '10pt' }}>
    {/* Logo placeholder — replace src with actual logo path */}
    <img
      src="/hp-logo.png"
      alt="HP Jewelry"
      style={{ height: '36pt', width: 'auto', objectFit: 'contain' }}
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
    />
    <div>
      <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '14pt', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        HP Jewelry
      </div>
      <div style={{ fontFamily: 'Jost, Arial, sans-serif', fontSize: '8pt', color: '#666', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        Invoice
      </div>
    </div>
  </div>

  {/* Right: date + lock status */}
  <div style={{ textAlign: 'right', fontSize: '8pt', color: '#666', lineHeight: 1.6 }}>
    <div>Printed: {new Date().toLocaleString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })}</div>
    <div>Created by: {header.created_by_name ?? header.created_by}</div>
    {header.is_locked && (
      <div style={{ marginTop: '3pt', fontWeight: 700, color: '#1A1814' }}>🔒 LOCKED / INVOICED</div>
    )}
  </div>
</div>

{/* PO / MR / Store row */}
<div style={{ fontSize: '9pt', color: '#222', lineHeight: 1.7, marginBottom: '3pt' }}>
  <strong>PO:</strong> {header.po_number}
  {header.mr_number && <span style={{ marginLeft: 14 }}><strong>MR:</strong> {header.mr_number}</span>}
  {header.store     && <span style={{ marginLeft: 14 }}><strong>Store:</strong> {header.store}</span>}
  {header.customer_name && <span style={{ marginLeft: 14 }}><strong>Customer:</strong> {header.customer_name}</span>}
</div>
<div style={{ fontSize: '8pt', color: '#555', marginBottom: '4pt' }}>
  <strong>Status:</strong> {header.status.replace(/_/g, ' ').toUpperCase()}
  <span style={{ marginLeft: 14 }}><strong>Rate date:</strong> {header.daily_metal_rates?.rate_date ?? '—'}</span>
  <span style={{ marginLeft: 14 }}><strong>Rule:</strong> {header.pricing_rules?.name ?? '—'}</span>
</div>

<hr style={{ borderTop: '1.5pt solid #1A1814', marginBottom: '5pt' }} />
```

---

## 3. ITEMS TABLE

### Column spec for print (role-filtered):

| Col | Field | Admin/Manager only |
|-----|-------|--------------------|
| No. | line_no | No |
| SKU JWMold | sku_jwmold | No — **always yellow bg** |
| Qty | qty_pcs | No |
| Description | description | No |
| Class | class | No |
| Sub Class | sub_class | No |
| Metal | metal_type | No |
| Notes | notes | No — **red bold if ba sao** |
| Total Wt (g) | weight_total_gr | No |
| Gold Wt (g) | weight_gold_actual_gr | No |
| No-Gem Wt (g) | weight_no_gem_gr | No |
| Gold Value | gold_value_usd | Yes |
| HPUSA | hpusa | Yes |
| CIF | cif_price | Yes |
| Tag | tag_price | Yes |

```tsx
const PRINT_COLS = [
  { key: 'line_no',               label: 'No.',           mono: true },
  { key: 'sku_jwmold',             label: 'SKU JWMold',    sku:  true },
  { key: 'qty_pcs',                label: 'Qty',           mono: true },
  { key: 'description',            label: 'Description'              },
  { key: 'class',                  label: 'Class'                    },
  { key: 'sub_class',              label: 'Sub Class'                },
  { key: 'metal_type',             label: 'Metal'                    },
  { key: 'notes',                  label: 'Notes',         notes: true },
  { key: 'weight_total_gr',        label: 'Total Wt',      mono: true },
  { key: 'weight_gold_actual_gr',  label: 'Gold Wt',       mono: true },
  { key: 'weight_no_gem_gr',       label: 'No-Gem Wt',     mono: true },
  { key: 'gold_value_usd',         label: 'Gold Value',    mono: true, price: true, adminOnly: true },
  { key: 'hpusa',                  label: 'HPUSA',         mono: true, price: true, adminOnly: true },
  { key: 'cif_price',              label: 'CIF',           mono: true, price: true, adminOnly: true },
  { key: 'tag_price',              label: 'Tag',           mono: true, price: true, adminOnly: true },
]

const visibleCols = PRINT_COLS.filter(c => !c.adminOnly || canSeePrice)
```

### Print color rules (must use `-webkit-print-color-adjust: exact`):
```css
.sku-cell    { background-color: #FEF3C7 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.ba-sao-text { color: #DC2626 !important; font-weight: 700 !important; -webkit-print-color-adjust: exact; }
.gold-wt-cell { background-color: #FFFBEB !important; -webkit-print-color-adjust: exact; }
```

---

## 4. TOTALS ROW

```tsx
// After items tbody — always show for admin/manager:
{canSeePrice && items.length > 0 && (
  <tfoot>
    <tr style={{ background: '#F0EBE4', fontWeight: 700 }}>
      {/* Col: No, SKU — empty */}
      <td colSpan={2} />
      {/* Qty total */}
      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{totQty}</td>
      {/* Desc, Class, Sub, Metal, Notes — TOTAL label in description */}
      <td style={{ textAlign: 'right', fontSize: '7pt', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#666' }}>TOTAL</td>
      <td colSpan={3} />
      {/* Weights */}
      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt4(totWt)}</td>
      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt4(totGold)}</td>
      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt4(totNoGem)}</td>
      {/* Prices (admin/manager) */}
      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt2(totGoldV)}</td>
      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 900 }}>{fmt2(totHpusa)}</td>
      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt2(totCif)}</td>
      {canSeePrice && <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt2(totTag)}</td>}
    </tr>
  </tfoot>
)}
```

---

## 5. SIGNATURE BLOCK — BẮT BUỘC

```tsx
{/* Signature block — always shown at bottom of print */}
<div style={{ marginTop: '20pt', borderTop: '1pt solid #C8C3BB', paddingTop: '10pt' }}>
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20pt' }}>
    {[
      { title: 'Prepared by', subtitle: 'Sales Representative' },
      { title: 'Approved by', subtitle: 'Manager / Admin' },
      { title: 'Customer Acknowledgment', subtitle: 'Received in good order' },
    ].map(({ title, subtitle }) => (
      <div key={title}>
        <div style={{ fontSize: '7pt', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#666', marginBottom: '24pt' }}>{title}</div>
        <div style={{ borderTop: '0.75pt solid #1A1814', paddingTop: '3pt' }}>
          <div style={{ fontSize: '7pt', color: '#888' }}>Signature / Date</div>
          <div style={{ marginTop: '4pt', fontSize: '7pt', color: '#555', fontStyle: 'italic' }}>{subtitle}</div>
        </div>
      </div>
    ))}
  </div>
</div>
```

---

## 6. CSS @PAGE

```css
@page {
  size: A4 landscape;
  margin: 15mm 10mm;
}

@media print {
  .no-print { display: none !important; }

  /* Preserve colors when printing */
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* Repeat header on each page */
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }

  /* Prevent row splitting across pages */
  tr { page-break-inside: avoid; }

  /* Signature block stays on last page — avoid break before */
  .signature-block { page-break-before: auto; page-break-inside: avoid; }

  body {
    font-size: 9pt;
    font-family: 'Jost', Arial, sans-serif;
    color: #000;
    background: #fff;
  }

  table { width: 100%; font-size: 8pt; }
  td, th { padding: 2.5pt 4pt; }
}
```

---

## 7. AUTO-PRINT BEHAVIOR

```typescript
// Auto-trigger print dialog 300ms after data loads:
useEffect(() => {
  if (!loading && data) {
    const t = setTimeout(() => window.print(), 300)
    return () => clearTimeout(t)
  }
}, [loading, data])
```

---

## 8. LOGO FILE

- **File path:** `/public/hp-logo.png` (hoặc `/public/hp-logo.svg`)
- **Kích thước:** 36pt height trong print (tương đương ~48px screen)
- **Fallback:** `onError` ẩn img tag — không làm vỡ layout
- **NOTE:** Nếu chưa có file logo, giữ text "HP Jewelry" như hiện tại. Add logo khi có file.

---

## 9. COMPONENT FILE & IMPLEMENTATION STATUS

```
app/(dashboard)/invoices/[id]/print/page.tsx   ← 'use client'
```

**GAP SO VỚI CODE HIỆN TẠI (`print/page.tsx`):**
```
Code hiện tại có:          Spec yêu cầu thêm:
✅ A4 landscape @page      ❌ Logo (<img src="/hp-logo.png">)
✅ PO/MR header            ❌ Signature block (3 cols)
✅ JM Form table           ❌ Notes section dưới table
✅ Totals row              ❌ Total_Stone_Weight row
✅ Auto-print 300ms        ❌ Role-filtered totals (hiện show all)
✅ SKU yellow preserved    
✅ Ba Sao red preserved    
```

**RÀNG BUỘC:**
```
✓ Signature block PHẢI có — 3 cột: Prepared by / Approved by / Customer
✓ Logo phải có (hoặc graceful text fallback khi /public/hp-logo.png chưa tồn tại)
✓ SKU cell: ALWAYS yellow #FEF3C7 với -webkit-print-color-adjust: exact
✓ Ba Sao: red #DC2626 + fontWeight 700 với -webkit-print-color-adjust: exact
✓ Totals row: Gold Value/HPUSA/CIF/Tag chỉ hiện cho admin/manager (canSeePrice)
✓ Total_Stone_Weight: tính từ actual gem data — items.flatMap(item_gem_details).reduce(weight_gr)
✓ @page: A4 landscape, margin 15mm/10mm
✓ thead: display: table-header-group (repeat header trên mọi trang)
✓ Không render nav/topbar/workflow bar trong print
✓ Auto-print sau 300ms khi data load xong
✓ Notes section: hiện header.notes bên dưới table (nếu có)
✓ Invoice notes font-style: italic, color: #444
```

---

## 10. PRINT vs EXPORT — SO SÁNH

| Feature | Print (PDF) | Export (Excel) |
|---------|-------------|----------------|
| Format | A4 landscape browser print | XLSX download |
| Content | JM Form View (flat) | Master-Detail với merge cells |
| Logo | ✅ Required | ✗ Không cần |
| Signature | ✅ Required | ✗ Không cần |
| Gem details | ✗ Không hiện | ✅ Trong Detail columns |
| Total row | ✅ Tfoot trong table | ✅ Tfoot row cuối |
| Role filter | ✅ canSeePrice | ✅ canSeePrice |
| Trigger | `window.open('/invoices/[id]/print')` | `GET /api/invoices/[id]/export` |
