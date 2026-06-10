# Template Columns — Exact Headers (5 Templates)

> **Nguồn:** Trích xuất trực tiếp từ 5 file Excel thực tế (2026-06-10).  
> Mỗi template có 2 tab chính: **JM FORM** và **SUMMARY**.

---

## 1. CH2 — Lầu 2 · CH2, CH3

**File:** `Bản sao của 20178.VNS02209_ IN-V(30.4.26)4p- CH2.xlsx`

### JM FORM

Header nằm ở **Row 2** (row 3 là sub-header của cột Sản phẩm):

| Col | Tên cột | Field DB | Ghi chú |
|-----|---------|----------|---------|
| A1 | No. | `seq` | |
| B2 | Store | `store` | |
| C3 | Location in store | `location` | |
| D4 | Vendor model# | `vendor_model` | |
| E5 | SO# & MO# | `so_mo` | |
| F6 | SKU# new | `sku` | = SKU# USA |
| G7 | Class | `class` | |
| H8 | Sub class | `sub_class` | |
| I9 | Description | `description` | |
| J10 | Qt. (pcs) *(sub-row 3)* | `qt_pcs` | |
| K11 | Wt. (gr) *(sub-row 3)* | `wt_gr` | |
| L12 | HP for Purchase price | `von_san_xuat` | **AUTO** |
| M13 | HP for CIF price | `cif_price` | **AUTO** — header tồn tại nhưng dữ liệu thực tế trống |
| N14 | HP for Tag price | `tag_price` | **AUTO** |
| O15 | HP for FB price | `fb_price` | **AUTO** |
| P16 | Ghi chú | `nini_adm` | Channel name (vd: "CH3") |

> ⚠️ **CH2 CIF**: Cột CIF có trong header (col 13) nhưng dữ liệu thực tế để trống — phù hợp với rule "CH2 không có CIF".

### SUMMARY

Header nằm ở **Row 14** (section) + **Row 15** (sub-header):

| Col | Row 14 (section) | Row 15 (sub-header) | Field DB |
|-----|-----------------|---------------------|----------|
| A1 | STT | — | `seq` |
| B2 | HÌNH ẢNH | — | `image_url` |
| C3 | THÔNG TIN SẢN PHẨM *(section)* | SO/MO | `so_mo` |
| D4 | — | Kích Thước | `kich_thuoc` |
| E5 | — | Số lượng | `qt_pcs` |
| F6 | — | Mã số mẫu | `vendor_model` |
| G7 | — | Loại vàng | `loai_vang` |
| H8 | Tiền vàng ($) | — | `tien_vang` **AUTO** |
| I9 | TRỌNG Lượng (gr) *(section)* | T.Phẩm (có NVL đá) | `t_pham_co_nvl_da` |
| J10 | — | T.Phẩm (trừ NVL đá) | `t_pham_tru_nvl_da` **AUTO** |
| K11 | — | T.Phẩm (vàng thực tế) | `t_pham_vang_thuc_te` **AUTO** |
| L12 | THÔNG TIN XOÀN *(section)* | Mã Xoàn | `diamonds[].ma_xoan` |
| M13 | — | P. chất | `diamonds[].p_chat` |
| N14 | — | Size Xoàn | `diamonds[].size_xoan_range` |
| O15 | — | SL | `diamonds[].sl_hot` |
| P16 | — | **TL sau xử lý (ct.)** ⚠️ | `diamonds[].tl_sau_xu_ly_ct` |
| Q17 | — | **TL sau xử lý (gr.)** ⚠️ | — (= P16 / 5 gr/ct) |
| R18 | — | TL Xoàn (gr) | `diamonds[].tl_xoan_gr` **AUTO** |
| S19 | GIÁ XOÀN | Đơn giá | `diamonds[].don_gia` **AUTO** |
| T20 | — | T.GIÁ XOÀN | `diamonds[].t_gia_xoan` **AUTO** |
| U21 | Phí nhận hột | Đơn giá | `diamonds[].don_gia_phi` = 1$ |
| V22 | — | T.Phí | `diamonds[].t_phi` **AUTO** |
| W23 | Gia công/1 SP | — | `gia_cong` |
| X24 | Đúc/1sp | — | `duc` |
| Y25 | Thiết Kế/1sp | — | `thiet_ke` |
| Z26 | Resin/1sp | — | `resin` |
| AA27 | Phí phụ kiện (mua bên ngoài) | — | `phi_phu_kien` |
| AB28 | HPUSA | Vốn sản xuất | `von_san_xuat` **AUTO** |
| AC29 | NINI/ADM | Bảo hiểm | `bao_hiem` / `nini_adm` |
| AD30 | Ngày gửi | — | `ngay_gui` |
| AE31 | Tracking# gửi hàng USA | — | `tracking_no` |
| AF32 | Hóa Đơn (V-INVOICE) | — | `hoa_don` |

> ⚠️ **CH2 khác CH1**: Col 16 (P) = **TL sau xử lý (ct.)** — CH2 **không có** cột "TL trước xử lý". CH1 có cả trước và sau.

---

## 2. CH1 — Lầu 2 · CH1-Khách, CH1-SR

**File:** `Bản sao của 20179.VNS02210_ IN-V(12.5.26)36p- CH1.xlsx`

### JM FORM

| Col | Tên cột | Field DB | Ghi chú |
|-----|---------|----------|---------|
| A1 | No. | `seq` | |
| B2 | Store | `store` | |
| C3 | Location in store | `location` | |
| D4 | Vendor model# | `vendor_model` | |
| E5 | SO# & MO# | `so_mo` | |
| F6 | SKU JM mới | `sku` | = SKU# USA |
| G7 | Class | `class` | |
| H8 | Sub class | `sub_class` | |
| I9 | Description | `description` | |
| J10 | Qt. (pcs) *(sub-row 3)* | `qt_pcs` | |
| K11 | Wt. (gr) *(sub-row 3)* | `wt_gr` | |
| L12 | HP for Purchase price | `von_san_xuat` | **AUTO** |
| M13 | HP for CIF price | `cif_price` | **AUTO** |
| N14 | **ERP for Bom cost ($)** | *(chưa có trong DB)* | ❗ CH1-only — để tham chiếu |
| O15 | **Chênh lệch** | *(chưa có trong DB)* | ❗ CH1-only = cột so sánh |
| P16 | HP for Tag price | `tag_price` | **AUTO** |
| Q17 | HP for FB price | `fb_price` | **AUTO** |
| R18 | Ghi chú | `nini_adm` | Channel: "CH1-Khách" / "CH1-SR" |

> ❗ **CH1 có thêm 2 cột chưa có trong web app:**
> - Col 14: **ERP for Bom cost ($)** — giá BOM từ hệ thống ERP (nội bộ)
> - Col 15: **Chênh lệch** — = Invoice price - BOM cost (so sánh)

### SUMMARY

Cùng cấu trúc CH2 nhưng **có TL trước xử lý**:

| Col | Row 15 (sub-header) | Field DB | Ghi chú vs CH2 |
|-----|---------------------|----------|----------------|
| P16 | **TL (ct.) trước xử lý** | `diamonds[].tl_truoc_xu_ly_ct` | ✅ CH1 có, CH2 không có |
| Q17 | TL (ct.) sau xử lý | `diamonds[].tl_sau_xu_ly_ct` | |
| R18 | TL Xoàn (gr) | `diamonds[].tl_xoan_gr` **AUTO** | |

Các cột còn lại (A→O, S→AF) **giống CH2** hoàn toàn, bao gồm:
- Gia công/1 SP, Đúc/1sp, Thiết Kế/1sp, Resin/1sp, Phí phụ kiện
- HPUSA → Vốn sản xuất | NINI/ADM → Bảo hiểm
- Ngày gửi, Tracking#, Hóa Đơn

---

## 3. ADM — Lầu 2 · ADM1, ADM2

**File:** `Bản sao của 20184.VNS02215_ IN-V(21.5.26)1p- ADM.xlsx`

### JM FORM

| Col | Tên cột | Field DB | Ghi chú |
|-----|---------|----------|---------|
| A1 | No. | `seq` | |
| B2 | Store | `store` | |
| C3 | Location in store | `location` | |
| D4 | Vendor model# | `vendor_model` | |
| E5 | SO# & MO# | `so_mo` | |
| F6 | SKU JM mới | `sku` | = SKU# USA |
| G7 | Class | `class` | |
| H8 | Sub class | `sub_class` | |
| I9 | Description | `description` | |
| J10 | Qt. (pcs) *(sub-row 3)* | `qt_pcs` | |
| K11 | Wt. (gr) *(sub-row 3)* | `wt_gr` | |
| L12 | HP for Purchase price | `von_san_xuat` | **AUTO** |
| M13 | HP for CIF price | `cif_price` | **AUTO** |
| N14 | **HP for Tag price** | `tag_price` | **AUTO** ❗ ADM cũng có Tag! |
| O15 | **HP for FB price** | `fb_price` | **AUTO** ❗ ADM cũng có FB! |

> ❗ **ADM cũng có Tag price và FB price** — hiện tại web app đang đánh `ag3only: true` cho 2 cột này là **SAI**. ADM cũng cần hiển thị tag_price và fb_price.

### SUMMARY

| Col | Row 14 (section) | Row 15 (sub-header) | Field DB | Khác vs CH1 |
|-----|-----------------|---------------------|----------|-------------|
| A1 | STT | — | `seq` | |
| B2 | HÌNH ẢNH | — | `image_url` | |
| C3 | THÔNG TIN SẢN PHẨM | SO/MO | `so_mo` | |
| D4 | — | Kích Thước | `kich_thuoc` | |
| E5 | — | Số lượng | `qt_pcs` | |
| F6 | — | Mã số mẫu | `vendor_model` | |
| G7 | — | Loại vàng | `loai_vang` | |
| H8 | Tiền vàng ($) | — | `tien_vang` | |
| I9 | TL SẢN PHẨM (gr) | T.Phẩm (có NVL đá) | `t_pham_co_nvl_da` | |
| J10 | — | T.Phẩm (trừ NVL đá) | `t_pham_tru_nvl_da` | |
| K11 | — | T.Phẩm (vàng thực tế) | `t_pham_vang_thuc_te` | |
| L12 | THÔNG TIN XOÀN | Mã Xoàn | `diamonds[].ma_xoan` | |
| M13 | — | P.Chất | `diamonds[].p_chat` | |
| N14 | — | **Size (mm)** | `diamonds[].size_xoan_range` | ≠ CH1 "Size Xoàn" |
| O15 | — | SL | `diamonds[].sl_hot` | |
| P16 | — | TL (ct.) trước xử lý | `diamonds[].tl_truoc_xu_ly_ct` | |
| Q17 | — | TL (ct.) sau xử lý | `diamonds[].tl_sau_xu_ly_ct` | |
| R18 | — | TL Xoàn (gr) | `diamonds[].tl_xoan_gr` | |
| S19 | GIÁ XOÀN | Đơn giá | `diamonds[].don_gia` | |
| T20 | — | **Tổng giá** | `diamonds[].t_gia_xoan` | ≠ CH1 "T.GIÁ XOÀN" |
| U21 | Phí nhận hột | Đơn giá | `diamonds[].don_gia_phi` | |
| V22 | — | T.Phí | `diamonds[].t_phi` | |
| W23 | HPUSA | **Vốn sản xuất** | `von_san_xuat` | ❗ Ở col 23 (vs CH1 col 28) |
| X24 | — | **CIF 10% ($)** | `cif_price` | ❗ ADM output CIF ở col 24 |

> ❗ **ADM SUMMARY không có** các cột fee riêng (Gia công, Đúc, Thiết Kế, Resin, Phụ kiện, Bảo hiểm, Ngày gửi, Tracking#, Hóa Đơn).  
> Chỉ có Vốn SX (col 23) và CIF 10% (col 24).

---

## 4. CH1_AG3 — Lầu 3 · CH1, CH2, CH3

**File:** `Bản sao của 20185.VNS02216_ IN-V(21.1.26)2p- CH1[AG3].xlsx`

### JM FORM

Header có **2 block**: block tổng (left) + block per-piece/1sp (right).

**Block tổng (toàn bộ lô hàng):**

| Col | Tên cột | Field DB | Ghi chú |
|-----|---------|----------|---------|
| A1 | No. | `seq` | |
| B2 | Store | `store` | |
| C3 | Location in store | `location` | |
| D4 | Vendor model# | `vendor_model` | |
| E5 | **PO#** | `po_number` | ❗ Thay SO# & MO# |
| F6 | **SKU# AG** | `sku_ag` | ❗ SKU của Lầu 3 |
| G7 | **SKU# USA** | `sku` | = SKU# USA / SKU JM |
| H8 | Class | `class` | |
| I9 | Sub class | `sub_class` | |
| J10 | Description | `description` | |
| K11 | Qt. (pcs) *(sub-row 3)* | `qt_pcs` | tổng số pcs |
| L12 | Wt. (gr) *(sub-row 3)* | `wt_gr` | tổng gr |
| M13 | HP for Purchase price | `von_san_xuat` | **AUTO** |
| N14 | HP for CIF | `cif_price` | **AUTO** (CIF 5%) |
| O15 | HP for Tag price | `tag_price` | **AUTO** |
| P16 | HP for FB price | `fb_price` | **AUTO** |

**Block per-piece / Gía/1sp (right block):**

| Col | Tên cột | Field DB | Ghi chú |
|-----|---------|----------|---------|
| Q17 | Gía/1sp (label) | — | Header section |
| Q17 *(sub)* | Qt. (pcs) | `purchase_price_unit_qty` | ❗ **Chưa có trong DB** |
| R18 *(sub)* | Wt. (gr) | `purchase_price_unit_wt` | ❗ **Chưa có trong DB** |
| S19 *(sub)* | HP for Purchase price | `purchase_price_unit` | ❗ = von_san_xuat / qt_pcs |
| T20 *(sub)* | HP for Tag price | `tag_price_unit` | ❗ = tag_price / qt_pcs |
| U21 | Chi tiếc/1sp | `chi_tiet_tap` | Ghi chú SP/1 pcs |

> **Lầu 3 luôn có 2 SKU:** SP nhập kho Lầu 3 có SKU riêng (30xxxxx), khi xuất đi CH1/CH2/CH3 có thêm SKU tương ứng.

### SUMMARY

| Col | Row 17 (section) | Row 18 (sub-header) | Field DB |
|-----|-----------------|---------------------|----------|
| A1 | STT | — | `seq` |
| B2 | HÌNH ẢNH | — | `image_url` |
| C3 | THÔNG TIN SẢN PHẨM | SO/MO *(= PO# thực tế)* | `po_number` |
| D4 | — | Kích Thước | `kich_thuoc` |
| E5 | — | Số lượng | `qt_pcs` |
| F6 | — | Mã số mẫu | `vendor_model` |
| G7 | — | Loại vàng | `loai_vang` |
| H8 | Tiền vàng ($) | — | `tien_vang` **AUTO** |
| I9 | TL T.Phẩm (gr) | — | `t_pham_co_nvl_da` |
| J10 | Trị giá ($) | — | `von_san_xuat` **AUTO** |

> ❗ **AG3 SUMMARY đơn giản**: Không có xoàn, không có fee. Chỉ có thông tin cơ bản + tiền vàng.  
> Col 8 section header = **"THÔNG TIN CHI TIẾT"** (thay vì THÔNG TIN XOÀN).

---

## 5. VNSI_AG3 — Lầu 3 · Kênh sỉ

**File:** `Bản sao của 20128.VNS02159_ IN-V(15.1.26)113p- VNSI[AG3].xlsx`

### JM FORM

**Block tổng:**

| Col | Tên cột | Field DB | Khác vs CH1_AG3 |
|-----|---------|----------|-----------------|
| A1 | No. | `seq` | |
| B2 | Store | `store` | |
| C3 | Location in store | `location` | |
| D4 | Vendor model# | `vendor_model` | |
| E5 | PO# | `po_number` | |
| F6 | **SKU#** | `sku` | ❗ Chỉ có 1 SKU (không có SKU# AG riêng) |
| G7 | Class | `class` | |
| H8 | Sub class | `sub_class` | |
| I9 | Description | `description` | |
| J10 | Qt. (pcs) *(sub-row 3)* | `qt_pcs` | |
| K11 | Wt. (gr) *(sub-row 3)* | `wt_gr` | |
| L12 | HP for Purchase price | `von_san_xuat` | |
| M13 | HP for CIF | `cif_price` | CIF 10% |
| N14 | HP for Tag price | `tag_price` | |
| O15 | HP for FB price | `fb_price` | |

**Block per-piece / Gía/1sp:**

| Col | Tên cột | Field DB |
|-----|---------|----------|
| P16 *(label)* | Gía/1sp | — |
| P16 *(sub)* | Qt. (pcs) | `purchase_price_unit_qty` |
| Q17 *(sub)* | Wt. (gr) | `purchase_price_unit_wt` |
| R18 *(sub)* | HP for Purchase price | `purchase_price_unit` |
| S19 *(sub)* | HP for Tag price | `tag_price_unit` |
| T20 | Chi tiếc/1sp | `chi_tiet_tap` |

> **VNSI_AG3 khác CH1_AG3:**
> - Chỉ có **1 cột SKU** (col F6 = SKU#), không có SKU# AG + SKU# USA riêng
> - CIF = 10% (vs 5% của CH1_AG3)

### SUMMARY

Hoàn toàn **giống CH1_AG3** (cùng cấu trúc Rows 17–18).

---

## TỔNG HỢP SO SÁNH

### JM FORM — So sánh header theo template

| Cột | CH2 | CH1 | ADM | CH1_AG3 | VNSI_AG3 |
|-----|-----|-----|-----|---------|---------|
| No. | ✅ | ✅ | ✅ | ✅ | ✅ |
| Store | ✅ | ✅ | ✅ | ✅ | ✅ |
| Location | ✅ | ✅ | ✅ | ✅ | ✅ |
| Vendor model# | ✅ | ✅ | ✅ | ✅ | ✅ |
| SO# & MO# | ✅ | ✅ | ✅ | ❌ | ❌ |
| PO# | ❌ | ❌ | ❌ | ✅ | ✅ |
| SKU# AG (Lầu 3) | ❌ | ❌ | ❌ | ✅ | ❌ |
| SKU# USA / SKU JM mới | ✅ | ✅ | ✅ | ✅ | ✅ |
| Class | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sub class | ✅ | ✅ | ✅ | ✅ | ✅ |
| Description | ✅ | ✅ | ✅ | ✅ | ✅ |
| Qt. (pcs) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Wt. (gr) | ✅ | ✅ | ✅ | ✅ | ✅ |
| HP Purchase | ✅ | ✅ | ✅ | ✅ | ✅ |
| HP CIF | ✅ (header, trống) | ✅ | ✅ | ✅ | ✅ |
| ERP Bom cost | ❌ | ✅ CH1-only | ❌ | ❌ | ❌ |
| Chênh lệch | ❌ | ✅ CH1-only | ❌ | ❌ | ❌ |
| HP Tag | ✅ | ✅ | ✅ ❗ | ✅ | ✅ |
| HP FB | ✅ | ✅ | ✅ ❗ | ✅ | ✅ |
| Ghi chú / Notes | ✅ | ✅ | ❌ | ❌ | ❌ |
| Chi tiết/1sp | ❌ | ❌ | ❌ | ✅ | ✅ |
| Block per-piece (Qt/Wt/P/Tag per 1sp) | ❌ | ❌ | ❌ | ✅ | ✅ |

### SUMMARY — So sánh xoàn tracking

| Cột | CH2 | CH1 | ADM |
|-----|-----|-----|-----|
| TL trước xử lý (ct.) | ❌ **Không có** | ✅ col 16 | ✅ col 16 |
| TL sau xử lý (ct.) | ✅ col 16 | ✅ col 17 | ✅ col 17 |
| TL sau xử lý (gr.) | ✅ col 17 | ❌ | ❌ |
| TL Xoàn (gr) | ✅ col 18 | ✅ col 18 | ✅ col 18 |

---

## PHÁT HIỆN QUAN TRỌNG — Cần sửa web app

### ❗ Bug 1: ADM cũng có Tag price và FB price

Trong `JMFormView.tsx`, cột `tag_price` và `fb_price` đang đặt `ag3only: true` — nhưng ADM cũng có 2 cột này. Phải sửa thành chỉ ẩn với CH2/CH1 (hoặc show cho tất cả trừ CH2-CIF-case).

**Sửa:** Thay `ag3only: true` → logic: hiển thị với CH1, CH2, ADM, CH1_AG3, VNSI_AG3 (tức là **tất cả** template đều có Tag/FB).

### ❗ Bug 2: CH1 có thêm ERP Bom cost + Chênh lệch

2 cột CH1-only chưa có trong DB (`erp_bom_cost`, `chenh_lech`). Cần xác nhận có cần lưu trữ không hay chỉ để tham khảo.

### ❗ Bug 3: CH2 không có TL trước xử lý

CH2 SUMMARY col 16 = "TL sau xử lý (ct.)" — không có "TL trước xử lý". Hiện tại web app dùng `tl_truoc_xu_ly_ct` chung cho mọi template. Với CH2, field này có thể để null.

### ❗ Bug 4: Block per-piece (Gía/1sp) của AG3 chưa có trong DB

CH1_AG3 và VNSI_AG3 có block tính giá/1 SP (cho lô nhiều pcs). Gồm:
- `purchase_price_unit` = von_san_xuat / qt_pcs
- `tag_price_unit` = tag_price / qt_pcs

Hiện chưa có trong `invoice_products` table.

### ❗ Bug 5: VNSI_AG3 chỉ có 1 SKU column (không có SKU# AG)

Hiện web app luôn show cả `sku_ag` + `sku` cho mọi AG3 template. VNSI_AG3 chỉ có `sku` (SKU# unique, không tách AG/USA).

---

## SQL thêm nếu cần

```sql
-- CH1-only fields (nếu cần lưu)
ALTER TABLE invoice_products
  ADD COLUMN IF NOT EXISTS erp_bom_cost NUMERIC,
  ADD COLUMN IF NOT EXISTS chenh_lech NUMERIC;

-- AG3 per-piece pricing (nếu cần lưu)
ALTER TABLE invoice_products
  ADD COLUMN IF NOT EXISTS purchase_price_unit NUMERIC,
  ADD COLUMN IF NOT EXISTS tag_price_unit NUMERIC;
```
