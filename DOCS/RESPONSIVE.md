# Responsive Design — V-Invoice
> **Breakpoints:** Mobile-first · sm(640) · md(768) · lg(1024) · xl(1280)

---

## 1. BREAKPOINTS

```css
/* Mobile first */
/* sm: */ @media (min-width: 640px)  { ... }
/* md: */ @media (min-width: 768px)  { ... }  /* Tablet */
/* lg: */ @media (min-width: 1024px) { ... }  /* Laptop */
/* xl: */ @media (min-width: 1280px) { ... }  /* Desktop */
```

---

## 2. TOPBAR

### < 768px (Mobile)

```
┌────────────────────────────────────┐
│ V-INVOICE          [☰] [Avatar]    │
└────────────────────────────────────┘
```

- Ẩn page title (chỉ show brand eyebrow)
- Nav menu collapse — hamburger `[☰]` toggle
- Ẩn right controls (VND rate, etc.)

```tsx
// Hamburger toggle button: d-md-none
// Nav menu: position:absolute, top:100%, full width, background:var(--bg-base)
// Each nav item: padding: 16px; border-bottom: 1px solid var(--border-light)
```

### ≥ 768px (Tablet+)

```
┌───────────────────────────────────────────────────────────────────────┐
│ ROW 1: Eyebrow + Page Title                        User block         │
├───────────────────────────────────────────────────────────────────────┤
│ ROW 2: Nav menu items                              Right controls     │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 3. INVOICE LIST PAGE

### < 640px

- Table → **Card list layout**
- Mỗi invoice thành 1 card:

```
┌────────────────────────────────────┐
│ PO-2026-001          [PENDING]     │
│ MR-005 · HP Jewelry               │
│ 2026-05-22 · 5 items              │
│                          [VIEW →]  │
└────────────────────────────────────┘
```

```tsx
// Mobile invoice card:
// display: grid; gridTemplateColumns: '1fr auto'
// PO number: font-mono, dark badge
// Status chip: top-right
// Secondary info: flex row, font-size: var(--text-xs), color: var(--text-secondary)
// Action: btn-ghost → btn-outline (mobile)
```

### 640px–1024px (Tablet)

- Table hiển thị nhưng ẩn bớt cột: ẩn MR Number, ẩn Store (show inline trong PO row)
- Cột Actions: chỉ icon buttons (không text)

### ≥ 1024px (Desktop)

- Full table với tất cả columns
- Actions với text labels: [VIEW] [EDIT] [DELETE]

---

## 4. INVOICE DETAIL PAGE

### < 768px

**Workflow bar:** Stack vertically (column direction)

```
[DRAFT ✓]
    │
[PENDING ✓]
    │
[APPROVED →]  ← current step
    │
[INVOICED]
```

**View toggle:** Full width buttons, stacked

**JM Form View (mobile):**
- Horizontal scroll container: `overflow-x: auto`
- Min table width: `900px`
- Sticky first column (No. + SKU):

```css
.jm-table td:nth-child(1),
.jm-table td:nth-child(2),
.jm-table th:nth-child(1),
.jm-table th:nth-child(2) {
  position: sticky;
  left: 0;
  background: var(--bg-surface); /* (sku col: #FEF3C7) */
  z-index: 1;
  box-shadow: 2px 0 4px rgba(0,0,0,0.05);
}
```

**Detail View (mobile):**
- Item cards: full width
- Gem table: horizontal scroll (min-width: 700px)
- Inline edit fields: full width

### 768px–1024px (Tablet)

- Workflow bar: horizontal, compact (icon + short label)
- JM table: horizontal scroll, sticky 2 cols
- Detail view: cards full width, 2-col grid cho fields

### ≥ 1024px (Desktop)

- Workflow bar: horizontal, full labels
- JM table: no scroll (all cols visible)
- Detail view: cards + gems fully expanded

---

## 5. ADMIN PAGES

### Metal Rates / Pricing Rules / Products

**< 640px:**
- Table → Card list
- Add form: stacked full-width inputs

**640px–1024px:**
- Table với horizontal scroll
- Form trong modal (full width modal)

**≥ 1024px:**
- Full table
- Form trong modal (max-width: 520px)

---

## 6. IMPORT PAGE

### < 640px

```
┌────────────────────────────────────┐
│ DROP ZONE (full width, taller)     │
│ 200px height                       │
│                                    │
│ [Browse file]                      │
└────────────────────────────────────┘
│ PO Number: [___________________]   │
│ MR Number: [___________________]   │
│ Metal Rate: [________________▼]    │
│ Pricing Rule: [______________▼]    │
│                                    │
│ [VALIDATE FILE]                    │
```

### ≥ 640px

- Drop zone: full width, 140px height
- Form fields: 2-col grid (PO + MR on same row)

### Error table (mobile)

- Horizontal scroll
- Columns: Row | SKU | Error

---

## 7. MODALS

**< 640px:**
```css
.modal-dialog {
  margin: 0;
  max-width: 100vw;
  min-height: 100vh;    /* Full screen modal */
  border-radius: 0;
}
/* Hoặc bottom sheet style: */
.modal-dialog {
  position: fixed;
  bottom: 0;
  left: 0; right: 0;
  margin: 0;
  max-width: 100%;
  border-radius: 8px 8px 0 0;
}
```

**≥ 640px:**
```css
.modal-dialog {
  margin: 1.5rem auto;
  max-width: 640px;  /* or 400px for small modals */
}
```

---

## 8. FORM GRIDS

```css
/* Step form fields */
.form-grid {
  display: grid;
  gap: 1rem;
  
  /* Mobile: 1 column */
  grid-template-columns: 1fr;
}

@media (min-width: 640px) {
  .form-grid { grid-template-columns: 1fr 1fr; }
}

@media (min-width: 1024px) {
  .form-grid-4 { grid-template-columns: repeat(4, 1fr); }
  .form-grid-3 { grid-template-columns: repeat(3, 1fr); }
}
```

---

## 9. TYPOGRAPHY RESPONSIVE

```css
/* Page title */
.topbar-page-title {
  font-size: var(--text-2xl);   /* 32px default */
}
@media (max-width: 640px) {
  .topbar-page-title { font-size: var(--text-xl); }  /* 24px mobile */
}

/* Table cells */
.jm-table td {
  font-size: var(--text-sm);   /* 13px */
}
@media (max-width: 768px) {
  .jm-table td { font-size: var(--text-xs); }  /* 11px tablet/mobile */
}
```

---

## 10. PRINT CSS (A4 Landscape)

```css
@page {
  size: A4 landscape;
  margin: 15mm 10mm;
}

@media print {
  /* Ẩn navigation + buttons */
  .topbar-wrapper,
  .no-print,
  .workflow-bar,
  .view-toggle { display: none !important; }

  /* Body */
  body {
    font-size: 9pt;
    font-family: 'Jost', Arial, sans-serif;
    background: white;
    color: black;
  }

  /* JM Table */
  .jm-table { width: 100%; font-size: 8pt; }
  .jm-table td, .jm-table th { padding: 3pt 4pt; }

  /* SKU highlight giữ nguyên khi print */
  .sku-cell { background-color: #FEF3C7 !important; -webkit-print-color-adjust: exact; }

  /* Ba Sao text giữ màu đỏ */
  .ba-sao-text { color: #DC2626 !important; -webkit-print-color-adjust: exact; }

  /* Page break rules */
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr { page-break-inside: avoid; }
  .invoice-header { page-break-after: avoid; }
}
```

---

## 11. OVERFLOW HANDLING

```tsx
// Horizontal scroll wrapper cho tables:
<div style={{
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',  // iOS smooth scroll
  marginLeft: '-1rem',
  marginRight: '-1rem',
  paddingLeft: '1rem',
  paddingRight: '1rem',
}}>
  <table style={{ minWidth: '900px' }}>
    ...
  </table>
</div>

// Scroll indicator (mobile hint):
// gradient fade on right edge khi có scroll
```

---

## 12. COMPONENT RESPONSIVE CHECKLIST

```
[ ] Topbar: hamburger menu < 768px
[ ] Invoice list: card layout < 640px, table ≥ 640px
[ ] JM Table: sticky 2 cols + horizontal scroll (all breakpoints)
[ ] Detail View: full-width cards on mobile
[ ] Workflow bar: vertical < 768px, horizontal ≥ 768px
[ ] Modals: full-screen < 640px, centered modal ≥ 640px
[ ] Import drop zone: responsive height
[ ] Print CSS: A4 landscape, color printing preserved
[ ] Admin tables: horizontal scroll on mobile
[ ] Forms: single column mobile, multi-column desktop
```
