# UI Design System — V-Invoice
> **Aesthetic:** Luxury Editorial Jewelry — Warm Cream · Serif Heading · Square · Minimal
> **Kế thừa từ:** BOM-web design system (100% compatible)

---

## 1. COLOR PALETTE

```css
:root {
  /* Background layers */
  --bg-base:    #F0EBE4;   /* Cream — nền toàn trang */
  --bg-surface: #FAFAF7;   /* Card, modal, panel */
  --bg-muted:   #DDD8CF;   /* Disabled, empty state */
  --bg-hover:   #E8E3DC;   /* Row hover */

  /* Text */
  --text-primary:   #1A1814;
  --text-secondary: #6B645C;
  --text-muted:     #A09890;
  --text-inverse:   #FAFAF7;

  /* Border */
  --border-strong: #1A1814;
  --border-base:   #C8C3BB;
  --border-light:  #DDD8CF;

  /* Action */
  --btn-dark-bg:    #1A1814;
  --btn-dark-hover: #2D2925;

  /* Semantic */
  --color-success: #4A7C59;
  --color-danger:  #9B4040;
  --color-warning: #8C7340;
  --color-info:    #4A6B8C;

  /* V-Invoice specific */
  --sku-highlight-bg:   #FEF3C7;   /* SKU JWMold yellow */
  --sku-highlight-text: #92400E;   /* SKU text dark amber */
  --ba-sao-color:       #DC2626;   /* "Ba Sao" notes red */
  --gold-weight-bg:     #FFFBEB;   /* Gold weight soft yellow */
}
```

---

## 2. TYPOGRAPHY

```css
--font-heading: 'Cormorant Garamond', Georgia, serif;
--font-body:    'Jost', 'DM Sans', Arial, sans-serif;
--font-mono:    'JetBrains Mono', Consolas, monospace;

--text-xs:   0.6875rem;  /* 11px — label, badge, eyebrow */
--text-sm:   0.8125rem;  /* 13px — table cell, caption */
--text-base: 0.9375rem;  /* 15px — body */
--text-lg:   1.125rem;   /* 18px — card heading */
--text-xl:   1.5rem;     /* 24px — section heading */
--text-2xl:  2rem;       /* 32px — page title */
--text-3xl:  2.75rem;    /* 44px — login hero */
```

**Google Fonts CDN:**
```html
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Jost:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

---

## 3. LAYOUT — TOP NAVIGATION

```
┌──────────────────────────────────────────────────────────┐
│ V-INVOICE SYSTEM          [Username] [Role] [Avatar]     │  ← Row 1
│ Invoice Management        [SIGN OUT]                     │
├──────────────────────────────────────────────────────────┤
│ INVOICES  METAL RATES  PRICING RULES  PRODUCTS  IMPORT   │  ← Row 2 Nav
│                                            [VN/EN toggle]│
└──────────────────────────────────────────────────────────┘
```

**Nav items:**
| Key | Label | Roles |
|-----|-------|-------|
| `/invoices` | INVOICES | user, manager, admin |
| `/admin/metal-rates` | METAL RATES | admin only |
| `/admin/pricing-rules` | PRICING RULES | admin only |
| `/admin/products` | PRODUCTS | admin only |
| `/import` | IMPORT | user, admin |

**Active state:** `border-bottom: 2px solid var(--border-strong)`

---

## 4. BUTTONS

```css
/* PRIMARY — dark fill */
.btn-primary {
  background: var(--btn-dark-bg);
  color: var(--text-inverse);
  border: 1px solid var(--btn-dark-bg);
  border-radius: 0;
  padding: 8px 20px;
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
}

/* OUTLINE */
.btn-outline {
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border-strong);
  border-radius: 0;
}

/* DANGER — outline red */
.btn-danger {
  background: transparent;
  color: var(--color-danger);
  border: 1px solid var(--color-danger);
  border-radius: 0;
}
```

**RULE: Tất cả button hình vuông `border-radius: 0` — không exception.**

---

## 5. STATUS BADGE COMPONENT

```tsx
// Invoice status badges:
const STATUS_STYLES = {
  draft: {
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-base)',
    background: 'transparent',
  },
  pending_approval: {
    color: 'var(--color-warning)',
    border: '1px solid var(--color-warning)',
    background: 'transparent',
  },
  approved: {
    color: 'var(--color-success)',
    border: '1px solid var(--color-success)',
    background: 'transparent',
  },
  invoiced: {
    color: 'var(--text-inverse)',
    border: '1px solid var(--text-primary)',
    background: 'var(--text-primary)',
  },
}

// Base style:
// padding: 2px 10px; border-radius: 0;
// font-size: var(--text-xs); letter-spacing: 0.1em; text-transform: uppercase;
// font-family: var(--font-body); font-weight: 500;
```

---

## 6. INVOICE LIST TABLE

```css
/* Table container */
.invoice-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

/* Header */
.invoice-table thead th {
  background: var(--bg-base);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-base);
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 10;
}

/* Row */
.invoice-table tbody td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-light);
  color: var(--text-primary);
}

.invoice-table tbody tr:hover td {
  background: var(--bg-hover);
}

/* Locked row */
.invoice-table tbody tr.is-locked td {
  color: var(--text-secondary);
  font-style: normal;
}
```

---

## 7. JM FORM VIEW TABLE

```css
.jm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.jm-table thead th {
  background: var(--bg-base);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-base);
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 10;
}

.jm-table tbody td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-light);
  vertical-align: middle;
}

.jm-table tbody tr:hover td {
  background: var(--bg-hover);
}

/* SKU JWMold highlight — ALWAYS yellow */
.sku-cell {
  background: #FEF3C7 !important;
  color: #92400E;
  font-family: var(--font-mono);
  font-weight: 600;
  letter-spacing: 0.02em;
}

/* Gold weight — soft yellow */
.gold-weight-cell {
  background: #FFFBEB;
  font-family: var(--font-mono);
  color: #92400E;
}

/* "Ba Sao" notes — red bold */
.ba-sao-text {
  color: #DC2626;
  font-weight: 700;
}
```

---

## 8. DETAIL VIEW — INVOICE ITEMS TABLE

```css
/* Dày hơn JM Form View — hiển thị nhiều cột tính toán hơn */
.detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

/* Gem sub-rows — indent nhẹ */
.gem-row td {
  background: var(--bg-base);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  padding: 4px 8px 4px 24px;  /* indent left */
  border-bottom: 1px solid var(--border-light);
}

/* Computed values — teal */
.computed-value {
  font-family: var(--font-mono);
  color: var(--color-info);
}

/* Price cells */
.price-cell {
  font-family: var(--font-mono);
  text-align: right;
}

/* HPUSA cell — slightly highlighted */
.hpusa-cell {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--text-primary);
}
```

---

## 9. INLINE EDIT INPUTS (Detail View)

```css
/* Khi edit cell trong table */
.cell-input {
  width: 100%;
  border: none;
  border-bottom: 1px solid var(--border-base);
  background: transparent;
  padding: 2px 4px;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text-primary);
  outline: none;
}

.cell-input:focus {
  border-bottom-color: var(--border-strong);
  background: var(--bg-surface);
}

/* Readonly computed cell */
.cell-readonly {
  font-family: var(--font-mono);
  color: var(--text-muted);
  cursor: not-allowed;
}
```

---

## 10. LOCKED INVOICE BANNER

```tsx
// INVOICED — READ ONLY banner
{isLocked && (
  <div style={{
    background: 'var(--text-primary)',
    color: 'var(--text-inverse)',
    padding: '8px 20px',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-xs)',
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: '1.5rem',
  }}>
    INVOICED — READ ONLY
  </div>
)}
```

---

## 11. WORKFLOW BAR

```tsx
// Status progression bar
const STEPS = ['draft', 'pending_approval', 'approved', 'invoiced']

<div style={{
  display: 'flex', gap: 0,
  border: '1px solid var(--border-base)',
  marginBottom: '1.5rem',
}}>
  {STEPS.map((step, i) => (
    <div key={step} style={{
      flex: 1,
      padding: '10px 12px',
      borderRight: i < STEPS.length - 1 ? '1px solid var(--border-base)' : 'none',
      background: currentStatus === step ? 'var(--text-primary)' : 'transparent',
      color: currentStatus === step ? 'var(--text-inverse)' : 'var(--text-muted)',
      fontSize: 'var(--text-xs)',
      fontWeight: currentStatus === step ? 600 : 400,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      textAlign: 'center',
    }}>
      {STEP_LABELS[step]}
    </div>
  ))}
</div>
```

---

## 12. MODAL STRUCTURE

```css
/* Width guidelines */
.modal-sm:  max-width: 400px   /* Confirm dialogs */
.modal-md:  max-width: 600px   /* Add/Edit forms */
.modal-lg:  max-width: 900px   /* Invoice detail */
.modal-xl:  max-width: 1200px  /* Full invoice view */

/* Header */
.modal-header {
  background: var(--bg-base);
  border-bottom: 1px solid var(--border-light);
  padding: 1.25rem 1.5rem;
}
.modal-title {
  font-family: var(--font-heading);
  font-size: var(--text-xl);
  font-weight: 400;
  color: var(--text-primary);
}

/* Footer */
.modal-footer {
  background: var(--bg-base);
  border-top: 1px solid var(--border-light);
  padding: 1rem 1.5rem;
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}

/* Backdrop */
.modal-backdrop { background: rgba(26,24,20,0.5); }
```

---

## 13. FORM INPUTS

```css
/* Box style — for modals/forms */
.form-input {
  width: 100%;
  border: 1px solid var(--border-base);
  border-radius: 0;
  background: var(--bg-surface);
  padding: 8px 12px;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--text-primary);
  outline: none;
}
.form-input:focus { border-color: var(--border-strong); }
.form-input[readonly] { background: var(--bg-base); color: var(--text-muted); }

/* Label */
.form-label {
  display: block;
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-secondary);
  margin-bottom: 4px;
  font-weight: 500;
}

/* Required star */
.required-star { color: var(--color-danger); margin-left: 2px; }
```

---

## 14. LOADING STATE CHUẨN

```tsx
// Table loading
<tr>
  <td colSpan={N} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '3rem' }}>
    <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: '0.5rem' }} />
    Đang tải...
  </td>
</tr>

// Full page loading
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
  <i className="fa-solid fa-circle-notch fa-spin fa-2x" />
</div>
```

---

## 15. DUAL-VIEW TAB TOGGLE (Invoice Detail)

```tsx
// [JM FORM VIEW] [DETAIL VIEW] tab toggle
<div style={{
  display: 'flex',
  borderBottom: '1px solid var(--border-base)',
  marginBottom: '1.5rem',
}}>
  {['jm', 'detail'].map(v => (
    <button key={v} onClick={() => setView(v)} style={{
      padding: '10px 20px',
      border: 'none',
      borderBottom: view === v ? '2px solid var(--border-strong)' : '2px solid transparent',
      background: 'transparent',
      color: view === v ? 'var(--text-primary)' : 'var(--text-secondary)',
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-xs)',
      fontWeight: view === v ? 600 : 400,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      cursor: 'pointer',
    }}>
      {v === 'jm' ? 'JM FORM VIEW' : 'DETAIL VIEW'}
    </button>
  ))}
</div>
```

---

## 16. CONFIRM DIALOG — KHÔNG dùng `window.confirm()`

```tsx
// Custom confirm modal
interface ConfirmOptions {
  title: string
  message: string
  okText?: string
  cancelText?: string
  danger?: boolean
  onOk: () => void
}

// Usage:
confirm({
  title: 'Xóa dòng',
  message: 'Bạn chắc chắn muốn xóa line này?',
  danger: true,
  okText: 'Xóa',
  onOk: () => deleteLine(id),
})
```

---

## 17. PRINT/EXPORT BUTTON COLORS

```tsx
// Export Excel button
style={{ background: '#217346', borderColor: '#217346', color: '#fff', borderRadius: 0 }}

// Print PDF button
style={{ background: '#1A1814', borderColor: '#1A1814', color: '#fff', borderRadius: 0 }}
```

---

## 18. DESIGN CHECKLIST

```
[ ] Background: --bg-base (cream) — không trắng thuần
[ ] Heading: serif font-heading. Label/body: font-body
[ ] Label/nav/badge: UPPERCASE + letter-spacing
[ ] Button: border-radius: 0 (avatar là exception tròn duy nhất)
[ ] Không sidebar — top nav 2 hàng
[ ] Không hardcode màu hex — chỉ dùng CSS variable
[ ] Shadow tối thiểu — dùng border thay shadow cho card
[ ] Loading: fa-circle-notch fa-spin trong td colspan
[ ] Confirm: custom component — KHÔNG window.confirm()
[ ] SKU cell: ALWAYS yellow #FEF3C7
[ ] Locked invoice: black banner "INVOICED — READ ONLY"
[ ] Status badge: outline style theo STATUS_STYLES map
```
