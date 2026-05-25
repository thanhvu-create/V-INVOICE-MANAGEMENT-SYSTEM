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
| 1 | No. | `line_no` | 50px | Sticky left=0, bg `--bg-surface` |
| 2 | SKU JWMold | `sku_jwmold` | 140px | Sticky left=50px, ALWAYS bg `#FEF3C7`, font-mono |
| 3 | Qty Pcs | `qty_pcs` | 60px | Integer |
| 4 | Description | `description` | 200px | |
| 5 | Class | `class` | 100px | |
| 6 | Sub Class | `sub_class` | 100px | |
| 7 | Notes | `notes` | 150px | Red `#DC2626` if contains "ba sao" (case-insensitive) |
| 8 | Wt Total gr | `weight_total_gr` | 100px | 4 decimals, font-mono |
| 9 | Wt Gold gr | `weight_gold_actual_gr` | 100px | 4 decimals, font-mono, bg `#FFFBEB` |
| 10 | Wt No Gem gr | `weight_no_gem_gr` | 110px | Computed readonly, font-mono |
| 11 | Metal Type | `metal_type` | 80px | |
| 12 | Gold Value USD | `gold_value_usd` | 110px | Computed readonly, font-mono |
| 13 | HPUSA | `hpusa` | 110px | Computed readonly, font-mono, font-weight 600 |
| 14 | CIF Price | `cif_price` | 110px | Computed readonly, font-mono |
| 15 | Tag Price | `tag_price` | 110px | Visible: manager/admin only, font-mono |

**Column 15 note:** FR Price (`fr_price`) is NOT shown in the JM Form View table — it is available only in the Detail View and Export. The 15th visible column for manager/admin is Tag Price.

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

## 4. BA SAO INDICATOR — NOTES COLUMN (Col 7)

```typescript
// "Ba Sao" = items đặc biệt cần chú ý (special attention flag)
// Detection: notes field contains "ba sao" (case-insensitive)
// Display: Notes cell text turns red #DC2626 when ba sao detected

function renderNotesCell(item: InvoiceItem): React.ReactNode {
  const isBaSao = item.notes?.toLowerCase().includes('ba sao')
  return (
    <td style={{ color: isBaSao ? '#DC2626' : 'var(--text-secondary)', fontWeight: isBaSao ? 700 : 400 }}>
      {item.notes || ''}
    </td>
  )
}

// SKU cell itself does NOT show a red star — the Notes column carries the indicator
// Gold Weight cell (col 9) uses soft yellow bg #FFFBEB:
function renderGoldWeightCell(item: InvoiceItem): React.ReactNode {
  return (
    <td style={{ background: '#FFFBEB', fontFamily: 'var(--font-mono)', color: '#92400E', textAlign: 'right' }}>
      {item.weight_gold_actual_gr?.toFixed(4) ?? '—'}
    </td>
  )
}
```

---

## 5. ROLE-BASED COLUMN VISIBILITY

```typescript
const canSeePrice = role === 'manager' || role === 'admin'

// Columns hidden for 'user' and 'viewer' roles:
// - Tag Price (col 15) — manager/admin only

// Columns visible to ALL roles (user, viewer, manager, admin):
// - HPUSA (col 13)     — cost basis, visible to all
// - CIF Price (col 14) — visible to all
// - Gold Value (col 12) — visible to all

// Computed columns (readonly for ALL roles, never editable in JM view):
// - Wt No Gem gr (col 10) = weight_total_gr - Σgem.weight_gr
// - Gold Value USD (col 12) = recalculated server-side
// - HPUSA (col 13)          = recalculated server-side
// - CIF Price (col 14)      = recalculated server-side
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
// tfoot row hiển thị tổng (matches corrected column order):
// Col:  1(No)  2(SKU)  3(Qty)  4(Desc)  5(Class)  6(SubClass)  7(Notes)
//       8(WtTotal)  9(WtGold)  10(WtNoGem)  11(Metal)
//       12(GoldVal)  13(HPUSA)  14(CIF)  [15(Tag) if canSeePrice]
<tfoot>
  <tr style={{ borderTop: '2px solid var(--border-strong)', fontWeight: 600 }}>
    <td colSpan={2} />
    <td className="num">{totalQty}</td>           {/* Col 3: Qty */}
    <td colSpan={4} style={{ textAlign: 'right', paddingRight: 12 }}>TOTAL</td>  {/* 4-7 */}
    <td className="num">{formatWeight(totalWeightGr)}</td>   {/* Col 8 */}
    <td className="num">{formatWeight(totalGoldGr)}</td>     {/* Col 9 */}
    <td className="num">{formatWeight(totalNoGemGr)}</td>    {/* Col 10 */}
    <td />                                                    {/* Col 11: Metal */}
    <td className="num">{formatUSD(totalGoldValue)}</td>     {/* Col 12 */}
    <td className="num">{formatUSD(totalHpusa)}</td>         {/* Col 13 */}
    <td className="num">{formatUSD(totalCif)}</td>           {/* Col 14 */}
    {canSeePrice && <td className="num">{formatUSD(totalTag)}</td>}  {/* Col 15 */}
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
