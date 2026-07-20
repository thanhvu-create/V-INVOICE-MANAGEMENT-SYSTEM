# Design — Item nhiều loại vàng (multi-metal per item)

**Ngày:** 2026-07-20
**Trạng thái:** Đã duyệt thiết kế, chờ viết plan triển khai

---

## 1. Bối cảnh & vấn đề

Hiện tại mỗi item (`invoice_products`) chỉ có **1 trường** `loai_vang: string | null`, và tiền vàng tính bằng:

```
weightNoGem = t_pham_co_nvl_da − Σ(tl_xoan_gr của hột)
tien_vang   = weightNoGem × goldPricePerGram(loai_vang, nvl)   // 1 loại vàng duy nhất
```

(`lib/formulas/pricing.ts` — `recalcItem`, dòng ~142-145; `types/index.ts:53`.)

Thực tế có sản phẩm **1 item gồm nhiều loại vàng** (vd two-tone 18KW + 14KY, hoặc phối vàng + PT), cần tính tiền vàng theo trọng lượng từng loại. Hệ thống hiện chưa hỗ trợ.

---

## 2. Quyết định (đã chốt với user)

| # | Câu hỏi | Quyết định |
|---|---------|-----------|
| 1 | Cách biểu diễn | Mỗi loại vàng có **trọng lượng riêng**; `tien_vang = Σ(gr × giá/gram từng loại)` |
| 2 | Trọng lượng vs hột | **Tổng trọng lượng các loại = trọng lượng vàng thực tế** (đã trừ hột). Item multi-metal KHÔNG tự trừ hột nữa — Σ dòng metal là nguồn sự thật |
| 3 | Phạm vi template | **CH1 / CH2** (Lầu 2, có hột + gia công). Thiết kế tổng quát nhưng target + test ở CH1/CH2 |
| 4 | Hiển thị export | Ô "Loại vàng" **gộp nhãn** (vd `18KW 3g + 14KY 2g`), ô "Tiền vàng" = tổng. Giữ nguyên block layout |
| 5 | Hướng lưu trữ | **Hướng 1 — bảng con `invoice_item_metals`** (giống pattern `invoice_diamonds`), backward-compatible, không migrate item cũ |

---

## 3. Data model

Bảng con mới, mirror `invoice_diamonds`:

```sql
CREATE TABLE invoice_item_metals (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_product_id UUID NOT NULL REFERENCES invoice_products(id) ON DELETE CASCADE,
  loai_vang          TEXT NOT NULL,               -- "18KW", "14KY", "PT", ...
  weight_gr          NUMERIC NOT NULL DEFAULT 0,  -- TL vàng thực tế (đã trừ hột) của loại này
  tien_vang          NUMERIC,                     -- = weight_gr × giá/gram (tính server-side)
  seq                INT NOT NULL DEFAULT 0,       -- thứ tự hiển thị
  created_at         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_item_metals_product ON invoice_item_metals(invoice_product_id);
```

Ghi chú:
- `tien_vang` **KHÔNG** dùng GENERATED column: giá/gram phụ thuộc NVL snapshot của invoice (không chỉ từ dòng), nên phải tính trong recalc chain (như `invoice_products.tien_vang`).
- Giữ nguyên cột `invoice_products.loai_vang` làm **loại chính/hiển thị** + đường tính item cũ. Khi item có metal rows, `loai_vang` được đồng bộ = loại của dòng đầu (seq nhỏ nhất) cho mục đích hiển thị/gộp nhóm/tương thích.
- **Định nghĩa "multi-metal":** item có ≥1 dòng trong `invoice_item_metals`. 0 dòng → đường tính cũ (single-metal).

---

## 4. Quy tắc tính (recalcItem)

```
metals = invoice_item_metals của item (theo seq)

if metals.length > 0:
    goldWeight = Σ metals.weight_gr
    tien_vang  = Σ (metal.weight_gr × goldPricePerGram(metal.loai_vang, nvl))
    # mỗi metal.tien_vang = weight_gr × gpg(loai_vang)  (lưu per-row)
else:  # legacy single-metal
    goldWeight = t_pham_co_nvl_da − Σ(gem tl_xoan_gr)
    tien_vang  = goldWeight × goldPricePerGram(item.loai_vang, nvl)

t_pham_tru_nvl_da   = goldWeight
t_pham_vang_thuc_te = goldWeight
```

- `von_san_xuat`, `cif_price`, `tag_price`, `fb_price`: **không đổi** (vẫn dùng `tien_vang`). Hột vẫn đóng góp `Σt_gia_xoan + Σt_phi` vào `von_san_xuat` như hiện tại.
- `goldPricePerGram` trả `null` (karat lạ) → dòng đó `tien_vang = 0` (giống hành vi hiện tại khi gpg null).

---

## 5. API (mirror gems)

- `GET  /api/invoices/[id]/items/[itemId]/metals` — danh sách metal của item
- `POST /api/invoices/[id]/items/[itemId]/metals` — thêm metal
- `PATCH  /api/invoices/[id]/items/[itemId]/metals/[metalId]` — sửa metal
- `DELETE /api/invoices/[id]/items/[itemId]/metals/[metalId]` — xóa metal

Sau MỌI thao tác metal (POST/PATCH/DELETE): fetch lại metals + diamonds của item → tính `tien_vang` per-row → `recalcItem` (tổng item) → UPDATE `invoice_products`. Đồng bộ `invoice_products.loai_vang` = dòng metal đầu.

- `checkEditPermission()` áp dụng ở mọi route ghi (khóa khi `finalized`, chặn viewer, v.v.).
- Item PATCH sẵn có (`t_pham_co_nvl_da`, `loai_vang`) phải trigger recalc **có xét metals** (nếu item có metals thì bỏ qua đường t_pham − hột).

---

## 6. UI (`AddItemModal`, `ItemCard`, `DetailView`)

- Khu "Loại vàng": mặc định 1 dropdown như hiện tại. Nút **"+ Thêm loại vàng"** để thêm dòng: mỗi dòng = dropdown loại vàng (dùng `METAL_TYPES`) + ô nhập `weight_gr`.
- Khi có ≥1 dòng metal → chế độ multi-metal:
  - Dropdown "Loại vàng" đơn **được thay bằng danh sách metal** (dòng đầu = loại chính, đồng bộ về `invoice_products.loai_vang`). Không còn ô loại vàng đơn riêng để tránh nhập trùng.
  - Ô `t_pham_co_nvl_da` (tổng TL kể cả hột) **vẫn nhập như cũ** — dùng để tham chiếu + cảnh báo, KHÔNG dùng để tính trọng lượng vàng (trọng lượng vàng = Σ weight_gr).
  - Hiển thị breakdown từng loại (loại • gr • tiền vàng dòng) + tổng tiền vàng.
- Ghi chú **mềm** nếu `Σ weight_gr` ≠ `(t_pham_co_nvl_da − Σ hột)` — chỉ cảnh báo, không chặn lưu.
- `DetailView` hiển thị breakdown tiền vàng theo loại cho item multi-metal.

---

## 7. Export (Google Sheet — `export-sheets/route.ts`)

- **SUMMARY (CH1/CH2):** ô "Loại vàng" (index 7) = nhãn gộp, vd `18KW 3g + 14KY 2g`; ô "Tiền vàng" (index 8) = tổng `tien_vang`. **Không** thêm sub-row cho metal → block layout giữ nguyên (chỉ hột tạo sub-row như cũ).
- **Bảng "TIỀN VÀNG THEO LOẠI":** gom theo từng metal (mỗi metal weight×price, gộp karat `18KW+18KY → 18K`). Item single-metal dùng `loai_vang` + `item.tien_vang` như cũ.
- **JM FORM:** không ảnh hưởng (không có cột loại vàng; purchase/cif lấy từ `von_san_xuat`).
- Export Excel cũ (`export/route.ts`) và các template khác (ADM/AG3): dùng cùng hàm gộp-nhãn để không vỡ; ngoài phạm vi test nhưng không được lỗi.

---

## 8. Tương thích ngược

- Item hiện có (0 dòng metal) → hành vi **y hệt trước**. Không backfill.
- Migration: chỉ `CREATE TABLE invoice_item_metals` + index. Chạy tay trong Supabase SQL Editor (project `xgpkztkrlymfvlbabigl`).
- `types/index.ts`: thêm interface `InvoiceItemMetal` + `invoice_item_metals?: InvoiceItemMetal[]` (optional) trên `InvoiceProduct`.
- Degrade an toàn: nếu bảng chưa migrate, query metals lỗi bị bỏ qua → item chạy đường single-metal cũ.

---

## 9. Edge cases

| Case | Xử lý |
|------|-------|
| Karat lạ (gpg = null) | Dòng metal đó `tien_vang = 0` (giống hiện tại) |
| Xóa hết dòng metal | Item quay về đường tính single-metal (`loai_vang` + t_pham − hột) |
| Invoice đã finalized | `checkEditPermission` chặn thêm/sửa/xóa metal |
| Σ weight_gr lệch t_pham − hột | Cảnh báo mềm ở UI, không chặn (metals là nguồn sự thật) |
| Template ngoài CH1/CH2 | Bảng + tính toán chạy tổng quát; export dùng nhãn gộp, không vỡ |

---

## 10. Ngoài phạm vi (YAGNI)

- Không migrate item cũ sang bảng metal (Hướng 2).
- Không chia theo % (đã chọn trọng lượng tuyệt đối).
- Không thêm metal sub-row trong export (đã chọn gộp nhãn).
- Không tối ưu/redesign ADM/AG3 cho multi-metal (chỉ đảm bảo không vỡ).

---

## 11. Tiêu chí thành công

1. Tạo item CH1/CH2, thêm ≥2 loại vàng có trọng lượng → `tien_vang` = Σ(gr × giá/gram từng loại) đúng.
2. `von_san_xuat` = Σt_gia_xoan + Σt_phi + tien_vang + gia_cong + duc + thiet_ke + resin + phi_phu_kien.
3. Export SUMMARY: ô loại vàng gộp nhãn, tiền vàng = tổng; bảng TIỀN VÀNG THEO LOẠI gom đúng từng metal.
4. Item single-metal cũ giữ nguyên kết quả (regression sạch).
5. Finalized invoice không sửa được metal.
