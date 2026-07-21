# Multi-Metal Per Item — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Cho phép 1 item có nhiều loại vàng, mỗi loại có trọng lượng riêng; tiền vàng = Σ(trọng lượng × giá/gram từng loại).

**Architecture:** Bảng con `invoice_item_metals` (mirror `invoice_diamonds`, FK `product_id`). Item có ≥1 dòng metal → tiền vàng + trọng lượng vàng tính từ metals; 0 dòng → giữ logic single-metal cũ. Recalc đi qua `recalcItem` (thêm tham số metals) + `triggerItemRecalc`/`bulkRecalcInvoice`.

**Tech Stack:** Next.js 14 API routes, Supabase Postgres, TypeScript. Không có test framework → verify bằng `npx tsc --noEmit` + script Node throwaway cho hàm thuần + kiểm tra app thật.

## Global Constraints
- FK cột tên `product_id` (khớp `invoice_diamonds`).
- `checkEditPermission` ở mọi route ghi (khóa khi `status='finalized'`).
- `tien_vang` per-row tính server-side (KHÔNG generated column) vì phụ thuộc NVL snapshot.
- Backward-compatible: item 0 dòng metal chạy y hệt trước; không backfill.
- Migration DDL chạy tay trong Supabase SQL Editor (project `xgpkztkrlymfvlbabigl`).

---

### Task 1: DB migration + TypeScript types

**Files:**
- Create: `supabase/add_invoice_item_metals.sql`
- Modify: `types/index.ts` (thêm `InvoiceItemMetal` + field optional trên `InvoiceProduct`)

**Interfaces produced:** `InvoiceItemMetal { id, product_id, loai_vang, weight_gr, tien_vang, seq }`; `InvoiceProduct.invoice_item_metals?: InvoiceItemMetal[]`

- [ ] **Step 1: Migration SQL**
```sql
CREATE TABLE IF NOT EXISTS invoice_item_metals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES invoice_products(id) ON DELETE CASCADE,
  loai_vang   TEXT NOT NULL,
  weight_gr   NUMERIC NOT NULL DEFAULT 0,
  tien_vang   NUMERIC,
  seq         INT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_item_metals_product ON invoice_item_metals(product_id);
```
- [ ] **Step 2: Types** — thêm interface + optional field (đặt cạnh `InvoiceDiamond`).
- [ ] **Step 3:** `npx tsc --noEmit` → 0 lỗi. Commit.

---

### Task 2: Pricing — `recalcMetal` + `recalcItem` nhận metals

**Files:** Modify `lib/formulas/pricing.ts`

**Interfaces produced:**
- `recalcMetal(m: Partial<InvoiceItemMetal>, nvl: NVLSnapshot): { tien_vang: number }`
- `recalcItem(item, diamonds, nvl, template, metals: InvoiceItemMetal[] = [])` — param thứ 5 optional.

- [ ] **Step 1: Throwaway test script** (scratchpad) khẳng định:
  - metals [{18K,3},{14K,2}] → tien_vang = 3×gpg(18K)+2×gpg(14K); t_pham_tru_nvl_da = 5.
  - metals [] → giữ kết quả cũ (goldWeight = t_pham − Σhột).
- [ ] **Step 2:** chạy script → FAIL (chưa có param metals).
- [ ] **Step 3: Implement**
```ts
export function recalcMetal(m: Partial<InvoiceItemMetal>, nvl: NVLSnapshot): { tien_vang: number } {
  const gpg = goldPricePerGram(m.loai_vang ?? '', nvl)
  return { tien_vang: gpg !== null ? (m.weight_gr ?? 0) * gpg : 0 }
}
```
Trong `recalcItem`, thay khối tính goldValue:
```ts
let weightNoGem: number
let goldValue: number
if (metals.length > 0) {
  weightNoGem = metals.reduce((s, m) => s + (m.weight_gr ?? 0), 0)
  goldValue   = metals.reduce((s, m) => s + (recalcMetal(m, nvl).tien_vang), 0)
} else {
  weightNoGem = calcWeightNoGem(item.t_pham_co_nvl_da ?? 0, diamonds)
  const gpg   = goldPricePerGram(item.loai_vang ?? '', nvl)
  goldValue   = gpg !== null ? weightNoGem * gpg : 0
}
```
Return thêm `...(metals.length > 0 ? { loai_vang: metals[0].loai_vang } : {})` (đồng bộ loại chính).
- [ ] **Step 4:** chạy script → PASS. `npx tsc --noEmit`. Commit.

---

### Task 3: Recalc orchestration threads metals

**Files:** Modify `lib/formulas/recalc-helpers.ts`, `app/api/invoices/[id]/items/[itemId]/route.ts`

- [ ] **Step 1:** `triggerItemRecalc` — fetch metals + recalc per-row + pass:
```ts
const [{ data: item }, { data: diamonds }, { data: metals }] = await Promise.all([
  db.from('invoice_products').select('*').eq('id', itemId).single(),
  db.from('invoice_diamonds').select('*').eq('product_id', itemId),
  db.from('invoice_item_metals').select('*').eq('product_id', itemId).order('seq'),
])
...
const metalList = metals ?? []
if (metalList.length) {
  await Promise.all(metalList.map(m =>
    db.from('invoice_item_metals').update(recalcMetal(m, nvl)).eq('id', m.id)))
}
const updates = recalcItem(item, cleanGems as any, nvl, template, metalList as any)
```
(import `recalcMetal`.)
- [ ] **Step 2:** `bulkRecalcInvoice` — thêm `invoice_item_metals(*)` vào select; recalc từng metal; pass `item.invoice_item_metals ?? []` vào recalcItem.
- [ ] **Step 3:** `items/[itemId]/route.ts` khối recalc (dòng ~150-166) — fetch metals + pass vào recalcItem (tương tự triggerItemRecalc), hoặc chuyển sang gọi `triggerItemRecalc`. Giữ tối thiểu: fetch metals + pass.
- [ ] **Step 4:** `npx tsc --noEmit`. Commit.

---

### Task 4: Metals API routes (mirror gems)

**Files:**
- Create: `app/api/invoices/[id]/items/[itemId]/metals/route.ts` (GET, POST)
- Create: `app/api/invoices/[id]/items/[itemId]/metals/[metalId]/route.ts` (PATCH, DELETE)

Sao chép cấu trúc `gems/route.ts` + `gems/[gemId]/route.ts`: cùng `guardAndCheck`, cùng invoice select (status, created_by, template_type, nvl_*), thao tác trên `invoice_item_metals`, gọi `triggerItemRecalc`, trả `invoice_products.select('*, invoice_diamonds(*), invoice_item_metals(*)')`.
- POST body: `{ loai_vang, weight_gr }` → insert `{ product_id, seq: next, loai_vang, weight_gr, ...recalcMetal(...) }`.
- PATCH EDITABLE: `['loai_vang','weight_gr','seq']`; merge + `recalcMetal`.
- [ ] Steps: tạo 2 file, `npx tsc --noEmit`, commit.

---

### Task 5: Include metals in detail + export queries

**Files:** Modify `app/api/invoices/[id]/route.ts:24`, `export-sheets/route.ts:688`, `export/route.ts:31`

- [ ] Đổi mọi `.select('*, invoice_diamonds(*)')` (cho products) → `.select('*, invoice_diamonds(*), invoice_item_metals(*)')`. `npx tsc --noEmit`. Commit.

---

### Task 6: Export SUMMARY — nhãn gộp + gold-by-type theo metal

**Files:** Modify `app/api/invoices/[id]/export-sheets/route.ts` (+ `export/route.ts` label)

- [ ] **Step 1:** Helper trong export-sheets:
```ts
function metalLabel(item: any): string {
  const ms = (item.invoice_item_metals ?? []) as any[]
  if (!ms.length) return item.loai_vang ?? ''
  return ms.slice().sort((a,b)=>(a.seq??0)-(b.seq??0))
    .map(m => `${m.loai_vang} ${m.weight_gr}g`).join(' + ')
}
```
- [ ] **Step 2:** `buildSummaryRows`/`buildSummaryRowsADM`: ô loại vàng (`row[7]` CH1/CH2, `row[7]` ADM) = `metalLabel(item)` khi có metals, else `item.loai_vang`. `tien_vang` cell giữ `n(item.tien_vang)` (đã là tổng).
- [ ] **Step 3:** Bảng "TIỀN VÀNG THEO LOẠI" (dòng ~808): thay vòng lặp gom theo `it.loai_vang`/`it.tien_vang` bằng: nếu item có metals → cộng từng metal (karat gom `18KW→18K`, giá trị `m.tien_vang`); else dùng `it.loai_vang`+`it.tien_vang`.
- [ ] **Step 4:** `export/route.ts`: ô loại vàng dùng `metalLabel`. `npx tsc --noEmit`. Commit.

---

### Task 7: UI — danh sách metal trong Add/Edit item

**Files:** Modify `components/invoice/AddItemModal.tsx`, `components/invoice/ItemCard.tsx`, `components/invoice/DetailView.tsx`

- [ ] **Step 1:** `ItemCard` (edit item hiện có): dưới ô "Loại vàng", thêm khu "Nhiều loại vàng" — list các dòng `{loai_vang, weight_gr}` với nút thêm/xóa, gọi API `metals` (POST/PATCH/DELETE), sau mỗi thao tác cập nhật item từ response (`data` trả về đã gồm recalc). Khi có ≥1 dòng → ẩn ô loại vàng đơn, hiển thị breakdown + tổng tiền vàng. `t_pham_co_nvl_da` vẫn nhập; cảnh báo mềm nếu Σweight_gr ≠ t_pham−hột.
- [ ] **Step 2:** `AddItemModal` (item mới): cho phép nhập nhiều loại vàng ngay khi tạo — lưu vào state, sau khi tạo item (POST) thì POST từng metal, rồi refresh. (Nếu phức tạp: tạo item single trước, mở edit để thêm metal — nhưng ưu tiên nhập luôn.)
- [ ] **Step 3:** `DetailView`: hiển thị breakdown metal per item (loại • gr • tiền vàng) + tổng.
- [ ] **Step 4:** `npx tsc --noEmit` + `npm run build`. Kiểm tra app thật (Playwright/manual): tạo item CH1 2 loại vàng → tien_vang đúng; export SUMMARY nhãn gộp. Commit.

---

## Verification cuối
1. `npx tsc --noEmit` sạch, `npm run build` pass.
2. App thật: item CH1/CH2 nhiều loại vàng → tien_vang = Σ(gr×giá); von_san_xuat đúng; single-metal cũ không đổi (regression).
3. Export SUMMARY: ô loại vàng gộp nhãn, tiền vàng tổng; bảng TIỀN VÀNG THEO LOẠI gom đúng.
4. Finalized invoice không sửa được metal.
