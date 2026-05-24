# UI/UX Specification — V-Invoice
> **Đọc khi:** implement pages, components, modals

---

## 1. DESIGN TOKENS (kế thừa BOM-web)

```css
:root {
  /* Background */
  --bg-base:    #F0EBE4;   /* Cream chủ đạo */
  --bg-surface: #FAFAF7;   /* Card, modal, panel */
  --bg-muted:   #DDD8CF;
  --bg-hover:   #E8E3DC;

  /* Text */
  --text-primary:   #1A1814;
  --text-secondary: #6B645C;
  --text-muted:     #A09890;
  --text-inverse:   #FAFAF7;

  /* Border */
  --border-strong: #1A1814;
  --border-base:   #C8C3BB;
  --border-light:  #DDD8CF;

  /* Semantic */
  --color-success: #4A7C59;
  --color-danger:  #9B4040;
  --color-warning: #8C7340;

  /* Fonts */
  --font-heading: 'Cormorant Garamond', Georgia, serif;
  --font-body:    'Jost', Arial, sans-serif;
  --font-mono:    'JetBrains Mono', Consolas, monospace;

  /* V-Invoice specific */
  --sku-highlight-bg:  #FEF3C7;   /* SKU JWMold column — LUÔN vàng */
  --ba-sao-color:      #DC2626;   /* Notes "Ba Sao" text */
  --gold-weight-bg:    #FFFBEB;   /* Gold weight cell subtle */

  /* Invoice status */
  --status-draft-bg:     #F3F4F6; --status-draft-text:     #374151;
  --status-pending-bg:   #FEF3C7; --status-pending-text:   #92400E;
  --status-approved-bg:  #D1FAE5; --status-approved-text:  #065F46;
  --status-invoiced-bg:  #1A1814; --status-invoiced-text:  #FAFAF7;
}
```

**Rules bắt buộc:**
- Button: `border-radius: 0` — VUÔNG tuyệt đối
- Avatar: ngoại lệ duy nhất `border-radius: 50%`
- Heading → `var(--font-heading)`; body/label → `var(--font-body)`
- Label/nav: `text-transform: uppercase; letter-spacing: 0.1em`
- KHÔNG hardcode màu (ngoại lệ: `#217346` Excel btn, `#FEF3C7` SKU cell)

---

## 2. LAYOUT — TOPBAR + NAV

```
┌─────────────────────────────────────────────────────────────────────┐
│ ROW 1:                                                              │
│  V-INVOICE MANAGEMENT                         [Avatar] [Username]  │
│  Page Title (serif 32px)                     [Role Badge] [Logout] │
├─────────────────────────────────────────────────────────────────────┤
│ ROW 2 (Nav):                                                        │
│  [DASHBOARD] [INVOICES] [IMPORT]                                    │
│  [METAL RATES] [PRICING RULES] [PRODUCTS]   (admin-only last 3)    │
└─────────────────────────────────────────────────────────────────────┘
```

**Nav visibility:**

| Route | Label | Roles |
|-------|-------|-------|
| `/` | DASHBOARD | All |
| `/invoices` | INVOICES | All |
| `/import` | IMPORT | user, admin |
| `/admin/metal-rates` | METAL RATES | admin |
| `/admin/pricing-rules` | PRICING RULES | admin |
| `/admin/products` | PRODUCTS | admin |

**Role badge colors:**
```typescript
const ROLE_BADGE = {
  admin:   { bg: '#1A1814', color: '#FAFAF7' },
  manager: { bg: '#1A1814', color: '#FAFAF7' },
  user:    { bg: '#4A6B8C', color: '#FAFAF7' },
}
```

---

## 3. INVOICE LIST PAGE (`/invoices`)

```
┌──────────────────────────────────────────────────────────────────┐
│ [🔍 Search PO, MR, Store...]         [+ NEW INVOICE] (btn-dark)  │
│ Filter: [All Status ▼] [All Stores ▼]                           │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TABLE: Invoices                                                 │
│  PO Number | MR | Date | Store | Items | Status | Actions       │
│                                                                  │
│  [Pagination: ← | 1–20 / N | →]                                 │
└──────────────────────────────────────────────────────────────────┘
```

### Table columns

| Col | Data | Style |
|-----|------|-------|
| PO Number | `po_number` | dark badge + font-mono |
| MR | `mr_number` | font-mono, muted |
| Date | `created_at` | YYYY-MM-DD |
| Store | `store` | outline badge |
| Items | count | number, center |
| Status | `status` | status chip (color-coded) |
| Actions | [View] [Edit] [Delete] | role-based |

### Status chips

```tsx
const STATUS_STYLES = {
  draft:            { bg: '#F3F4F6', text: '#374151', label: 'DRAFT' },
  pending_approval: { bg: '#FEF3C7', text: '#92400E', label: 'PENDING' },
  approved:         { bg: '#D1FAE5', text: '#065F46', label: 'APPROVED' },
  invoiced:         { bg: '#1A1814', text: '#FAFAF7', label: 'INVOICED' },
}
// Style: padding: 2px 8px; border-radius: 0; font-size: var(--text-xs);
//        font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
```

### Actions column

| Button | Visible | Action |
|--------|---------|--------|
| [VIEW] | All roles | Navigate `/invoices/[id]` |
| [EDIT] | admin, or non-locked manager/user | Navigate `/invoices/[id]?edit=1` |
| [DELETE] | admin only, draft only | confirm → DELETE |

---

## 4. INVOICE DETAIL PAGE (`/invoices/[id]`)

### 4.1 Header section

```
┌──────────────────────────────────────────────────────────────────┐
│ [← Back to Invoices]                                             │
│                                                                  │
│ PO: INV-2026-001          Store: HP Jewelry                      │
│ MR: MR-2026-005           Created: 2026-05-22                    │
│                           By: john.doe                           │
│                                                                  │
│ [WORKFLOW BAR]                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Workflow bar

```
DRAFT ──────── PENDING ──────── APPROVED ──────── INVOICED
  ●               ○                 ○                  ○
```

```tsx
// WorkflowBar state:
// - Completed step: dark fill ● + label weight 600
// - Current step: dark fill ● + animated pulse
// - Upcoming step: empty circle ○ + muted text
// - is_locked: thêm "🔒 LOCKED" badge bên phải

// Nút action (tùy role + current status):
// user: [SUBMIT FOR APPROVAL]     (draft → pending)
// manager: [APPROVE] [REJECT]     (pending → approved/draft)
// admin: [APPROVE] [REJECT] [MARK AS INVOICED] (approved → invoiced)

// Note reason input (khi reject/transition):
// Textarea: "Lý do (tùy chọn)"
```

### 4.3 Locked invoice banner

```tsx
// Hiển thị khi is_locked = true
<div style={{
  background: '#1A1814',
  color: '#FAFAF7',
  padding: '8px 16px',
  textAlign: 'center',
  fontSize: 'var(--text-xs)',
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
  marginBottom: '1rem',
}}>
  🔒 INVOICED — THIS INVOICE IS LOCKED AND CANNOT BE MODIFIED
</div>
```

### 4.4 View toggle

```
[JM FORM VIEW]  [DETAIL VIEW]
```

```tsx
// Tab styles:
// Active:   borderBottom: '2px solid var(--border-strong)', fontWeight: 600
// Inactive: borderBottom: '2px solid transparent', color: 'var(--text-muted)'
// Container: borderBottom: '1px solid var(--border-base)'
```

---

## 5. JM FORM VIEW

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [+ ADD ITEM]  [EXPORT EXCEL]  [PRINT PDF]                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  #  │ SKU JWMold │ SO/MO │ Store │ Loc │ Vendor# │ Desc │ Qt │ Wt │ CIF │ .. │
│─────┼────────────┼───────┼───────┼─────┼─────────┼──────┼────┼────┼─────┤   │
│  1  │ JW-001-18K │ SO123 │  HP   │ S1  │  V-001  │ Ring │  2 │5.2 │$120 │   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### JM Form Table — 15 columns

| # | Column | Width | Style | Notes |
|---|--------|-------|-------|-------|
| 1 | No. | 40px | center | |
| 2 | SKU JWMold | 120px | **LUÔN `--sku-highlight-bg: #FEF3C7`** | font-mono |
| 3 | SO/MO | 100px | | |
| 4 | Store | 80px | outline badge | |
| 5 | Location | 80px | | |
| 6 | Vendor# | 90px | font-mono | |
| 7 | Description | 180px | | truncate |
| 8 | Class | 70px | | |
| 9 | Sub | 70px | | |
| 10 | Qt | 50px | center | |
| 11 | Wt(gr) | 70px | right, font-mono | |
| 12 | CIF | 90px | right, font-mono, `--color-success` | admin/manager only |
| 13 | Tag | 90px | right, font-mono | |
| 14 | FR | 90px | right, font-mono | |
| 15 | Notes | 120px | **Ba Sao → `--ba-sao-color: #DC2626`** | |

**SKU column highlight CSS:**
```css
.jm-table td.sku-cell {
  background-color: #FEF3C7 !important;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 600;
}
/* Áp dụng ngay cả khi row:hover */
```

**Notes "Ba Sao" detection:**
```typescript
const isBaSao = (notes: string) =>
  notes?.toLowerCase().includes('ba sao') || notes?.toLowerCase().includes('3 sao')
// Render: <span style={{ color: '#DC2626', fontWeight: 600 }}>{notes}</span>
```

**Totals footer:**
```html
<tfoot>
  <tr style="fontWeight:600; borderTop:'2px solid var(--border-strong)'">
    <td colspan="9">TOTAL</td>
    <td>Σ qty</td>
    <td>— </td>
    <td>Σ cif</td>
    <td>Σ tag</td>
    <td>Σ fr</td>
    <td></td>
  </tr>
</tfoot>
```

---

## 6. DETAIL VIEW

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [+ ADD ITEM]  [RECALCULATE ALL]                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  ITEM 1: JW-001-18K — Gold Ring                              [▲ Collapse]   │
│  ─────────────────────────────────────────────────────────────              │
│  Weight Gold: [3.5000 gr]  Metal: [18KW ▼]  Gold Value: $148.75            │
│  Labor: [$5.00]  Casting: [$2.00]  Design: [$0.00]  ...                    │
│                                                                             │
│  GEMS (expandable sub-table):                                               │
│  Type     | Qty | Before | After | Unit $ | Set Fee | Wt(gr) | Total $      │
│  Diamond  |  2  | 0.30ct | 0.28ct| $850   |  $15   | 0.056  | $238.00     │
│                                                                             │
│  HPUSA: $393.75 → CIF: $433.13 → TAG: $519.75 → FR: $454.78               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Item card

```tsx
// Card styles:
// - background: var(--bg-surface)
// - border: 1px solid var(--border-base)
// - borderRadius: 4
// - marginBottom: '1rem'

// Collapse/expand toggle: [▼ / ▲] button (ghost style)
// Collapsed: chỉ show item header (line_no, sku, description, hpusa)
// Expanded: show full fields + gem table
```

### Inline edit fields

```tsx
// Editable cell (text/number):
const editableCell: CSSProperties = {
  border: '1px solid var(--border-base)',
  borderRadius: 0,
  background: 'var(--bg-surface)',
  padding: '4px 8px',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
  width: '100%',
}

// Readonly computed cell:
const computedCell: CSSProperties = {
  background: 'var(--bg-muted)',
  color: 'var(--text-secondary)',
  padding: '4px 8px',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
}

// After change: show spinner → POST to API → update display
// is_locked: all inputs become readonly (disabled)
```

### Gem sub-table

```
Columns: Type | Qty | Wt Before | Wt After | Unit $/ct | Set Fee/pcs | Wt(gr)* | Total$* | Set Total$*
* = GENERATED ALWAYS — readonly, read from DB
```

**GENERATED columns display:**
```tsx
// KHÔNG tính lại trong code — chỉ đọc từ DB response
// Hiển thị với background: var(--bg-muted) để phân biệt
// Tooltip: "Auto-calculated by database"
```

---

## 7. ADD/EDIT ITEM MODAL

**Element:** `#invoiceItemModal` — max-width: 640px

```
┌────────────────────────────────────┐
│ ADD ITEM / EDIT ITEM               │
│ ─────────────────────────────────  │
│ Line No: [auto]                    │
│ SKU JWMold: [______] *             │  ← autocomplete từ bom_products
│ Description: [____________________]│  ← auto-fill từ bom_products
│ Class: [_______] Sub: [________]   │
│ Qty Pcs: [_] Store: [___] Loc: [_] │
│                                    │
│ Metal Type: [18KW ▼]               │
│ Weight Total (gr): [_______]       │
│ Weight Gold Actual (gr): [_______] │
│                                    │
│ FEES (từ bom_products, có thể sửa) │
│ Labor: [$__] Casting: [$__]        │
│ Design: [$__] Resin: [$__] Misc[$__│
│                                    │
│ [CANCEL]           [SAVE ITEM]     │
└────────────────────────────────────┘
```

**SKU autocomplete behavior:**
```typescript
// Khi user gõ SKU → search bom_products
// Select SKU → auto-fill: description, class, sub_class, metal_type,
//              labor_fee, casting_fee, design_fee, resin_fee, misc_fee
// User có thể override sau khi auto-fill
```

---

## 8. CONFIRM/STATUS MODAL

```
┌─────────────────────────────────┐
│ SUBMIT FOR APPROVAL             │  (hoặc APPROVE / REJECT / MARK AS INVOICED)
│ ──────────────────────────────  │
│ This action will move invoice   │
│ PO-2026-001 to PENDING status.  │
│                                 │
│ Note (optional):                │
│ [________________________________│
│  ________________________________]
│                                 │
│ [CANCEL]       [CONFIRM ▶]      │
└─────────────────────────────────┘
```

**Confirm button color:**
- Default (approve/submit): `var(--btn-dark-bg)`
- Danger (reject/delete): `var(--color-danger)`

---

## 9. ADMIN PAGES

### Metal Rates (`/admin/metal-rates`)

```
┌──────────────────────────────────────────────────────────────────┐
│ [+ ADD RATE]                                                      │
│  Date     | 24K    | 18KW   | 18KY   | 14KY   | PT     | AG  | [A│
│  2026-05-22│ 79.20  │ 59.40  │ 59.40  │ 47.52  │ 31.67  │ 1.01│   │
└──────────────────────────────────────────────────────────────────┘
```

Metal rates table: font-mono cho số, `--color-teal: #2E8B8B` highlight cho rate values

### Pricing Rules (`/admin/pricing-rules`)

```
┌──────────────────────────────────────────────────────────────────┐
│ [+ ADD RULE]                                                      │
│  Name       | CIF(A) | Tag(B) | FR(C) | Loss% | Active | Actions │
│  Standard   │  1.10  │  1.20  │  1.05 │  5.0  │ ● YES  │ [E][D] │
└──────────────────────────────────────────────────────────────────┘
```

Active badge: `background: var(--color-success); color: #fff`

### Products (`/admin/products`)

```
┌──────────────────────────────────────────────────────────────────┐
│ [🔍 Search SKU...]                   [+ ADD PRODUCT]             │
│  SKU JWMold | Description | Class | Metal | Labor | Casting | [A] │
└──────────────────────────────────────────────────────────────────┘
```

---

## 10. IMPORT PAGE (`/import`)

```
┌──────────────────────────────────────────────────────────────────┐
│ IMPORT EXCEL JM FORM                                             │
│                                                                  │
│  ┌──────────────────────────────────────────┐                   │
│  │                                          │                   │
│  │   📄 Drag & drop .xlsx file here         │                   │
│  │   or click to browse                     │                   │
│  │                                          │                   │
│  └──────────────────────────────────────────┘                   │
│                                                                  │
│  PO Number: [_________________] *                                │
│  MR Number: [_________________]                                  │
│  Metal Rate: [Today: 2026-05-22 ▼]                              │
│  Pricing Rule: [Standard ▼]                                      │
│                                                                  │
│  [VALIDATE FILE]                                                 │
└──────────────────────────────────────────────────────────────────┘
```

**After validate — error panel:**
```tsx
{errors.length > 0 && (
  <div style={{ borderLeft: '2px solid var(--color-danger)', padding: '12px 16px' }}>
    <div style={{ fontWeight: 600, color: 'var(--color-danger)' }}>
      {errors.length} lỗi:
    </div>
    <table>
      <thead><tr><th>Row</th><th>SKU</th><th>Error</th></tr></thead>
      <tbody>{errors.map(e => <tr><td>{e.row}</td><td>{e.sku}</td><td>{e.message}</td></tr>)}</tbody>
    </table>
  </div>
)}
```

**Preview table (valid rows):**
```
[IMPORT {N} ITEMS]  (disabled nếu valid.length = 0)
```

---

## 11. LOADING & EMPTY STATES

```tsx
// Loading row trong table:
<tr>
  <td colSpan={N} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '3rem' }}>
    <i className="fa-solid fa-circle-notch fa-spin" />
    {' '}Đang tải...
  </td>
</tr>

// Empty state:
<tr>
  <td colSpan={N} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
    Chưa có dữ liệu
  </td>
</tr>
```

---

## 12. CONFIRM DIALOG (KHÔNG dùng `window.confirm()`)

```tsx
// Custom ConfirmModal component — luôn dùng cho delete/transition
interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  okText?: string
  danger?: boolean
  onOk: () => void
  onCancel: () => void
}
// danger=true → OK button màu var(--color-danger)
```
