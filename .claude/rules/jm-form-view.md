# JM Form View — 15-Column Flat Table Spec

> **Phạm vi:** Invoice Detail page → JM Form View tab
> **Layout:** Flat table, 1 row per SKU, horizontal scroll, sticky 2 cols

---

## 1. TỔNG QUAN

JM Form View là bảng phẳng (flat table) hiển thị toàn bộ invoice items trên 1 dòng/SKU.  
Được thiết kế để nhìn nhanh toàn bộ invoice như 1 spreadsheet.

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  View: [JM Form View] [Detail View]    [Export] [Print] [Import Items]              │
├───────┬──────────────────┬────────────────────────────────────────────────────────┤
│  No.  │  SKU             │  [columns 3-15 — horizontal scroll on mobile]           │
│ (sticky) (sticky #FEF3C7) │                                                        │
├───────┼──────────────────┼────────────────────────────────────────────────────────┤
│  1    │  RING-001        │  ...data...                                              │
│  2    │  PEND-002 ★      │  ...data... (Ba Sao — ★ màu đỏ)                        │
└───────┴──────────────────┴────────────────────────────────────────────────────────┘
```

---

## 2. 15 COLUMNS — FULL SPEC

| # | Column Label | DB Field | Width | Notes |
|---|-------------|---------|-------|-------|
| 1 | No. | `line_no` | 50px | Sticky |
| 2 | SKU | `sku_jwmold` | 140px | Sticky, bg `#FEF3C7` |
| 3 | Description | `description` | 200px | |
| 4 | Class | `class` | 100px | |
| 5 | Sub Class | `sub_class` | 100px | |
| 6 | Qty | `qty_pcs` | 60px | Integer |
| 7 | Total Weight (g) | `weight_total_gr` | 100px | 4 decimals |
| 8 | Gold Weight (g) | `weight_gold_actual_gr` | 100px | 4 decimals |
| 9 | No-Gem Weight (g) | `weight_no_gem_gr` | 110px | Computed, readonly |
| 10 | Metal Type | `metal_type` | 80px | |
| 11 | Gold Value (USD) | `gold_value_usd` | 110px | Computed, readonly |
| 12 | HPUSA | `hpusa` | 110px | Computed, readonly |
| 13 | CIF Price | `cif_price` | 110px | Computed, readonly |
| 14 | Tag Price | `tag_price` | 110px | Visible: manager/admin only |
| 15 | FR Price | `fr_price` | 110px | Visible: manager/admin only |

---

## 3. STICKY COLUMNS (Mobile)

```css
/* Cols 1 + 2 sticky khi scroll ngang */
.jm-table td:nth-child(1),
.jm-table td:nth-child(2),
.jm-table th:nth-child(1),
.jm-table th:nth-child(2) {
  position: sticky;
  left: 0;
  z-index: 1;
  box-shadow: 2px 0 4px rgba(0,0,0,0.05);
}

/* No. column */
.jm-table td:nth-child(1),
.jm-table th:nth-child(1) {
  left: 0;
  background: var(--bg-surface);
}

/* SKU column */
.jm-table td:nth-child(2),
.jm-table th:nth-child(2) {
  left: 50px;   /* = width of No. column */
  background: #FEF3C7;  /* SKU highlight amber */
}
```

---

## 4. SKU CELL — BA SAO INDICATOR

```typescript
// "Ba Sao" = items đặc biệt cần chú ý
// Detect bằng: sku_jwmold.includes('*') hoặc notes field
// GAS cũ: Ba Sao text màu đỏ #DC2626

// Render:
function renderSKUCell(item: InvoiceItem): React.ReactNode {
  const hasBaSao = item.sku_jwmold?.includes('*') || item.notes?.includes('ba sao')
  return (
    <td style={{ background: '#FEF3C7', position: 'sticky', left: 50 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
        {item.sku_jwmold}
      </span>
      {hasBaSao && (
        <span style={{ color: '#DC2626', marginLeft: 4, fontWeight: 700 }}>★</span>
      )}
    </td>
  )
}
```

---

## 5. ROLE-BASED COLUMN VISIBILITY

```typescript
const canSeePrice = role === 'manager' || role === 'admin'

// Columns hidden for 'user' role:
// - Tag Price (col 14)
// - FR Price (col 15)

// Computed columns (readonly for ALL roles, never editable in JM view):
// - No-Gem Weight (col 9) = weight_total_gr - Σgem.weight_gr
// - Gold Value (col 11)   = recalculated server-side
// - HPUSA (col 12)        = recalculated server-side
// - CIF Price (col 13)    = recalculated server-side
```

---

## 6. HORIZONTAL SCROLL WRAPPER

```tsx
<div style={{
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
  marginLeft: '-1rem',
  marginRight: '-1rem',
  paddingLeft: '1rem',
  paddingRight: '1rem',
}}>
  <table
    className="jm-table"
    style={{ minWidth: '1200px', borderCollapse: 'collapse', width: '100%' }}
  >
    {/* ... */}
  </table>
</div>
```

---

## 7. TABLE HEADER STYLE

```css
.jm-table thead th {
  background: var(--bg-base);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-base);
  border-right: 1px solid var(--border-light);
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 2;
}

/* SKU header — above other sticky */
.jm-table thead th:nth-child(2) {
  z-index: 3;
}
```

---

## 8. TABLE ROW STYLE

```css
.jm-table tbody td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-light);
  border-right: 1px solid var(--border-light);
  font-size: var(--text-sm);
  vertical-align: middle;
  white-space: nowrap;
}

.jm-table tbody tr:hover td {
  background: var(--bg-hover);
}

/* Exception: SKU cell hover keeps amber */
.jm-table tbody tr:hover td:nth-child(2) {
  background: #FEF3C7;
}

/* Computed cells */
.jm-table td.computed {
  background: var(--bg-base);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

/* Number alignment */
.jm-table td.num {
  text-align: right;
  font-family: var(--font-mono);
}
```

---

## 9. PRINT CSS (A4 Landscape)

```css
@media print {
  /* Ẩn navigation, toolbar, workflow */
  .topbar-wrapper, .workflow-bar, .view-toggle,
  .no-print, .btn, .action-bar { display: none !important; }
  
  /* JM Table */
  .jm-table { width: 100%; font-size: 8pt; }
  .jm-table td, .jm-table th { padding: 3pt 4pt; }
  
  /* SKU amber — giữ nguyên khi print */
  .sku-cell {
    background-color: #FEF3C7 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  
  /* Ba Sao red — giữ nguyên khi print */
  .ba-sao-text {
    color: #DC2626 !important;
    -webkit-print-color-adjust: exact;
  }
  
  /* Repeat header on each page */
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr { page-break-inside: avoid; }
}

@page {
  size: A4 landscape;
  margin: 15mm 10mm;
}
```

---

## 10. TABLE FOOTER (TOTALS)

```tsx
// tfoot row hiển thị tổng:
<tfoot>
  <tr style={{ borderTop: '2px solid var(--border-strong)', fontWeight: 600 }}>
    <td colSpan={5} style={{ textAlign: 'right', paddingRight: 12 }}>TOTAL</td>
    <td className="num">{totalQty}</td>
    <td className="num">{formatWeight(totalWeightGr)}</td>
    <td className="num">{formatWeight(totalGoldGr)}</td>
    <td className="num">{formatWeight(totalNoGemGr)}</td>
    <td></td>
    <td className="num">{formatUSD(totalGoldValue)}</td>
    <td className="num">{formatUSD(totalHpusa)}</td>
    <td className="num">{formatUSD(totalCif)}</td>
    {canSeePrice && <td className="num">{formatUSD(totalTag)}</td>}
    {canSeePrice && <td className="num">{formatUSD(totalFr)}</td>}
  </tr>
</tfoot>
```

---

## 11. VIEW TOGGLE

```tsx
// Tabs đầu trang invoice detail:
<div style={{ borderBottom: '1px solid var(--border-base)', marginBottom: 16 }}>
  <button
    onClick={() => setView('jm')}
    style={{
      padding: '8px 20px',
      border: 'none',
      background: 'transparent',
      borderBottom: view === 'jm' ? '2px solid var(--border-strong)' : '2px solid transparent',
      fontWeight: view === 'jm' ? 600 : 400,
      color: view === 'jm' ? 'var(--text-primary)' : 'var(--text-secondary)',
      cursor: 'pointer',
    }}
  >
    <i className="fa-solid fa-table" style={{ marginRight: 6 }} />
    JM Form View
  </button>
  <button
    onClick={() => setView('detail')}
    style={{
      padding: '8px 20px',
      border: 'none',
      background: 'transparent',
      borderBottom: view === 'detail' ? '2px solid var(--border-strong)' : '2px solid transparent',
      fontWeight: view === 'detail' ? 600 : 400,
      color: view === 'detail' ? 'var(--text-primary)' : 'var(--text-secondary)',
      cursor: 'pointer',
    }}
  >
    <i className="fa-solid fa-list" style={{ marginRight: 6 }} />
    Detail View
  </button>
</div>
```

---

## 12. ACTION BAR (trên table)

```tsx
// Action bar hiển thị phía trên bảng (chỉ khi invoice chưa locked):
<div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
  {!invoice.is_locked && (
    <>
      <button className="btn-outline">
        <i className="fa-solid fa-file-import" /> Import Items
      </button>
      <button className="btn-outline">
        <i className="fa-solid fa-plus" /> Add Item
      </button>
    </>
  )}
  <button className="btn-outline" onClick={handleExport}>
    <i className="fa-solid fa-file-export" /> Export Excel
  </button>
  <button className="btn-outline" onClick={() => window.open(`/invoices/${id}/print`)}>
    <i className="fa-solid fa-print" /> Print
  </button>
</div>
```

---

## 13. LOADING STATE

```tsx
// Khi load invoice items:
<tbody>
  <tr>
    <td colSpan={15} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
      <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 8 }} />
      Loading items...
    </td>
  </tr>
</tbody>
```

---

## 14. EMPTY STATE

```tsx
// Khi invoice không có items:
<tbody>
  <tr>
    <td colSpan={15} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
      No items found. Import Excel or add items manually.
    </td>
  </tr>
</tbody>
```

---

## 15. LINE NUMBER COLUMN

```typescript
// line_no: 1-based, sequential per invoice
// Hiển thị số thứ tự, không editable trong JM view
// Khi thêm item mới: line_no = MAX(line_no) + 1 (server assigns)
// Khi xóa: KHÔNG re-number (giữ nguyên gaps)
```

---

## 16. COMPONENT STRUCTURE

```
components/invoice/
  JMFormView.tsx           ← Main component
  JMTable.tsx              ← Table rendering
  JMTableHeader.tsx        ← Sticky header
  JMTableRow.tsx           ← Single row
  JMTableFooter.tsx        ← Totals row
  ViewToggle.tsx           ← JM / Detail tabs
  InvoiceActionBar.tsx     ← Import/Export/Print buttons
```
