# Gap Analysis — JM Form Logic vs Webapp Hiện Tại
**Ngày review:** 2026-06-10
**Nguồn tham chiếu:** `.claude/rules/JM-FORM-SUMMARY-logic-flow.md`
**Code đã đọc:** `pricing.ts`, `types/index.ts`, `migration.sql`, `items/route.ts`, `status/route.ts`

---

## TÓM TẮT NHANH

| Mức độ | Số lượng | Mô tả |
|--------|----------|-------|
| 🔴 CRITICAL | 4 | Logic sai — cho kết quả tính tiền sai |
| 🟠 HIGH | 3 | Cấu trúc sai — chức năng không hoàn chỉnh |
| 🟡 MEDIUM | 3 | Thiếu tính năng — đã có trong Excel nhưng chưa có trên web |
| 🔵 LOW | 2 | Cần xác nhận thêm |

---

## 🔴 CRITICAL — Sai logic, cho ra số tiền sai

---

### C1 — AG formula thiếu factor loss_pt

**File:** `lib/formulas/pricing.ts:46`

**Excel (JM-FORM §2, ô C12):**
```
AG price/gram = F2 × 1.06 / C3 × 1.17
             = spot_ag × (1 + loss_gold) × (1 + loss_pt) / 31.103
```

**Code hiện tại (SAI):**
```typescript
case 'AG': return spot_ag * (1 + loss_gold) / OUNCE_PER_GRAM
```

**Code đúng:**
```typescript
case 'AG': return spot_ag * (1 + loss_gold) * (1 + loss_pt) / OUNCE_PER_GRAM
```

**Tác động:** Mọi sản phẩm AG (bạc) bị tính tiền vàng thấp hơn ~17% (thiếu factor 1.17).

---

### C2 — ADM CIF rate sai (10% → phải 5%)

**File:** `lib/formulas/pricing.ts:118-126`

**Excel (JM-FORM §8.4):**
```
| ADM | SUMMARY!W | L × 1.05 |
```
> ADM JM FORM M = L × 1.05 — **hardcode 5%**, không dùng SUMMARY!X (cái đó là CIF nội bộ SUMMARY, 10%)

**Code hiện tại (SAI):**
```typescript
if (template === 'ADM' || template === 'VNSI_AG3') {
  return purchase * 1.10
}
```

**Code đúng:**
```typescript
if (template === 'ADM') return purchase * 1.05
if (template === 'VNSI_AG3') return purchase * 1.10
```

**Giải thích thêm:** ADM có 2 CIF khác nhau:
- `SUMMARY!X` = `W × 1.10` → CIF nội bộ, chỉ để tham khảo trong SUMMARY, KHÔNG export ra JM FORM
- `JM FORM M` = `L × 1.05` → CIF thực sự ghi vào invoice PDF/Excel

Webapp cần lưu CIF theo JM FORM (5%), không phải SUMMARY internal (10%).

**Tác động:** Mọi invoice ADM bị CIF cao hơn thực tế 4.76%.

---

### C3 — DB Snapshot Trigger không bao giờ chạy

**File:** `app/api/invoices/[id]/status/route.ts:7-10` + `supabase/migration.sql:264`

**Mismatch trạng thái:**

| Nơi | States dùng |
|-----|------------|
| DB trigger | Fires khi `status = 'invoiced'` |
| Status route | Chỉ có `draft → finalized` |
| Edit guard | Check `invoice.status === 'finalized'` |

**Code status route:**
```typescript
const ALLOWED_TRANSITIONS = {
  manager: { draft: ['finalized'] },
  admin:   { draft: ['finalized'], finalized: ['draft'] },
}
```

**Hệ quả:**
- Trigger `trg_snapshot_invoice` KHÔNG BAO GIỜ được kích hoạt
- `is_locked` trong DB mãi mãi = `false`
- `snapshot_data` JSONB mãi mãi = `null`
- Lịch sử giá NVL (vàng/PT/AG) tại thời điểm finalize không được lưu

**Cách app tạm thời bù:** Edit guard check `invoice.status === 'finalized'` thay vì `is_locked` — nên khóa chỉnh sửa vẫn hoạt động, NHƯNG không có snapshot data.

**Fix:** Một trong hai:
- (A) Đổi DB trigger check từ `'invoiced'` → `'finalized'`
- (B) Thêm state `invoiced` và cập nhật status route + TypeScript types

---

### C4 — DB Table Name Mismatch (Migration vs Code)

**`supabase/migration.sql` tạo:**
- `invoice_headers`
- `invoice_items`
- `item_gem_details`

**Code API routes thực tế query:**
- `db.from('invoices')`
- `db.from('invoice_products')`
- `db.from('invoice_diamonds')`

**Kết luận:** File `migration.sql` trong repo **không phải** migration đã chạy trên Supabase production. Có hai khả năng:
1. Migration khác đã được chạy tạo ra tables đúng tên
2. Tên bảng khác nhau ở production

**Tác động:** `migration.sql` không thể dùng để reset/migrate mà không sửa tên bảng. Tài liệu DB trong repo bị misleading.

**Action:** Cần export schema thực từ Supabase để làm ground truth.

---

## 🟠 HIGH — Cấu trúc thiếu / không hoàn chỉnh

---

### H1 — AG3 Loss Vàng 11% không được xử lý riêng

**Excel (JM-FORM §8.2 — CH1 AG3):**
```
Loss 14K/18K: G3 = 0.11 (11%, khác Lầu 2 dùng 6%)
```

**Vấn đề:** `goldPricePerGram()` dùng `nvl.loss_gold` lấy từ NVL snapshot của invoice. Nếu invoice CH1_AG3 được tạo với `nvl_loss_gold = 0.06` (default), thì tính giá sẽ thiếu ~5%.

**Cần kiểm tra:** Khi tạo invoice mới (POST `/api/invoices`), `nvl_loss_gold` được set bao nhiêu cho template CH1_AG3 và VNSI_AG3? Xem `app/api/invoices/route.ts` (POST handler, chưa đọc đủ).

**Fix nếu cần:** Khi `template_type IN ('CH1_AG3', 'VNSI_AG3')`, mặc định `nvl_loss_gold = 0.11`.

---

### H2 — `tl_xoan_gr` dùng `tl_truoc` nhưng cần dùng đúng logic

**Excel (JM-FORM §5, Step 5):**
```
TL Xoàn (gr) [R] = TL (ct.) trước xử lý [P] / 5
```

**Code (`recalcDiamond()`):**
```typescript
const tl_base = d.tl_truoc_xu_ly_ct ?? d.tl_sau_xu_ly_ct ?? 0
tl_xoan_gr:  tl_base / 5,
t_gia_xoan:  tl_base * don_gia,
```

**Tình trạng:** ✅ Đúng với CH1/ADM — dùng `tl_truoc`. Fallback sang `tl_sau` khi CH2 không có cột `tl_truoc` cũng hợp lý.

**Nhưng:** Excel §5 ghi rõ "cột Q (TL sau xử lý ct.) hiện chưa dùng trong công thức". Web app lưu trường này nhưng không có UI kiểm tra giá trị.

**Action:** Xác nhận UI AddItemModal/GemModal có hiển thị và cho nhập `tl_sau_xu_ly_ct` không (chỉ lưu để tham khảo, không tính toán).

---

### H3 — Thiếu `erp_bom_cost` + `chenh_lech` trong TypeScript types

**Excel JM FORM columns (CH1):**
- Cột N: `ERP for Bom cost ($)` — nhập thủ công
- Cột O: `Chênh lệch = (Purchase - ERP) / Purchase`

**Code PATCH route (`items/[itemId]/route.ts:41`):**
```typescript
const EDITABLE = [..., 'erp_bom_cost', ...]
```

**Tình trạng:** `erp_bom_cost` có trong PATCH EDITABLE list, nhưng:
1. Không có trong `types/index.ts → InvoiceProduct` interface
2. `chenh_lech` (computed field) không có trong types
3. Không rõ có trong DB schema thực không (migration.sql không có)

**Action:** Kiểm tra DB thực có cột `erp_bom_cost` không. Nếu có, thêm vào `types/index.ts`.

---

## 🟡 MEDIUM — Tính năng còn thiếu

---

### M1 — Chưa implement `mapSizeToRange()` (Size Lookup cho Xoàn)

**Excel (JM-FORM §9.4):** Logic mapping đầy đủ:
- RD: 10 ranges (theo mm)
- RD-LG: 11 ranges (theo mm)
- PR: 5 ranges (theo mm × mm)
- BG, MQ, PS, OV: Theo ct/viên (TB viên)

**Code hiện tại:** File `lib/formulas/size-mapping.ts` **chưa tồn tại**.

**Tác động:** GemModal buộc người dùng nhập thủ công chuỗi "RD2 2.1 - 2.4" thay vì auto-map từ size đo được.

**Fix:** Tạo `lib/formulas/size-mapping.ts` với function:
```typescript
export function mapSizeToRange(maXoan: string, sizeMm: string, tbVien: number): string | null
```
Dữ liệu bảng mapping đã đầy đủ trong §9.4 của JM-FORM doc.

---

### M2 — Chưa có THEO DÕI XOÀN auto-fill

**Excel (JM-FORM §9):** Khi user nhập SO/MO vào JM Form → tự động lookup file `TỔNG HỢP THEO DÕI XOÀN 2026.xlsx` → điền thông tin xoàn (Mã xoàn, Size, SL hột, TB viên).

**Web app hiện tại:** Không có tính năng này. User phải nhập thủ công từng gem row trong GemModal.

**Fix cần:**
1. Bảng DB `xoan_tracking` (MO, ma_xoan, size, sl_hot, tb_vien, trang_thai)
2. Import API để upload file tracking Excel
3. API endpoint: `GET /api/xoan-tracking?mo=26.36160` → trả về danh sách gem rows
4. UI: Khi nhập SO/MO trong AddItemModal → gợi ý auto-fill gems

---

### M3 — Chưa có SPHT Import (nguồn tạo invoice chính)

**Excel (JM-FORM §10):** File `SPHT NHẬP KHO TỔNG.xlsx` là nguồn tạo invoice:
- Lọc `A="US" AND Q="Đã ship"`
- Group by `R (V-INV)` → mỗi V-INV = 1 invoice
- Phân loại template theo `P (TÊN KHÁCH)`

**Web app hiện tại:** Có `/api/import` nhưng format khác (import từ template đã export sẵn, không phải từ SPHT).

**Fix cần:**
1. Trang import có tab "SPHT NHẬP KHO"
2. API `POST /api/import/spht` — parse SPHT Excel, tạo invoices theo V-INV grouping
3. Logic phân loại template từ cột P

---

## 🔵 LOW — Cần xác nhận

---

### L1 — Per-unit pricing (AG3 templates)

**Excel (JM-FORM §8.2 — CH1 AG3, VNSI AG3):**
- CH1 AG3: Cột Q2-T3: Giá/1sp, TL/1sp
- VNSI AG3: Cột P2-S3: Giá/1sp

**Web app:** TypeScript có `qt_pcs` nhưng không có `gia_per_unit` hay `tl_per_unit`.

**Action:** Xác nhận user có cần hiển thị/tính per-unit price không, hay đây chỉ là derived display (purchase / qt_pcs).

---

### L2 — CH1_AG3 có 2 cột SKU (AG + USA)

**Excel (JM-FORM §8.2 — CH1 AG3):**
- F2: SKU# AG (phía VN)
- G2: SKU# USA (phía US)

**Web app:** TypeScript `InvoiceProduct` có `sku` (1 cột) + `sku_ag` (AG3 specific). Nhưng không rõ:
- `sku` map vào SKU AG hay SKU USA?
- UI AddItemModal có hiển thị 2 ô SKU riêng cho template AG3 không?

**Action:** Verify AddItemModal.tsx có conditional render cho CH1_AG3 template.

---

## BẢNG TỔNG HỢP — Ưu tiên Fix

| # | Issue | File cần sửa | Độ khó | Ưu tiên |
|---|-------|-------------|--------|---------|
| C1 | AG formula | `lib/formulas/pricing.ts:46` | Dễ (1 dòng) | 🔴 Ngay |
| C2 | ADM CIF 10%→5% | `lib/formulas/pricing.ts:122` | Dễ (tách điều kiện) | 🔴 Ngay |
| C3 | Snapshot trigger | `migration.sql` + `status/route.ts` | Trung bình | 🔴 Ngay |
| C4 | Migration table names | `migration.sql` | Cần export DB thực | 🟠 Sớm |
| H1 | AG3 loss 11% | `app/api/invoices/route.ts` POST | Dễ | 🟠 Sớm |
| H3 | erp_bom_cost in types | `types/index.ts` | Dễ | 🟠 Sớm |
| M1 | mapSizeToRange() | `lib/formulas/size-mapping.ts` (mới) | Trung bình | 🟡 Sprint 2 |
| M2 | Theo dõi xoàn | DB + API + UI | Khó | 🟡 Sprint 3 |
| M3 | SPHT Import | API + UI | Khó | 🟡 Sprint 3 |

---

## LỘ TRÌNH ĐỀ XUẤT

### Sprint 1 — Fix bugs (1-2 ngày)
1. Fix C1: `pricing.ts:46` — AG formula thêm `* (1 + loss_pt)`
2. Fix C2: `pricing.ts:122` — tách ADM (1.05) và VNSI_AG3 (1.10)
3. Fix C3: Sửa trigger hoặc status route để snapshot hoạt động
4. Verify H1: Check invoice POST xem AG3 có set `loss_gold = 0.11` không
5. Fix H3: Thêm `erp_bom_cost` vào `types/index.ts`

### Sprint 2 — Complete gem workflow (3-5 ngày)
6. Implement M1: `lib/formulas/size-mapping.ts`
7. Integrate size mapping vào GemModal (auto-suggest size range)
8. Clarify + fix L1, L2 (per-unit pricing, AG3 dual SKU)

### Sprint 3 — Import automation (1-2 tuần)
9. THEO DÕI XOÀN: DB schema + import API + auto-fill UI
10. SPHT Import: Parser + template detection + bulk invoice creation

---

## REFERENCES

| Mục | File tham chiếu |
|-----|----------------|
| Excel logic gốc | `.claude/rules/JM-FORM-SUMMARY-logic-flow.md` |
| Code công thức | `lib/formulas/pricing.ts` |
| TypeScript types | `types/index.ts` |
| DB schema (repo) | `supabase/migration.sql` |
| Status workflow | `app/api/invoices/[id]/status/route.ts` |
| PATCH item | `app/api/invoices/[id]/items/[itemId]/route.ts` |
