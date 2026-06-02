# Section 2 — Functional Requirements Plan
> **Nguồn:** `MODULE QUẢN LÝ & TẠO V-INVOICE.md §2`
> **Cập nhật:** 2026-06-02 (final — 100% complete)
> **Phạm vi:** Data Entry, Calculation Rules, Formatting, Export & Print

---

## TÓM TẮT TRẠNG THÁI (sau audit 2026-06-02)

| Requirement | File chính | Status |
|-------------|-----------|--------|
| Import Excel/CSV | `app/(dashboard)/import/page.tsx` + `app/api/import/route.ts` | ✅ Done |
| Add Row via SKU (auto-populate + image_url) | `components/invoice/AddItemModal.tsx` | ✅ Done |
| Total Row — JM Form (6 totals) | `components/invoice/JMFormView.tsx` tfoot | ✅ Done |
| Total_Stone_Weight row trong JM tfoot | `components/invoice/JMFormView.tsx` tfoot | ✅ Done |
| Ba Sao highlight (red) | `JMFormView.tsx` | ✅ Done |
| Sub-total per item (gem tfoot) | `components/invoice/ItemCard.tsx` | ✅ Done |
| HPUSA breakdown trong ItemCard | `components/invoice/ItemCard.tsx` | ✅ Done |
| Detail View Total Summary | `components/invoice/DetailView.tsx` | ✅ Done |
| image_url copy khi import | `app/api/import/route.ts` | ✅ Done |
| image_url copy khi add item | `app/api/invoices/[id]/items/route.ts` | ✅ Done |
| image_url trong AddItemModal | `components/invoice/AddItemModal.tsx` | ✅ Done |
| ItemCard thumbnail ảnh | `components/invoice/ItemCard.tsx` | ✅ Done |
| Export Excel (Master-Detail + merge) | `app/api/invoices/[id]/export/route.ts` | ✅ Done |
| Export: quality column | `app/api/invoices/[id]/export/route.ts` | ✅ Done |
| Print A4 Landscape (full: logo + sig + tfoot) | `app/(dashboard)/invoices/[id]/print/page.tsx` | ✅ Done |
| Status-based edit guard — server-side (7 routes) | 5 route files | ✅ Done |
| Status-based canEdit — UI + status banners | `app/(dashboard)/invoices/[id]/page.tsx` | ✅ Done |

---

## 1. IMPORT EXCEL/CSV ✅

### Luồng đã implement:

```
User drop file → parseExcelFile() (SheetJS) → validateRows() → preview (valid + errors)
→ confirm → POST /api/import → INSERT invoice_items → recalcItem() cho từng item
```

### Fields tự động từ BOM khi import:

| Field | Source | Status |
|-------|--------|--------|
| `description` | `bom.description` | ✅ |
| `class` | `bom.class` | ✅ |
| `sub_class` | `bom.sub_class` | ✅ |
| `metal_type` | `bom.metal_type` | ✅ |
| `labor_fee` | `bom.labor_fee` | ✅ |
| `casting_fee` | `bom.casting_fee` | ✅ |
| `design_fee` | `bom.design_fee` | ✅ |
| `resin_fee` | `bom.resin_fee` | ✅ |
| `misc_fee` | `bom.misc_fee` | ✅ |
| `image_url` | `bom.image_url` | ✅ |

### Validation rules (tất cả đã implement):
```
✓ SKU blank → error
✓ SKU không trong bom_products → error
✓ qty_pcs < 1 → error
✓ weight_gold > weight_total → error
✓ SO/MO KHÔNG validate (mã ERP ngoài, free text)
✓ Partial import OK
```

---

## 2. ADD ROW VIA SKU — AddItemModal ⚠️

### File: `components/invoice/AddItemModal.tsx`

**Đã implement:**
- SKU lookup → GET /api/products?skus=SKU
- Auto-fill: description, class, sub_class, metal_type, labor/casting/design/resin/misc_fee
- POST /api/invoices/[id]/items → INSERT + recalculate

**❌ Chưa implement — image_url:**

```typescript
// Cần thêm vào Form interface:
interface Form { ..., image_url: string }

// Cần thêm vào EMPTY state:
const EMPTY: Form = { ..., image_url: '' }

// Cần thêm vào lookupSku() auto-fill:
image_url: prod.image_url ?? '',

// Cần thêm vào POST body khi handleSave():
image_url: form.image_url || null,
```

**❌ Cần sửa `app/api/invoices/[id]/items/route.ts`:**

```typescript
// Line 41 — thêm image_url vào SELECT:
.select('description, class, sub_class, metal_type, labor_fee, casting_fee, design_fee, resin_fee, misc_fee, image_url')

// Trong INSERT block — thêm:
image_url: body.image_url ?? productDefaults.image_url ?? null,
```

---

## 3. TOTAL ROW — JM FORM VIEW ⚠️

### File: `components/invoice/JMFormView.tsx`

**✅ Đã có (6 totals trong tfoot row 1):**
```typescript
totQty   = Σ qty_pcs
totWt    = Σ weight_total_gr
totGold  = Σ weight_gold_actual_gr
totNoGem = Σ weight_no_gem_gr
totGoldV = Σ gold_value_usd    (admin/manager)
totHpusa = Σ hpusa             (admin/manager)
totCif   = Σ cif_price         (admin/manager)
totTag   = Σ tag_price         (admin/manager)
```

**❌ Còn thiếu — totGemWt + second tfoot row:**

```typescript
// Thêm vào totals block:
const totGemWt = items.reduce((s, i) =>
  s + (i.item_gem_details ?? []).reduce((gs: number, g: any) => gs + (g.weight_gr ?? 0), 0), 0
)

// Thêm second tfoot row sau totals row:
{totGemWt > 0 && (
  <tr style={{ background: 'var(--bg-base)' }}>
    <td colSpan={2} />
    <td colSpan={6} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'right' }}>
      Σ TL Xoàn (gr):
    </td>
    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
      {fmt4(totGemWt)}
    </td>
    <td colSpan={99} />
  </tr>
)}
```

---

## 4. BA SAO HIGHLIGHT ✅

### File: `components/invoice/JMFormView.tsx`

```typescript
const isBaSao = item.notes?.toLowerCase().includes('ba sao')
// color: isBaSao ? '#DC2626' : 'var(--text-secondary)'
// fontWeight: isBaSao ? 700 : 400
```

**Status: Fully implemented.** Print page: Ba Sao color preserved với `print-color-adjust: exact`.

---

## 5. SUBTOTAL PER ITEM + HPUSA BREAKDOWN ❌

### File: `components/invoice/ItemCard.tsx`

**Sub-total tfoot — thêm vào sau gems.map() tbody:**
```tsx
{gems.length > 0 && (
  <tfoot>
    <tr style={{ background: 'var(--bg-base)', borderTop: '1px solid var(--border-base)' }}>
      <td colSpan={4} style={{ padding: '4px 8px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>
        Gem Subtotal
      </td>
      <td style={{ padding: '4px 8px' }} />{/* Wt After */}
      <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
        {gems.reduce((s: number, g: any) => s + (g.weight_gr ?? 0), 0).toFixed(4)}
      </td>
      <td />{/* $/ct */}
      <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
        {fmt2(gems.reduce((s: number, g: any) => s + (g.total_price ?? 0), 0))}
      </td>
      <td />{/* Setting type */}
      <td />{/* Fee/pc */}
      <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
        {fmt2(gems.reduce((s: number, g: any) => s + (g.total_setting_fee ?? 0), 0))}
      </td>
      <td />{/* Actions */}
    </tr>
  </tfoot>
)}
```

**HPUSA breakdown — thêm vào display mode (canSeePrice only):**
```tsx
{canSeePrice && (
  <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border-light)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
      HPUSA Breakdown
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}>
      <span>Gold: {fmt2(item.gold_value_usd)}</span>
      <span style={{ color: 'var(--text-muted)' }}>+</span>
      <span>Gems: {fmt2(gems.reduce((s, g) => s + (g.total_price ?? 0), 0))}</span>
      <span style={{ color: 'var(--text-muted)' }}>+</span>
      <span>Setting: {fmt2(gems.reduce((s, g) => s + (g.total_setting_fee ?? 0), 0))}</span>
      <span style={{ color: 'var(--text-muted)' }}>+</span>
      <span>Fees: {fmt2((item.labor_fee??0)+(item.casting_fee??0)+(item.design_fee??0)+(item.resin_fee??0)+(item.misc_fee??0))}</span>
      <span style={{ color: 'var(--text-muted)' }}>=</span>
      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>HPUSA: {fmt2(item.hpusa)}</span>
    </div>
  </div>
)}
```

**Quy tắc:** Đọc `total_price`, `total_setting_fee`, `weight_gr` từ DB — KHÔNG tính trong TS.

---

## 6. DETAIL VIEW TOTAL SUMMARY ❌

### File: `components/invoice/DetailView.tsx`

**Thêm sau danh sách ItemCards:**
```tsx
{items.length > 0 && (
  <div style={{ marginTop: '1.5rem', border: '2px solid var(--border-strong)', background: 'var(--bg-base)', padding: '1rem 1.25rem' }}>
    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
      Invoice Total
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
      <TotalField label="Total Qty (pcs)" value={totQty} />
      <TotalField label="Total Weight (gr)" value={fmt4(totWt)} mono />
      {totGemWt > 0 && <TotalField label="Σ TL Xoàn (gr)" value={fmt4(totGemWt)} mono muted />}
      {canSeePrice && <TotalField label="Total Gold Value" value={fmt2(totGoldV)} mono />}
      {canSeePrice && <TotalField label="Total HPUSA" value={fmt2(totHpusa)} mono bold />}
      {canSeePrice && <TotalField label="Total CIF" value={fmt2(totCif)} mono />}
      {canSeePrice && totTag > 0 && <TotalField label="Total Tag" value={fmt2(totTag)} mono />}
    </div>
  </div>
)}
```

**Spec:** `invoice-detail-inline-edit.md` §12

---

## 7. EXPORT EXCEL ✅

### File: `app/api/invoices/[id]/export/route.ts`

**Đã implement đầy đủ:**
- Master-Detail format với merge cells (`aoa_to_sheet` + `ws['!merges']`)
- Master cols A–Q (M–Q ẩn với user/viewer)
- Gem cols T–AE với `quality` (col U) ✅
- 2 sheets: `Invoice` (Master-Detail) + `Info` (header metadata)
- GENERATED cols đọc từ DB
- Filename: `invoice-{po_number}.xlsx`

---

## 8. PRINT A4 LANDSCAPE ✅

### File: `app/(dashboard)/invoices/[id]/print/page.tsx`

**Đã implement đầy đủ:**
- `@page { size: A4 landscape; margin: 15mm 10mm }` ✅
- Logo `/public/hp-logo.png` + `onError` graceful fallback ✅
- Signature block 3 cột: Prepared by / Approved by / Customer ✅
- Total_Stone_Weight (`totGemWt`) trong tfoot ✅
- Role-filtered price totals qua `adminOnly` columns ✅
- SKU `#FEF3C7` + Ba Sao `#DC2626` preserved khi print ✅
- Auto-print sau 300ms ✅
- `thead { display: table-header-group }` — repeat header ✅

---

## 9. STATUS-BASED EDIT GUARD

### Server-side ✅
**7 write routes đã implement `checkEditPermission()`:**
- `PATCH /api/invoices/[id]`
- `POST /api/invoices/[id]/items`
- `PATCH /api/invoices/[id]/items/[itemId]`
- `DELETE /api/invoices/[id]/items/[itemId]`
- `POST /api/invoices/[id]/items/[itemId]/gems`
- `PATCH /api/invoices/[id]/items/[itemId]/gems/[gemId]`
- `DELETE /api/invoices/[id]/items/[itemId]/gems/[gemId]`

Logic enforce:
```
approved    → 403 tất cả (kể cả admin)
pending     → 403 cho user role
draft       → 403 cho user khi không phải owner (created_by_user_id)
invoiced    → 403 (is_locked)
viewer      → 403 luôn
```

### UI layer ❌
**File: `app/(dashboard)/invoices/[id]/page.tsx` line ~32**

Hiện tại: `canEdit = canDo('edit')` — chỉ role check.

Cần sửa:
```typescript
const canEdit = canDo('edit')
  && !header.is_locked
  && header.status !== 'approved'
  && !(header.status === 'pending_approval' && user.role === 'user')
  && !(header.status === 'draft' && user.role === 'user' && header.created_by_user_id !== user.id)
```

Đồng thời thêm status banners (approved → green banner, pending + user → amber banner).
**Spec:** `invoice-workflow.md` §3b, §10

---

## 10. DESIGN RULES BẮT BUỘC

```
✓ GENERATED cols → đọc từ DB, KHÔNG compute trong TypeScript
✓ Total_Stone_Weight = Σ item_gem_details.weight_gr (KHÔNG = totWt - totNoGem)
✓ Ba Sao: notes.toLowerCase().includes('ba sao') — case insensitive
✓ Ba Sao in print: WebkitPrintColorAdjust + printColorAdjust: 'exact'
✓ image_url là OPTIONAL — không bao giờ required, graceful fallback nếu không có
✓ <img> onError → ẩn container (không chiếm space)
✓ Export role-filter: canSeePrice = admin || manager
✓ BOM fallback: row data → bom data → null (KHÔNG undefined)
✓ Partial import: valid rows import dù có error rows
✓ created_by_user_id (UUID) cho ownership check — KHÔNG created_by (TEXT display name)
```
