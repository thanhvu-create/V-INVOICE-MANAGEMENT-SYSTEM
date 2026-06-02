# Phân tích File Excel Thực Tế — [Mẫu CH1] IN-V(01.7.25)
> **STATUS: ĐÃ VERIFY + FIX** — 4 câu hỏi chính đã được trả lời từ data Excel, code đã update
> **Fixes đã apply:** `lib/formulas/pricing.ts` (casting loss), `supabase/seed.sql` (rates + rules), `supabase/gem_price_catalog.sql` (mới)
> **Nguồn:** `DOCS/Copy of 0a) [Mẫu CH1] _ 1.....VNS0....._ IN-V(01.7.25)0p- CH1.xlsx`
> **Cập nhật:** 2026-06-02
> **Mục đích:** Update plan hệ thống cho đúng với cách tính và dữ liệu thực tế đang dùng

---

## 1. CẤU TRÚC 4 SHEETS

| Sheet | Nội dung |
|-------|---------|
| `10) Bảng giá NVL-10` | Bảng tra cứu giá đá (RD, PR, BG, MQ, OV, PS, XC, PL, RDL...) |
| `SUMMARY` | Bảng tính chi tiết Master-Detail (mỗi item + N dòng đá) |
| `JM FORM` | View rút gọn (1 dòng/item, link từ SUMMARY) |
| `Sheet1` | Sheet phụ |

---

## 2. BẢNG GIÁ KIM LOẠI THỰC TẾ (SUMMARY rows 1-13)

### Input từ thị trường (user nhập tay hàng ngày):
```
D2 = 24K spot price (USD/oz)   = 4100    ← Giá theo Kitco.com
E2 = Platinum (USD/oz)         = 2000
F2 = Silver (USD/oz)           = 60
G2 = Palladium (USD/oz)        = 1800
C3 = oz_per_gram               = 31.103  ← hằng số
F3 = Loss% Gold (hao hụt vàng) = 0.06   ← 6%
F11= Loss% PT (hao hụt PT)     = 0.17   ← 17%
F8 = CIF%                      = 0.10   ← 10%
```

### Công thức tính giá kim loại theo karat (USD/gram):

| Karat | Cell | Formula thực tế | Giá trị mẫu |
|-------|------|-----------------|-------------|
| 24K | C4 | `D2 / C3` | 131.82 $/gr |
| 22K | C6 | `D2*(22/24)/C3` | 120.84 $/gr |
| 18K | C7 | `D2*(18/24)*(1+F3)/C3` | 104.80 $/gr |
| 15K | C8 | `D2*(15/24)*(1+F3)/C3` | 87.33 $/gr |
| 14K | C9 | `D2*(14/24)*(1+F3)/C3` | 81.51 $/gr |
| 10K | C10 | `D2*(1+F3)*(10/24)/C3` | 58.22 $/gr |
| PT | C11 | `E2*(1+F11)/C3` | 75.23 $/gr |
| AG | C12 | `F2*(1+F3)/C3*(F11+1)` | 2.39 $/gr |
| PD | C13 | `G2*(1+F3)/C3*(F11+1)` | 67.71 $/gr |

**→ Giá per gram ĐÃ BAO GỒM hao hụt (casting loss) trong rate luôn.**

---

## 3. PHÁT HIỆN QUAN TRỌNG — CÔNG THỨC TÍNH GIÁ VÀNG

### Công thức thực tế (SUMMARY col H):

```excel
H18 = IF(LEFT(G18,2)="24", $C$4 × K18,
      IF(LEFT(G18,2)="22", $C$6 × K18,
      IF(LEFT(G18,2)="18", $C$7 × K18,
      IF(LEFT(G18,2)="PT", $C$11 × K18,
      IF(LEFT(G18,2)="AG", $C$12 × K18,
      IF(LEFT(G18,2)="PD", $C$13 × K18, " "))))))
```

→ `Tiền vàng = rate_per_gram × weight_gold_actual`

**Không có thêm (1 + casting_loss_pct) nào nữa!**
Casting loss ĐÃ BẾP VÀO rate từ bước tính ở mục 2.

### So sánh với hệ thống hiện tại:

| | Excel thực tế | Hệ thống hiện tại |
|---|---|---|
| Giá vàng | `rate × weight_gold` (rate đã bao gồm loss) | `rate × weight_gold × (1 + casting_loss_pct/100)` |
| Nơi lưu loss% | Bảng giá kim loại (tính ngầm vào rate) | `pricing_rules.casting_loss_pct` |

**→ Nếu user nhập rate đã bao gồm loss (VD: 104.80 cho 18K) vào `daily_metal_rates.gold_18kw`, hệ thống sẽ tính thừa thêm 6% nữa → SAI.**

### Phương án xử lý (chọn 1):

**Option A — Giữ nguyên kiến trúc, hướng dẫn user nhập spot price:**
```
daily_metal_rates.gold_18kw = 98.87  (spot, KHÔNG có loss)
pricing_rules.casting_loss_pct = 6.0
→ gold_value = 98.87 × weight × 1.06 = đúng
```

**Option B — Lưu derived rate (giống Excel), bỏ casting_loss trong pricing:**
```
daily_metal_rates.gold_18kw = 104.80  (derived, đã có loss)
pricing_rules.casting_loss_pct = 0.0
→ gold_value = 104.80 × weight × 1.00 = đúng
```

**Khuyến nghị: Option B** — vì user hiện đang dùng giá derived từ file Excel (104.80), không phải spot price (98.87). Thay đổi ít nhất, phù hợp nhất với workflow thực tế.

---

## 4. CÔNG THỨC HPUSA (EXACT từ SUMMARY col AB)

```excel
AB18 = SUBTOTAL(109, T18:T22)   ← Σ T.GIÁ XOÀN (gem total prices)
     + SUBTOTAL(109, V18:V22)   ← Σ T.Phí nhận hột (setting fees)
     + H18                       ← Tiền vàng
     + W18                       ← Gia công/SP (labor)
     + X18                       ← Đúc/SP (casting)
     + Y18                       ← Thiết kế/SP (design)
     + Z18                       ← Resin/SP
     + AA18                      ← Phí phụ kiện (misc)
```

**✅ Khớp 100% với công thức trong `pricing-formula.md` — không cần sửa.**

---

## 5. CÔNG THỨC CIF (EXACT từ JM FORM col M)

```excel
M4 = L4 × (1 + SUMMARY!$F$8)
   = HPUSA × (1 + 0.10)
   = HPUSA × 1.10
```

→ `cif_multiplier = 1.10` (10% markup over HPUSA)

**Note:** JM FORM chỉ tính đến CIF. Tag price và FB/FR price KHÔNG có công thức auto — không tính trong JM FORM view này.

---

## 6. GEM WEIGHT — PHÁT HIỆN QUAN TRỌNG

### Công thức TL Xoàn (gr) trong Excel:

```excel
R18 = P18 / 5
```

Trong đó:
- `P = TL (ct.) trước xử lý` = `weight_ct_BEFORE`
- `/5` = convert carat → gram (1 ct = 0.2 gr)

**→ Excel dùng `weight_ct_before` (TRƯỚC xử lý) để tính gram, KHÔNG phải `weight_ct_after`!**

### So sánh:

| | Excel | DB Schema hiện tại |
|---|---|---|
| TL Xoàn (gr) | `weight_ct_before / 5` | `weight_ct_after × 0.2` (GENERATED) |
| T.GIÁ XOÀN | `weight_ct_before × price_per_ct` | `weight_ct_after × unit_price_per_ct` (GENERATED) |

### Phương án xử lý:

**Option A (khuyến nghị — ít thay đổi nhất):**
User nhập cùng giá trị cho cả `weight_ct_before` và `weight_ct_after`. Trong thực tế file Excel, Q column (ct_after) thường blank — user chỉ dùng 1 trường. GENERATED cols tính từ `weight_ct_after`.

**Yêu cầu bổ sung vào GemModal:**
- Khi user nhập `weight_ct_before`, tự động copy sang `weight_ct_after` nếu `weight_ct_after` còn trống
- Hiển thị rõ label: "Wt Before (ct) — dùng để tính TL (gr) và T.Giá"

---

## 7. T.GIÁ XOÀN — GIÁ ĐÁ AUTO-LOOKUP

### Công thức thực tế (SUMMARY col S):

```excel
S18 = IF(N18="", "", 
         IFERROR(
           INDEX('10) Bảng giá NVL-10'!$E$3:E12, 
                 MATCH(N18, '10) Bảng giá NVL-10'!$C$3:C12, 0)
           ), 
         "")
     )
```

→ **Giá đá tự động tra cứu từ sheet "Bảng giá NVL-10" theo Mã Xoàn (gem size code)!**
User KHÔNG nhập giá tay — chỉ nhập mã xoàn (e.g., "RD1 0.7-2.0").

**T.GIÁ XOÀN = P × S = weight_ct_before × auto_lookup_price**

### Bảng giá NVL thực tế (cột MK PRICE):

| Loại | Mã | Size | MK Price ($/ct) |
|------|----|----|----------------|
| RD | RD B1 | 0.7–2.0mm | 630.58 |
| RD | RD B2 | 2.1–2.4mm | 690.00 |
| RD | RD B3 | 2.5–2.6mm | 713.00 |
| RD | RD B4 | 2.7–2.8mm | 839.50 |
| RD | RD B5 | 2.9–3.2mm | 954.50 |
| RD | RD B6 | 3.3–3.4mm | 1012.00 |
| RD | RD B7 | 3.5–3.6mm | 1265.00 |
| RD | RD B8 | 3.7–3.9mm | 1322.50 |
| RD | RD B9 | 4.0–4.4mm | 1785.95 |
| PR | PR1 | 1.0–1.8mm | 650.00 |
| PR | PR2 | 1.9–2.3mm | 572.00 |
| PR | PR3 | 2.4–2.8mm | 845.00 |
| BG | BG0 | 0.005–0.025 | 884.00 |
| BG | BG1 | 0.03–0.05 | 715.00 |
| BG | BG2 | 0.06–0.07 | 845.00 |
| BG | BG3 | 0.08–0.09 | 1105.00 |
| BG | BG4 | 0.10–0.16 | 1495.00 |
| BG | BG5 | 0.17–0.20 | 1755.00 |
| BG | BG7 | 0.26–0.28 | 2275.00 |
| MQ | MQ1 | 0.005–0.10 | 1040.00 |
| MQ | MQ2 | 0.11–0.12 | 1170.00 |
| MQ | MQ3 | 0.13–0.17 | 1495.00 |
| PS | PS1 | 0.005–0.12 | 975.00 |
| OV | OV1 | 0.005–0.095 | 845.00 |
| RDL | RDL1 | 0.6–0.9 | 299.00 |
| RDL | RDL2 | 1.0–1.1 | 218.40 |

**→ GAP: Hệ thống hiện tại yêu cầu user nhập `unit_price_per_ct` tay. Thực tế Excel tra tự động từ bảng NVL.**

### Khuyến nghị:
Tạo bảng `gem_price_catalog` trong Supabase:
```sql
CREATE TABLE gem_price_catalog (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gem_code  TEXT NOT NULL,   -- "RD B1", "PR1", "BG0"...
  gem_type  TEXT,            -- "RD", "PR", "BG", "MQ", "OV", "PS", "RDL"
  size_range TEXT,           -- "0.7-2.0mm", "2.1-2.4mm"...
  cost_price NUMERIC(10,2),  -- COST PRICE
  mk_price  NUMERIC(10,2),   -- MK PRICE (dùng để tính T.GIÁ XOÀN)
  is_active BOOLEAN DEFAULT true
);
```

Khi user nhập `gem_code` trong GemModal → auto-lookup `mk_price` → fill `unit_price_per_ct`.

---

## 8. CÁC LOẠI ĐÁ/STONE TYPES THỰC TẾ

```
RD   = Round Diamond (vòng tròn)
RDL  = Round Diamond Lab-grown (hột tổng hợp) — giá rẻ hơn nhiều
PR   = Princess cut
BG   = Baguette
MQ   = Marquise
OV   = Oval
PS   = Pear Shape
XC   = Đá viên lớn (không tính carat, tính số lượng, đơn giá riêng)
PL   = Pearl/Plate (tương tự — đơn giá riêng không theo ct)
```

### XC và PL — đặc biệt khác:
Các loại này dùng qty (số viên), không carat. Đơn giá là price/pcs, không phải price/ct.
- XC: XC1 9.5mm = $15/viên, XC2 11mm = $22.5/viên...
- PL: PL-3.0mm = $172.5/viên...

**→ GemModal cần hỗ trợ cả 2 mode:**
- Carat-based: weight_ct_before + price_per_ct → T.GIÁ = ct × price_per_ct
- Piece-based: qty_pcs + price_per_pcs → T.GIÁ = qty × price_per_pcs

---

## 9. COLUMN MAPPING THỰC TẾ (JM FORM)

| Col | Label | DB Field | Notes |
|-----|-------|----------|-------|
| A | No. | `line_no` | Auto: ROW()-3 |
| B | Store | `store` | Default "HP" |
| C | Location in store | `location_store` | Default "Safe 1" |
| D | Vendor model# | `vendor_model` | e.g., "L10437" |
| E | SO# & MO# | `so_mo_code` | e.g., "SO25.9487-MO25.32821" |
| F | SKU# new | `sku_jwmold` | **SỐ (numeric)** không phải text! VD: 107003 |
| G | Class | `class` | "24K", "18MTG", "DIAJE", "DIAMT", "18KJE", "LGRI"... |
| H | Sub class | `sub_class` | "BL", "RI", "ER", "PD", "CH"... |
| I | Description | `description` | "24KBL: 24K 111.79gr L10437 8in" |
| J | Qt. (pcs) | `qty_pcs` | Link từ SUMMARY |
| K | Wt. (gr) | `weight_total_gr` | Link từ SUMMARY |
| L | HP for Purchase price | **`hpusa`** | = SUMMARY AB |
| M | HP for CIF price | `cif_price` | = L × (1 + CIF%) |
| N | ERP for Bom cost($) | (external) | Không dùng trong system |
| O | Chênh lệch | (computed) | = (L-N)/L, không cần trong system |
| P | HP for Tag price | `tag_price` | Blank trong invoice này — không auto-computed |
| Q | HP for FB price | `fr_price` | Blank trong invoice này — không auto-computed |
| R | Ghi chú | `notes` | "CH1-Khách", "CH1-SR", "Ba Sao" |

**Quan trọng:** JM FORM label "HP for Purchase price" = HPUSA trong hệ thống.

---

## 10. CLASS VALUES THỰC TẾ (không phải ví dụ)

```
24K     = Gold chain/bracelet 24K
18MTG   = 18K Metal (không đá)
DIAJE   = Diamond Jewelry
DIAMT   = Diamond Metal (?)
18KJE   = 18K Jewelry with stones
LGRI    = Lab Grown Ring
```

**→ Phải cập nhật Class dropdown trong AddItemModal để phản ánh đúng các class thực tế.**

---

## 11. TOTALS THỰC TẾ (từ TOTAL row của file mẫu)

```
SUMMARY TOTAL row:
  Qty             = 67 pcs
  Tiền vàng ($)   = 39,414.56
  T.GIÁ XOÀN     = 5,661.64
  T.Phí nhận hột = 335.00
  Gia công        = 16.00   ← rất thấp (nhiều item không có labor fee)
  HPUSA           = 45,092.19

JM FORM TOTAL row (chỉ các item có data):
  Qty   = 29 pcs  ← 29/67 (38 rows là template trống)
  HPUSA = 45,092.19
  CIF   = (không có total, từng dòng có)
```

---

## 12. INVOICE NUMBER FORMAT THỰC TẾ

```
VNS01742  ← từ cell H1 của SUMMARY sheet
```

Format: `VNS` + sequential number (5 digits)
- VNS = Vietnam Store (?)
- Không phải format `INV-YYYYMM-XXXX` như hệ thống hiện tại generate

**→ Cân nhắc cho user nhập `vinvoice_no` (V-Invoice số) thay vì auto-generate.**

---

## 0. KẾT LUẬN DỨT KHOÁT (từ data Excel — không cần hỏi user)

| Câu hỏi | Kết luận | Evidence | Fix |
|---------|---------|----------|-----|
| **Casting loss** | Rate DERIVED (đã có 6%) | `11710.54/111.745 = 104.80 = 4100×0.75×1.06/31.103` | ✅ Đã fix `pricing.ts` — bỏ `×(1+casting_loss)` |
| **Gem price** | Dùng **MK PRICE** (col E NVL-10) | `0.025×630.58=15.76` ✓ vs `0.025×548.33=13.71` ✗ | ✅ Tạo `gem_price_catalog.sql` với data NVL |
| **Metal types** | Chỉ `18KW` trong file này | SUMMARY col G = "18KW" cho tất cả 37 items | ✅ Đã thêm `18K`, `22K`, `14K` vào RATE_MAP_KEYS |
| **SKU format** | **Numeric** (107003) | `typeof sku = 'number'` | ℹ️ Giữ TEXT trong DB — accept số, không cần đổi |
| **Seed rates** | Phải là DERIVED (có loss) | 18KW derived = 76.68, không phải spot 72.34 | ✅ Đã fix `seed.sql` — rates + casting_loss_pct=0 |

---

## 13. PHÂN TÍCH GAPS VÀ CẬP NHẬT CẦN THIẾT

### Gap A — Casting Loss trong Metal Rate (CRITICAL)

**Vấn đề:** Hệ thống áp dụng `casting_loss_pct` trong `recalcItem()`. User nhập derived rate (đã bao loss). → Tính 2 lần.

**Fix:** Cập nhật `pricing-formula.md` để document rõ:
```
Trường hợp 1 (khuyến nghị):
  daily_metal_rates: lưu derived rate (VD: 104.80 cho 18K)
  pricing_rules.casting_loss_pct: để 0
  gold_value = weight × rate × (1 + 0) = weight × rate

Trường hợp 2 (spot price):
  daily_metal_rates: lưu spot rate (VD: 98.87 cho 18K)
  pricing_rules.casting_loss_pct: 6.0
  gold_value = weight × rate × 1.06 = weight × derived_rate
```

Cập nhật Metal Rates UI: thêm note "Nhập giá ĐÃ tính hao hụt (= giá SUMMARY col C7/C8/...), không phải giá spot."

---

### Gap B — Gem Price Auto-lookup từ Bảng NVL (NICE-TO-HAVE)

**Vấn đề:** Excel auto-lookup giá đá từ bảng NVL theo mã size. Hệ thống yêu cầu nhập tay.

**Fix Phase 1 (quick):** Trong GemModal, thêm dropdown "Mã Xoàn" (gem_code) → khi chọn → auto-fill `unit_price_per_ct`.

**Fix Phase 2 (proper):** Tạo bảng `gem_price_catalog` trong DB.

---

### Gap C — Weight CT Before vs After

**Vấn đề:** Excel dùng `weight_ct_before` cho cả TL (gr) và T.GIÁ. Hệ thống dùng `weight_ct_after` trong GENERATED columns.

**Fix (minimal):** Trong GemModal, khi user nhập `weight_ct_before` → nếu `weight_ct_after` trống → auto-copy. User chỉ cần nhập 1 trường. Thêm tooltip: "Hệ thống dùng Wt After để tính — nếu không có after, nhập Before vào cả 2 field."

---

### Gap D — Class Dropdown cần cập nhật

**Classes thực tế:** 24K, 18MTG, DIAJE, DIAMT, 18KJE, LGRI, PTJE, 14KJE, ...
**Cập nhật trong:** AddItemModal, JMFormView filter, bom_products data

---

### Gap E — SKU JWMold là số (numeric) không phải text

**Vấn đề:** File Excel dùng SKU số (107003), không phải text. Hệ thống lưu TEXT.
**Resolution:** Giữ TEXT trong DB (linh hoạt hơn), nhưng AddItemModal phải accept cả số và text.

---

## 14. CÔNG THỨC TỔNG HỢP (CẬP NHẬT CHO pricing-formula.md)

```typescript
// ── METAL RATE (với derived rate — casting loss đã bao gồm) ──
// Cách tính của Excel (nên hướng dẫn user nhập vào daily_metal_rates):
// gold_18kw_per_gram = spot_24k_oz × (18/24) × (1 + 0.06) / 31.103

// ── TIỀN VÀNG (gold_value_usd) ──
// Công thức đơn giản khi rate đã bao loss:
gold_value_usd = weight_gold_actual_gr × metal_rate_per_gram
// (casting_loss_pct = 0 khi lưu derived rate)

// ── GEM (từ Excel) ──
tl_xoan_gr   = weight_ct_before / 5        // TL Xoàn (gr)
tgia_xoan    = weight_ct_before × mk_price // T.GIÁ XOÀN

// ── HPUSA ──
hpusa = gold_value_usd
      + Σ gem.tgia_xoan       // T.GIÁ XOÀN của tất cả đá
      + Σ gem.tphi_nhan_hot   // T.Phí nhận hột (qty × fee_per_pcs)
      + labor_fee + casting_fee + design_fee + resin_fee + misc_fee

// ── CIF (10% trên HPUSA) ──
cif_price = hpusa × (1 + CIF_pct)
// CIF_pct thực tế = 0.10 (10%)
// cif_multiplier = 1.10

// ── TAG / FR (không có công thức auto trong JM FORM thực tế) ──
// Các invoice này để trống Tag và FR price
// Tag và FR chỉ cần khi xuất cho channel khác nhau
```

---

## 15. BẢNG SO SÁNH HỆ THỐNG vs EXCEL THỰC TẾ

| Tính năng | Excel (thực tế) | Hệ thống hiện tại | Action cần làm |
|-----------|----------------|-------------------|----------------|
| Casting loss | Baked vào rate | `pricing_rules.casting_loss_pct` separate | Doc rõ → user nhập derived rate |
| Gem weight (gr) | `ct_before / 5` | `ct_after × 0.2` GENERATED | Auto-copy before→after trong modal |
| Gem price | Auto-lookup từ NVL bảng | Manual nhập | Gap B — thêm catalog |
| T.GIÁ XOÀN | `ct_before × price` | `ct_after × price` GENERATED | Same fix as gem weight |
| Tag price | Không auto-compute | Computed từ multiplier | Không cần fix — tính năng bổ sung |
| SKU format | Số (107003) | TEXT | Giữ TEXT, accept số |
| Invoice# | VNS01742 | INV-YYYYMM-XXXX | Document thêm vinvoice_no field |
| Gem price lookup | Auto từ NVL table | Manual | Phase 2 — nice-to-have |
| Class values | 24K, 18MTG, DIAJE... | Bất kỳ text | Cập nhật dropdown |
| HPUSA formula | ✅ Khớp | ✅ Khớp | Không cần sửa |
| CIF formula | HPUSA × 1.10 | HPUSA × cif_multiplier | Seed `cif_multiplier = 1.10` |
| Metal rate storage | Derived (loss included) | ? (chưa rõ) | Document/hướng dẫn nhập |
