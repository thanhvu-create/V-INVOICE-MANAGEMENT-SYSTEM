# Excel Analysis & V-Invoice Update Plan
> **Nguồn:** `Copy of 0a) [Mẫu CH1] _ 1.....VNS0....._ IN-V(01.7.25)0p- CH1 (1).xlsx`
> **Ngày phân tích:** 2026-06-03
> **Mục đích:** Phân tích logic thực tế người dùng → update web app vinvoice

---

## 1. CẤU TRÚC 5 SHEETS

| Sheet | Mục đích |
|-------|---------|
| **Gold Pricing** | Nhập giá spot USD/oz hàng ngày → tự tính per-gram |
| **10) Bảng giá NVL-10** | Catalog giá đá/xoàn (tra cứu tự động) |
| **SUMMARY** | Nhập liệu chính: Master-Detail (1 item + tối đa 4 gem sub-rows) |
| **JM FORM** | View rút gọn: 1 dòng/item, link từ SUMMARY |
| **Sheet1** | Blank |

---

## 2. LUỒNG NGƯỜI DÙNG THỰC TẾ

### Bước 1 — Cập nhật giá vàng hàng ngày (Gold Pricing sheet)
```
User mở Kitco.com → lấy spot price USD/oz → nhập vào:
  D2 = 24K spot (VD: 4100)
  E2 = Platinum (VD: 2000)
  F2 = Silver (VD: 60)
  G2 = Palladium (VD: 1800)
→ Giá per-gram TỰ ĐỘNG tính cho tất cả karat
```

### Bước 2 — Nhập từng item trong SUMMARY sheet
```
Với mỗi sản phẩm (1 master row + tối đa 4 gem sub-rows):
  Col C = SO/MO number
  Col D = Kích thước
  Col E = Số lượng (qty)
  Col F = Mã số mẫu (vendor model: L10437)
  Col G = Loại vàng (18KW, 18KY, 14KY, PT...)
  Col I = T.Phẩm có NVL đá (tổng trọng lượng, user nhập)
  → Col K TỰ TÍNH = Col I - Σ TL xoàn(gr) = weight_gold_actual
  → Col H TỰ TÍNH = rate[metal] × Col K = Tiền vàng ($)

  Với mỗi gem sub-row:
    Col N = Size Xoàn code (VD: "RD1 0.7 - 2.0", "XC1 9.5mm")
    → Col S TỰ TÍNH = INDEX/MATCH từ NVL catalog (MK Price)
    Col O = Số lượng đá (qty gems)
    Col P = TL (ct) trước xử lý (weight_ct_before — LUÔN dùng, KHÔNG dùng col Q)
    → Col R TỰ TÍNH = P / 5 (ct → gr)
    → Col T TỰ TÍNH = P × S (T.Giá Xoàn = ct × price)
    Col U = Phí nhận hột / pcs (setting fee per pcs, user nhập)
    → Col V TỰ TÍNH = U × O (T.Phí nhận hột)
  
  Fees (user nhập):
    Col W = Gia công / SP
    Col X = Đúc / SP
    Col Y = Thiết kế / SP
    Col Z = Resin / SP
    Col AA = Phí phụ kiện

  → Col AB TỰ TÍNH = HPUSA
  → Col AC = NINI/ADM (insurance, = 0 trong file này)
  
  Post-ship:
    Col AD = Ngày gửi
    Col AE = Tracking#
    Col AF = V-INVOICE number
```

### Bước 3 — JM FORM tự cập nhật
```
JM FORM link từ SUMMARY:
  Col L = SUMMARY!AB (HPUSA)
  Col M = L × 1.10 (CIF = HPUSA × 10%)
  Col P (Tag), Col Q (FB/FR) = BLANK → user fill sau hoặc không fill
```

---

## 3. CÔNG THỨC QUAN TRỌNG (EXACT từ Excel)

### 3a. Gold Price Per Gram (Gold Pricing sheet)

```
Ounce per gram = 31.103 (hằng số)
Loss Gold      = 6%  (F3)
Loss Platinum  = 17% (F11)
CIF%           = 10% (F8)

24K /gr = spot_24K / 31.103                           ← KHÔNG có casting loss!
18K /gr = spot_24K × (18/24) × (1 + 0.06) / 31.103   ← loss = 6%
15K /gr = spot_24K × (15/24) × (1 + 0.06) / 31.103
14K /gr = spot_24K × (14/24) × (1 + 0.06) / 31.103
10K /gr = spot_24K × (10/24) × (1 + 0.06) / 31.103
PT  /gr = spot_PT  × (1 + 0.17) / 31.103              ← loss = 17%
AG  /gr = spot_AG  × (1 + 0.06) / 31.103 × (0.17 + 1) ← cả 2 loss!
PD  /gr = spot_PD  × (1 + 0.17) / 31.103
```

**⚠️ QUAN TRỌNG: Giá 24K KHÔNG có casting loss. Chỉ 18K, 14K, etc. mới có.**

**VD với spot 24K = $4,100/oz:**
```
24K  = 4100 / 31.103                    = $131.82/gr
18K  = 4100 × 0.75 × 1.06 / 31.103     = $104.80/gr
14K  = 4100 × 0.5833 × 1.06 / 31.103   = $81.51/gr
PT   = 2000 × 1.17 / 31.103             = $75.23/gr
AG   = 60   × 1.06 / 31.103 × 1.17     = $2.39/gr
```

### 3b. Tiền vàng (Gold Value)

```
H17 = IF(LEFT(G17,2)="24", rate_24K × K17,
      IF(LEFT(G17,2)="18", rate_18K × K17,
      IF(LEFT(G17,2)="14", rate_14K × K17,
      IF(LEFT(G17,2)="PT", rate_PT × K17,
      ...))))

→ gold_value_usd = rate_per_gram[metal_type] × weight_gold_actual_gr
```

**Rate đã bao gồm casting loss → KHÔNG nhân thêm (1 + casting_loss).**

### 3c. Weight Gold Actual = Weight No Gem (SAME)

```
K17 = I17 - SUBTOTAL(109, R17:R21)   ← weight_gold_actual
J17 = I17 - SUBTOTAL(109, R17:R21)   ← weight_no_gem (CÙNG CÔNG THỨC!)

→ weight_gold_actual_gr = weight_no_gem_gr = weight_total_gr - Σ gem.weight_gr
```

**User CHỈ nhập total weight (col I). Gold actual TỰ TÍNH.**

### 3d. Gem Weight (ct → gr)

```
R17 = P17 / 5   ← TL xoàn (gr) = ct_before / 5

Quan trọng:
- Col Q (weight_ct_after) = LUÔN BLANK trong data thực tế
- Chỉ dùng col P (weight_ct_before)
- Công thức: ct_before / 5 (KHÔNG phải ct_after × 0.2)
```

### 3e. Gem Price Auto-lookup từ NVL

```
S17 = IFERROR(INDEX('NVL-10'!$E$3:E113, MATCH(N17,'NVL-10'!$C$3:C113, 0)), "")

→ user chọn "Size Xoàn" code (col N) → giá tự động load từ catalog
→ user KHÔNG nhập giá tay
→ T.Giá Xoàn = P × S = ct_before × auto_price
```

### 3f. Setting Fee

```
V17 = U17 × O17   ← T.Phí nhận hột = fee_per_pcs × qty
→ Khớp 100% với current schema ✅
```

### 3g. HPUSA (Exact formula)

```
AB17 = SUBTOTAL(109, T17:T21)   ← Σ T.Giá Xoàn (5 gem slots)
     + SUBTOTAL(109, V17:V21)   ← Σ T.Phí nhận hột (5 gem slots)
     + H17                       ← Tiền vàng
     + W17                       ← Gia công
     + X17                       ← Đúc
     + Y17                       ← Thiết kế
     + Z17                       ← Resin
     + AA17                      ← Phí phụ kiện

→ Khớp 100% với current schema ✅
```

### 3h. CIF

```
M4 (JM FORM) = L4 × (1 + SUMMARY!$F$8)
             = HPUSA × 1.10

→ CIF% = 10% → cif_multiplier = 1.10 ✅
```

### 3i. Tag / FB Price

```
JM FORM Col P (Tag), Col Q (FB/FR) = BLANK trong invoice này
→ Không auto-computed → user fill thủ công sau nếu cần
→ Web app tính tự động từ multiplier = THÊM VALUE (OK)
```

---

## 4. XC / PL GEM TYPES — Cách hoạt động

### XC (Cubic Zirconia / Crystal pieces):
```
NVL catalog: XC1 9.5mm = $15/pcs, XC2 11mm = $22.5/pcs...
SUMMARY: Col N = "XC1 9.5mm" → Col S = 15 (auto-lookup)
         Col P (ct_before) = BLANK → Col T = 0 × 15 = 0
         Col O (qty) = 1, Col U (setting fee) = 1 → Col V = 1
→ HPUSA contribution: T.Giá = $0, T.Phí = $1/viên
```

**Giải thích**: XC/CZ là đá nhân tạo rẻ tiền → giá vật liệu = 0 trong invoice.
Chỉ tính phí nhận hột ($1/viên). Price từ catalog chỉ là reference.

### PL (Pearl):
```
NVL catalog: PL-3.0mm = $172.5/pcs, PL-6.0mm = $249.65...
Tương tự XC: ct_before = blank → T.Giá = 0, chỉ tính setting fee
```

**Kết luận**: Web app không cần thêm `pricing_mode`. XC/PL hoạt động đúng
khi `weight_ct_before = 0` → `total_price = 0`. Setting fee vẫn tính bình thường.

---

## 5. DỮ LIỆU THỰC TẾ INVOICE CH1

```
Invoice: VNS01742 (ngày 05-08-2025)
Số items: 39 (items thực có data)
Total Qty: 39 pcs (mỗi item qty=1)
Total Weight: 376.78 gr
Total Gold Value: $39,414.56
Total T.Giá Xoàn: $5,661.64 (3.38 ct diamonds)
Total T.Phí nhận hột: $335.00
Total Labor (gia công): $16.00
Total HPUSA: $45,092.19

Metal breakdown:
  24K: $948.31 (9.049 gr) → 1 item (24KBL bracelet/bangle)
  18K: $38,466.25 (367.055 gr) → 38 items
  
Class values sử dụng:
  24K, 18MTG, DIAJE, DIAMT, 18KJE, LGRI, SILJE

Ghi chú (notes) pattern:
  "CH1-Khách" = hàng cho khách
  "CH1-SR" = hàng store receipt (store keep)
```

---

## 6. GAP ANALYSIS — Web App vs Excel Thực Tế

### ❌ GAP 1 — Không có Gold Rate Calculator [CRITICAL]

**Hiện tại:** User phải tự tính và nhập per-gram rates vào Metal Rates page.

**Thực tế:** User nhập spot price USD/oz từ Kitco.com → hệ thống Excel tự tính.

**Vấn đề:**
- Nếu user nhập DERIVED rate (đã có casting loss) VÀO daily_metal_rates, 
  mà `pricing_rules.casting_loss_pct ≠ 0` → DOUBLE-COUNT loss → SAI HPUSA
- User hiện nay không biết nên nhập spot hay derived

**Fix cần làm:**
```
Thêm "Gold Rate Calculator" trong Metal Rates admin page:
  Input: spot_24K (USD/oz), spot_PT, spot_AG, spot_PD
  Input: loss_gold (default 6%), loss_pt (default 17%)
  Output: per-gram rates cho tất cả karat (24K, 18K, 15K, 14K, 10K, PT, AG, PD)
  Button "Apply to Today's Rate" → lưu vào daily_metal_rates
  
Đặt casting_loss_pct = 0 trong pricing_rules khi dùng derived rates.
```

---

### ❌ GAP 2 — Không có Gem Price Catalog (NVL) [CRITICAL]

**Hiện tại:** User phải nhập tay `unit_price_per_ct` trong GemModal → error-prone, chậm.

**Thực tế:** Excel auto-lookup từ NVL-10 catalog dựa trên "Mã Xoàn" (size code).

**Catalog đầy đủ (từ NVL-10 sheet):**

| Loại | Codes | Phạm vi |
|------|-------|---------|
| RD (Round Diamond) | RD B1..B10 | 0.7mm → 4.9mm |
| PR (Princess) | PR1..PR5 | 1.0x1.0 → 3.7x3.7 |
| BG (Baguette) | BG0..BG8 | 0.005 → 0.35ct |
| MQ (Marquise) | MQ1..MQ7 | 0.005 → 0.39ct |
| PS (Pear Shape) | PS1..PS8 | 0.005 → 0.45ct |
| OV (Oval) | OV1..OV6 | 0.005 → 0.55ct |
| RDL (Round Lab Grown) | RDL1..RDL11 | 0.6mm → 4.0mm |
| BQT | BQT1 | |
| XC (Crystal/CZ) | XC1..XC7 | 9.5mm → 26mm |
| PL (Pearl) | PL-3.0..PL-15mm | |

**Fix cần làm:**
```sql
-- Tạo bảng gem_price_catalog (đã có trong gem_price_catalog.sql)
-- Nhưng cần seed đầy đủ data từ NVL-10 sheet
-- Và kết nối vào GemModal

CREATE TABLE gem_price_catalog (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gem_code    TEXT NOT NULL UNIQUE,   -- "RD B1", "BG0", "XC1 9.5mm"
  gem_type    TEXT NOT NULL,          -- "RD", "PR", "BG", "MQ", "PS", "OV", "RDL", "XC", "PL"
  size_label  TEXT,                   -- "RD1 0.7 - 2.0" (display value)
  size_key    TEXT NOT NULL UNIQUE,   -- MATCH key từ Excel col C NVL: "RD1 0.7 - 2.0"
  cost_price  NUMERIC(10,2),          -- Cost price
  mk_price    NUMERIC(10,2),          -- MK Price (dùng để tính T.Giá Xoàn)
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

**GemModal thay đổi:**
```
Thay trường "Unit Price ($/ct)" bằng:
  [Dropdown "Mã Xoàn"] → auto-fill price
  Hoặc: nhập giá tay nếu không có trong catalog
```

---

### ❌ GAP 3 — weight_ct_after vs weight_ct_before [MEDIUM]

**Hiện tại:** DB GENERATED columns dùng `weight_ct_after`:
```sql
weight_gr         GENERATED ALWAYS AS (weight_ct_after * 0.2)
total_price       GENERATED ALWAYS AS (weight_ct_after * unit_price_per_ct)
total_setting_fee GENERATED ALWAYS AS (qty_pcs * setting_fee_per_pcs)
```

**Thực tế:** 
- `weight_ct_after` (col Q) = LUÔN BLANK trong data thực
- Công thức Excel: `TL(gr) = weight_ct_before / 5`
- `T.Giá = weight_ct_before × price`

**Fix:**
```
GemModal: khi user nhập weight_ct_before, auto-copy vào weight_ct_after nếu ct_after trống
→ GENERATED cols vẫn dùng ct_after (không cần migration)
→ Add tooltip: "Wt After (ct) = dùng để tính TL(gr) và T.Giá. Thường = Wt Before."
```

---

### ❌ GAP 4 — weight_gold_actual_gr phải tự tính [MEDIUM]

**Hiện tại:** User phải nhập tay `weight_gold_actual_gr` trong form.

**Thực tế:** 
```
K = I - Σ gem.weight_gr   (tự tính, KHÔNG user nhập)
J = K   (cùng công thức)
→ weight_gold_actual = weight_total - Σ gem.weight_gr
```

**Fix:**
```
Khi user nhập weight_total_gr và/hoặc thêm/xóa gem:
→ Auto-compute: weight_gold_actual_gr = weight_total_gr - Σ gem.weight_gr
→ Hiển thị readonly (computed), cho phép override
```

---

### ❌ GAP 5 — Class dropdown chưa đúng [LOW]

**Hiện tại:** `class` là free-text input.

**Thực tế (từ invoice data):**
```
24K    = Sản phẩm vàng 24K (chain, bangle, bracelet)
18MTG  = 18K Metal (không đá, metal only)
DIAJE  = Diamond Jewelry (đồ trang sức có kim cương)
DIAMT  = Diamond Metal (?)
18KJE  = 18K Jewelry with stones
LGRI   = Lab Grown Ring (nhẫn đá tổng hợp)
SILJE  = Silver Jewelry (trang sức bạc)
```

**Fix:** Thêm dropdown với predefined values + "Other" freetext fallback.

---

### ❌ GAP 6 — Casting loss per-metal không đồng nhất [MEDIUM]

**Hiện tại:** `pricing_rules.casting_loss_pct` = 1 giá trị cho tất cả metals.

**Thực tế:**
- Gold (24K, 18K, etc.) = 6% casting loss
- Platinum = 17% casting loss
- Silver = 6% (gold loss) × 17% (PT loss)
- 24K = 0% (no casting loss in formula!)

**Fix:** Thêm per-metal loss vào Gold Rate Calculator UI. Lưu DERIVED rates vào DB.
Giữ `casting_loss_pct = 0` trong pricing_rules khi dùng derived rates.

---

### ✅ ĐÚNG — Không cần thay đổi

| Feature | Status |
|---------|--------|
| HPUSA formula | ✅ Khớp Excel |
| Setting fee = qty × fee_per_pcs | ✅ Khớp |
| CIF = HPUSA × multiplier | ✅ Khớp |
| Status workflow | ✅ OK |
| Role-based access | ✅ OK |
| JM Form 15-col view | ✅ OK |
| Import from JM FORM format | ✅ OK |
| Export to Excel | ✅ OK |
| Print layout | ✅ OK |
| XC/PL handling (ct=0 → price=0) | ✅ Tự nhiên xử lý đúng |

---

## 7. UPDATE PLAN — 4 SPRINTS

### Sprint A — Gold Rate Calculator (2-3 ngày)

**Mục tiêu:** User nhập spot price → rates tự tính → lưu vào daily_metal_rates.

**Files cần thay đổi:**
```
app/(dashboard)/admin/metal-rates/page.tsx
  → Thêm section "Rate Calculator" (có thể collapsible)
  → Input: Spot 24K, PT, AG, PD (USD/oz)
  → Input: Loss Gold (default 6%), Loss PT (default 17%)
  → Realtime display: per-gram rates cho 24K, 18K, 15K, 14K, 10K, PT, AG, PD
  → Button "Save as Today's Rate" → POST /api/metal-rates với derived values

components/admin/metal-rates/
  → Thêm GoldRateCalculator.tsx (collapsible panel)
  → Thêm RatePreviewTable.tsx (hiển thị computed rates realtime)
```

**Logic tính:**
```typescript
// lib/utils/goldRateCalculator.ts
export interface SpotPrices {
  gold_24k_oz: number    // USD per troy oz
  platinum_oz: number
  silver_oz:   number
  palladium_oz: number
}
export interface LossConfig {
  gold_loss_pct: number  // default 6
  pt_loss_pct:   number  // default 17
}

export function deriveDailyRates(spot: SpotPrices, loss: LossConfig): DailyMetalRate {
  const OZ_PER_GRAM = 31.103
  const gl = 1 + loss.gold_loss_pct / 100  // 1.06
  const pl = 1 + loss.pt_loss_pct / 100    // 1.17

  return {
    gold_24k:  spot.gold_24k_oz / OZ_PER_GRAM,                    // NO loss for 24K
    gold_18kw: spot.gold_24k_oz * (18/24) * gl / OZ_PER_GRAM,
    gold_18ky: spot.gold_24k_oz * (18/24) * gl / OZ_PER_GRAM,
    gold_14ky: spot.gold_24k_oz * (14/24) * gl / OZ_PER_GRAM,
    platinum:  spot.platinum_oz  * pl / OZ_PER_GRAM,
    silver:    spot.silver_oz    * gl / OZ_PER_GRAM * pl,          // both losses
    palladium: spot.palladium_oz * pl / OZ_PER_GRAM,
  }
}
// NOTE: pricing_rules.casting_loss_pct phải = 0 khi dùng derived rates
```

**UI Design:**
```
┌─────────────────────────────────────────────────────────┐
│ ▼ GOLD RATE CALCULATOR (từ giá Kitco.com)               │
├─────────────────────────────────────────────────────────┤
│ Ngày: [2026-06-03]   Spot Prices (USD / troy oz):       │
│ 24K: [4,100]  PT: [2,000]  AG: [60]  PD: [1,800]       │
│ Loss%: Gold [6]%   Platinum [17]%                        │
├─────────────────────────────────────────────────────────┤
│ DERIVED RATES (USD/gr):                                  │
│ 24K=$131.82  18K=$104.80  14K=$81.51  10K=$58.22        │
│ PT=$75.23    AG=$2.39     PD=$67.71                     │
├─────────────────────────────────────────────────────────┤
│         [Save as Today's Rate 2026-06-03]               │
└─────────────────────────────────────────────────────────┘
```

---

### Sprint B — Gem Price Catalog (2-3 ngày)

**Mục tiêu:** Tạo catalog NVL + GemModal auto-lookup giá.

**DB migration:**
```sql
-- Seed đầy đủ từ NVL-10 sheet (đã có gem_price_catalog.sql nhưng cần update)
-- gem_price_catalog: thêm cột size_key (MATCH key) và gem_type_group
```

**Seed data (đầy đủ từ Excel NVL-10):**
```sql
INSERT INTO gem_price_catalog (gem_type, size_key, size_label, cost_price, mk_price) VALUES
-- ROUND DIAMOND (Natural)
('RD', 'RD1 0.7 - 2.0',   'RD B1 (0.7-2.0mm)',   548.33, 630.58),
('RD', 'RD2 2.1 - 2.4',   'RD B2 (2.1-2.4mm)',   600.00, 690.00),
('RD', 'RD3 2.5 - 2.6',   'RD B3 (2.5-2.6mm)',   620.00, 713.00),
('RD', 'RD4 2.7 - 2.8',   'RD B4 (2.7-2.8mm)',   730.00, 839.50),
('RD', 'RD5 2.9 - 3.2',   'RD B5 (2.9-3.2mm)',   830.00, 954.50),
('RD', 'RD6 3.3 - 3.4',   'RD B6 (3.3-3.4mm)',   880.00, 1012.00),
('RD', 'RD7 3.5 - 3.6',   'RD B7 (3.5-3.6mm)',  1100.00, 1265.00),
('RD', 'RD8 3.7 - 3.9',   'RD B8 (3.7-3.9mm)',  1150.00, 1322.50),
('RD', 'RD9 4.0 - 4.4',   'RD B9 (4.0-4.4mm)',  1553.00, 1785.95),
-- PRINCESS
('PR', '1.0x1.0 - 1.8x 1.8', 'PR1 (1.0-1.8mm)', 500.00, 650.00),
('PR', '1.9x1.9 - 2.3x 2.3 ','PR2 (1.9-2.3mm)', 440.00, 572.00),
('PR', '2.4x 2.4 -2.8x 2.8 ','PR3 (2.4-2.8mm)', 650.00, 845.00),
('PR', '2.9x 2.9 - 3.4x 3.4 ','PR4 (2.9-3.4mm)',825.00, 1072.50),
('PR', '3.5x 3.5 - 3.7x 3.7 ','PR5 (3.5-3.7mm)',980.00, 1274.00),
-- BAGUETTE
('BG', 'BG 0.005 - 0.025',  'BG0 (0.005-0.025ct)', 680.00, 884.00),
('BG', 'BG1 0.03 - 0.05',   'BG1 (0.03-0.05ct)',   550.00, 715.00),
('BG', 'BG2 0.06 - 0.07',   'BG2 (0.06-0.07ct)',   650.00, 845.00),
('BG', 'BG3 0.08 - 0.09',   'BG3 (0.08-0.09ct)',   850.00, 1105.00),
('BG', 'BG4 0.10 - 0.16',   'BG4 (0.10-0.16ct)',  1150.00, 1495.00),
('BG', 'BG5 0.17 - 0.20',   'BG5 (0.17-0.20ct)',  1350.00, 1755.00),
('BG', 'BG7 0.26 - 0.28',   'BG7 (0.26-0.28ct)',  1750.00, 2275.00),
-- MARQUISE
('MQ', 'MQ1 0.005 - 0.10',  'MQ1 (0.005-0.10ct)',  800.00, 1040.00),
('MQ', 'MQ2 0.11 - 0.12',   'MQ2 (0.11-0.12ct)',   900.00, 1170.00),
('MQ', 'MQ3 0.13 - 0.17',   'MQ3 (0.13-0.17ct)',  1150.00, 1495.00),
-- PEAR SHAPE
('PS', 'PS1 0.005 - 0.12',  'PS1 (0.005-0.12ct)',  750.00, 975.00),
('PS', 'PS6 0.35 - 0.38',   'PS6 (0.35-0.38ct)',  1450.00, 1885.00),
-- OVAL
('OV', 'OV1 0.005 - 0.095', 'OV1 (0.005-0.095ct)', 650.00, 845.00),
-- ROUND LAB GROWN
('RDL','RDL1: 0.6-0.9',     'RDL1 (0.6-0.9mm)',    230.00, 299.00),
('RDL','RDL2: 1.0-1.1',     'RDL2 (1.0-1.1mm)',    168.00, 218.40),
('RDL','RDL3: 1.2-1.4',     'RDL3 (1.2-1.4mm)',    153.00, 198.90),
-- CRYSTAL (XC) — đá nhân tạo, chỉ setting fee
('XC', 'XC1 9.5mm',  'XC1 (9.5mm)',  10.00, 15.00),
('XC', 'XC2 11mm',   'XC2 (11mm)',   15.00, 22.50),
('XC', 'XC3 13mm',   'XC3 (13mm)',   15.00, 22.50),
('XC', 'XC4 15mm',   'XC4 (15mm)',   18.00, 27.00),
('XC', 'XC5 16mm',   'XC5 (16mm)',   18.00, 27.00),
('XC', 'XC6 20mm',   'XC6 (20mm)',   20.00, 30.00),
-- PEARL
('PL', 'PL-3.0mm',   'Pearl 3.0mm',  150.00, 172.50),
('PL', 'PL-6.0mm',   'Pearl 6.0mm',  217.09, 249.65),
('PL', 'PL-9.0mm',   'Pearl 9.0mm',  259.10, 297.97);
-- + full data từ NVL sheet
```

**GemModal changes:**
```typescript
// Thay trường unit_price_per_ct manual bằng:
// 1. Dropdown "Mã Xoàn" (grouped by gem_type)
// 2. Price auto-fills khi chọn
// 3. Vẫn cho phép nhập giá tay (editable)

interface GemCatalogEntry {
  size_key:  string   // "RD1 0.7 - 2.0"
  size_label: string  // "RD B1 (0.7-2.0mm)"
  gem_type:  string   // "RD"
  mk_price:  number   // 630.58
}

// In GemModal:
// Group dropdown by gem_type: "RD", "PR", "BG", "MQ", "PS", "OV", "RDL", "XC", "PL"
// On select: set size_mm = size_key, set unit_price_per_ct = mk_price
// Allow manual override of price

// API: GET /api/gem-catalog → returns grouped catalog
```

**New API route:**
```
GET /api/gem-catalog
  → SELECT * FROM gem_price_catalog WHERE is_active = true ORDER BY gem_type, size_key
  → Response: { success: true, data: GemCatalogEntry[] }
```

---

### Sprint C — Weight Auto-compute (1 ngày)

**Mục tiêu:** weight_gold_actual tự tính từ total - gem weights; ct_before auto-copy to ct_after.

**ItemCard / AddItemModal:**
```typescript
// Khi weight_total_gr thay đổi HOẶC gem list thay đổi:
const totalGemGr = gems.reduce((s, g) => s + (g.weight_gr ?? 0), 0)
const autoGoldActual = (weight_total_gr ?? 0) - totalGemGr

// Hiển thị: readonly computed field với note "= Total - Gem weight"
// Cho phép override: toggle "Override" → show editable input
```

**GemModal:**
```typescript
// Khi user nhập weight_ct_before:
// → auto-fill weight_ct_after nếu ct_after chưa có value
// → label: "Wt Before (ct) — nhập vào đây"
// → label: "Wt After (ct) — tự điền = Wt Before, override nếu khác"
```

---

### Sprint D — Class Dropdown & UX Polish (1 ngày)

**Mục tiêu:** Class dropdown chuẩn, UX improvements nhỏ.

**Class dropdown options:**
```typescript
const CLASS_OPTIONS = [
  { value: '24K',   label: '24K — Sản phẩm vàng 24K' },
  { value: '18MTG', label: '18MTG — 18K Metal Only' },
  { value: 'DIAJE', label: 'DIAJE — Diamond Jewelry' },
  { value: 'DIAMT', label: 'DIAMT — Diamond Metal' },
  { value: '18KJE', label: '18KJE — 18K Jewelry w/ Stones' },
  { value: 'LGRI',  label: 'LGRI — Lab Grown Ring' },
  { value: 'SILJE', label: 'SILJE — Silver Jewelry' },
  // + freetext fallback
]
```

**Additional UX improvements:**
- Add notes pattern examples: "CH1-Khách" (for customer), "CH1-SR" (store receipt)
- Notes field helper text: "VD: CH1-Khách, CH1-SR, Ba Sao"
- JM FORM: "Ghi chú" column tooltip explaining Ba Sao

---

## 8. DATABASE CHANGES

### Migration cần thêm

```sql
-- 1. gem_price_catalog (có thể đã tạo, cần seed đầy đủ)
CREATE TABLE IF NOT EXISTS gem_price_catalog (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gem_type    TEXT NOT NULL,      -- 'RD', 'PR', 'BG', 'MQ', 'PS', 'OV', 'RDL', 'XC', 'PL'
  size_key    TEXT NOT NULL UNIQUE, -- exact match key từ Excel col N
  size_label  TEXT,               -- display label
  cost_price  NUMERIC(10,2),      -- internal cost
  mk_price    NUMERIC(10,2),      -- MK price (= unit_price_per_ct khi select)
  is_active   BOOLEAN DEFAULT true,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON gem_price_catalog(gem_type);

-- 2. gold_rate_calculator_config (optional — lưu last-used spot prices)
-- Hoặc: không cần table, chỉ là UI utility
```

---

## 9. THỨ TỰ ƯU TIÊN

```
P1 (Critical — sửa ngay):
  ■ Sprint B: Gem Price Catalog + GemModal auto-lookup
    → Người dùng đang nhập giá tay, dễ nhập sai
    → Fix: dropdown + auto-fill từ NVL catalog

P2 (Important — sửa sớm):
  ■ Sprint A: Gold Rate Calculator
    → Người dùng có thể đang double-count casting loss
    → Fix: calculator + clear instructions

  ■ Sprint C: weight_gold_actual auto-compute
    → Hiện phải nhập 2 lần (total + gold actual = thường cùng giá trị)

P3 (Nice-to-have):
  ■ Sprint D: Class dropdown + UX polish
```

---

## 10. IMPACT ANALYSIS — Formulas bị ảnh hưởng

```
Nếu đang dùng derived rates (đã có loss) MÀ casting_loss_pct ≠ 0:
  → gold_value_usd = weight × derived_rate × 1.06 (SAI — double-counted)
  → HPUSA = wrong
  → CIF = wrong

Fix: Kiểm tra pricing_rules.casting_loss_pct trong DB:
  SELECT id, name, casting_loss_pct FROM pricing_rules;
  → Nếu > 0: cần quyết định dùng spot hay derived rates
  → Nếu = 0: đã đúng (đang dùng derived rates)

Sample calculation verify (từ file mẫu):
  Item 1: metal=18KW, weight_gold=111.745gr, rate=104.797
  gold_value = 111.745 × 104.797 = $11,710.54 ✓ (matches Excel H17)
  → Nếu thêm 6% loss: 11710.54 × 1.06 = $12,413 (sai ~5.8%)
```

---

## 11. KIỂM TRA SAU DEPLOY

```
Gold Calculator:
[ ] Nhập spot 24K=4100 → 18K hiển thị $104.80/gr
[ ] Save → metal_rates row tạo với giá đúng
[ ] Pricing rule casting_loss_pct = 0

Gem Catalog:
[ ] GemModal: dropdown grouped by RD/PR/BG/etc.
[ ] Chọn "RD1 0.7 - 2.0" → price = $630.58 auto-fills
[ ] Chọn XC1 → price = $15, nhưng ct_before=0 → T.Giá = 0
[ ] T.Giá Xoàn = ct_before × price (KHÔNG phải ct_after)

Weight auto-compute:
[ ] Thêm gem 0.025ct → weight_gold_actual tự trừ
[ ] Override button cho weight_gold_actual hoạt động

Invoice verify (item 1 từ file mẫu):
[ ] metal=18KW, total_wt=111.79, gem_ct=0.025ct (5 gems tổng)
[ ] gem_wt = 0.025+0.035+0.045+0.055+0.065 = 0.225ct × 0.2gr/ct = 0.045gr
[ ] weight_gold_actual = 111.79 - 0.045 = 111.745 ✓
[ ] gold_value = 111.745 × 104.797 = $11,710 ✓
[ ] T.Giá xoàn = 0.025×630.58 + 0.035×690 + ... = $180 (approx)
[ ] HPUSA = $11,710 + $180 + fees = ~$11,890 ✓
```
