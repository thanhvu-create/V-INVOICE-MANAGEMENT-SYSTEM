# Logic Flow — JM Form / SUMMARY
**File gốc:** `Copy of Copy of 0a) [Mẫu CH1] _ 1.....VNS0....._ IN-V(01.7.25)0p- CH1 (2).xlsx`
**Phân tích ngày:** 2026-06-09

---

## 0. Mô hình sử dụng thực tế (Usage Model)

### Cách dùng hiện tại

```
[Template file]
      │
      ▼  Copy cho mỗi đợt hàng
[Invoice file đợt N]  ──── lưu vào Google Drive (read-only sau khi xong)
[Invoice file đợt N+1]
[Invoice file đợt N+2]
...
```

- **Mỗi đợt hàng = 1 file Excel riêng** (~< 20 sản phẩm/file)
- File được copy từ đợt trước, **giá NVL (vàng + hột) giữ nguyên** từ đợt trước sang đợt sau
- Sau khi hoàn tất, file lưu lên Google Drive — **chỉ xem lại, không chỉnh sửa**

### Implications cho web app

| Khía cạnh | Excel hiện tại | Web app cần thiết kế |
|-----------|---------------|----------------------|
| Đơn vị dữ liệu | 1 file = 1 invoice/đợt | 1 `Invoice` record trong DB |
| Giá NVL | Nhúng trong mỗi file, copy từ đợt trước | Bảng `nvl_prices` dùng chung, **snapshot vào invoice** khi tạo mới |
| Lịch sử | Xem file cũ trên Drive | Invoice cũ = read-only sau khi `finalized` |
| Quy mô | < 20 SP/invoice | Không cần pagination phức tạp |

### Data model cơ bản

```
Invoice
  ├── id
  ├── invoice_code        (e.g. "P50801-CH1")
  ├── created_at
  ├── status              (draft | finalized)
  │
  ├── snapshot giá NVL tại thời điểm tạo:
  │     gold_price_24k, loss_gold, cif_rate,
  │     pt_price, ag_price, pd_price, loss_pt
  │
  └── products[]          (< 20 items)
        ├── Product
        │     ├── thông tin JM FORM (store, SO#, SKU#, description, ...)
        │     ├── thông tin SUMMARY (loại vàng, T.Phẩm, gia công, ...)
        │     └── diamonds[]   (tối đa 5 entries/product)
        │           └── Diamond (size, SL, TL trước/sau, đơn giá, ...)
        └── ...
```

> **Quy tắc giá:** Khi tạo invoice mới, copy giá từ invoice gần nhất (hoặc từ bảng master giá hiện hành).
> Sau khi `finalized`, giá được snapshot cố định — không bị ảnh hưởng bởi cập nhật giá sau này.

---

## 1. Luồng dữ liệu tổng quan

```
[NVL - Vàng]          [NVL- Hột]
  Giá vàng/gram          Giá xoàn/ct
  Loss (6%)              theo Size
  CIF (10%)                  │
       │                     │
       └──────────┬──────────┘
                  ▼
            [SUMMARY]
         Tính toán & xử lý
                  │
         ┌────────┴────────┐
         ▼                 ▼
    (đọc input từ)    (ghi output ra)
     [JM FORM]         [JM FORM]
    nhập đầu vào     Purchase & CIF price
```

---

## 2. Sheet tham chiếu

### NVL - Vàng (A1:G13)

| Ô | Nội dung |
|---|---------|
| D2 | Giá thị trường 24K ($/oz) — nhập thủ công |
| E2 | Giá Platinum ($/oz) |
| F2 | Giá Silver ($/oz) |
| G2 | Giá Palladium ($/oz) |
| C3 | Ounce per gram = 31.103 |
| F3 | Loss vàng = 6% |
| F8 | **CIF = 10%** — dùng cho công thức CIF price ở JM FORM |
| C4 | 24K price/gram = `D2 / C3` |
| C6 | 22K price/gram = `D2 × (22/24) / C3` |
| C7 | 18K price/gram = `D2 × 1.06 × (18/24) / C3` |
| C8 | 15K price/gram = `D2 × 1.06 × (15/24) / C3` |
| C9 | 14K price/gram = `D2 × 1.06 × (14/24) / C3` |
| C10 | 10K price/gram = `D2 × 1.06 × (10/24) / C3` |
| C11 | PT price/gram = `E2 × 1.17 / C3` |
| C12 | AG price/gram = `F2 × 1.06 / C3 × 1.17` |
| C13 | PD price/gram = `G2 × 1.17 / C3` |

### NVL- Hột (A1:G82)

Bảng giá xoàn theo loại và size. Cột quan trọng:

| Cột | Nội dung |
|-----|---------|
| A | Loại đá (RD, PR, BG, ...) |
| C | Size range (e.g. `RD1 0.7 - 2.0`) |
| D | Cost price ($/ct) |
| E | MK price = `D × (1 + markup%)` — đây là giá dùng trong SUMMARY |

---

## 3. JM FORM — Nhập liệu đầu vào

### 3.1 Cấu trúc header (hàng 2–3)

| Cột | Tên | Loại |
|-----|-----|------|
| A | NO | Auto = `ROW()-3` |
| B | Store | Thủ công |
| C | Location in Store | Thủ công |
| D | Vendor model# | Thủ công |
| E | SO# & MO# | Thủ công |
| F | SKU# new | Thủ công |
| G | Class | Thủ công |
| H | Sub class | Thủ công |
| I | Description | Thủ công |
| J | Qt. (pcs) | **Auto ← kéo từ `SUMMARY!E`** |
| K | Wt. (gr) | Thủ công |
| L | HP for Purchase price | **Auto ← `SUMMARY!AB`** |
| M | HP for CIF price | **Auto = `L × (1 + SUMMARY!F8)`** |
| N | ERP for Bom cost ($) | Nhập thủ công |
| O | Chênh lệch | Auto = `(L - N) / L` |
| P | HP for Tag price | Thủ công |
| Q | HP for FB price | Thủ công |
| R | Ghi chú | Thủ công |

> **Lưu ý:** `Qt. (pcs)` [J] hiển thị giá trị từ SUMMARY, **không phải ô nhập liệu**.
> Số lượng thực sự được nhập tại **SUMMARY cột E**.

---

## 4. SUMMARY — Cấu trúc và tính toán

### 4.1 Vùng tham số (hàng 1–13)
Các ô tham số của SUMMARY **mirror** hoàn toàn sheet NVL - Vàng (cùng công thức, cùng layout).

### 4.2 Header cột dữ liệu (hàng 15–16)

| Cột | Tên (hàng 16) | Nhóm |
|-----|--------------|------|
| A | STT | Thông tin SP |
| B | HÌNH ẢNH | Thông tin SP |
| C | SO/MO | Thông tin SP |
| D | Kích Thước | Thông tin SP |
| E | Số lượng | Thông tin SP |
| F | Mã số mẫu | Thông tin SP |
| G | Loại vàng | Thông tin SP |
| H | Tiền vàng ($) | Thông tin vàng |
| I | T.Phẩm (có NVL đá) | Thông tin vàng |
| J | T.Phẩm (trừ NVL đá) | Thông tin vàng |
| K | T.Phẩm (vàng thực tế) | Thông tin vàng |
| L | Mã Xoàn | Thông tin xoàn |
| M | P. chất | Thông tin xoàn |
| N | Size Xoàn | Thông tin xoàn |
| O | SL hột | Thông tin xoàn |
| P | TL (ct.) trước xử lý | Thông tin xoàn |
| Q | TL (ct.) sau xử lý | Thông tin xoàn |
| R | TL Xoàn (gr) | Thông tin xoàn |
| S | Đơn giá ($) | Thông tin xoàn |
| T | T.GIÁ XOÀN | Thông tin xoàn |
| U | Đơn giá (phí nhận hột) | Thông tin xoàn |
| V | T.Phí | Thông tin xoàn |
| W | Gia công / 1 SP | Gia công |
| X | Đúc / 1sp | Gia công |
| Y | Thiết Kế / 1sp | Gia công |
| Z | Resin / 1sp | Gia công |
| AA | Phí phụ kiện (mua bên ngoài) | Gia công |
| AB | Vốn sản xuất | Tổng hợp |
| AC | Bảo hiểm | Ghi chú |
| AD | Ngày gửi | Ghi chú |
| AE | Tracking# gửi hàng USA | Ghi chú |
| AF | Hóa Đơn (V-INVOICE) | Ghi chú |

### 4.3 Cấu trúc dòng dữ liệu

Mỗi sản phẩm chiếm **1 block 5 dòng liên tiếp** (ví dụ: hàng 17–21 cho SP1, 22–26 cho SP2,...).
Dòng đầu của block chứa thông tin sản phẩm + dòng 1 của xoàn.
4 dòng còn lại chỉ chứa thêm thông tin xoàn (size khác nhau).

```
Hàng 17  ← dòng chính SP1: STT, SO/MO, Loại vàng, T.Phẩm, Vốn sản xuất + xoàn size 1
Hàng 18  ← xoàn size 2
Hàng 19  ← xoàn size 3
Hàng 20  ← xoàn size 4
Hàng 21  ← xoàn size 5
Hàng 22  ← dòng chính SP2
...
```

---

## 5. Pipeline nhập liệu — từng bước

### Bước 1 — Nhập JM FORM

Người dùng nhập các cột: `B, C, D, E, F, G, H, I, K`

### Bước 2 — SUMMARY tự cập nhật từ JM FORM

| Cột SUMMARY | Công thức | Nguồn |
|-------------|-----------|-------|
| C (SO/MO) | `= 'JM FORM'!E{row}` | SO# & MO# |
| F (Mã số mẫu) | `= 'JM FORM'!D{row}` | Vendor model# |

### Bước 3 — Nhập thủ công tại SUMMARY

| Cột | Tên | Ghi chú |
|-----|-----|---------|
| B | HÌNH ẢNH | |
| D | Kích Thước | Nhập thủ công, không auto từ Description |
| E | Số lượng | Nhập ở đây — JM FORM J kéo ngược lại |
| G | Loại vàng | `18KW`, `24K`, `22K`, `PT`, `AG`, `PD` |
| I | T.Phẩm (có NVL đá) | Tổng trọng lượng kể cả đá (gr) |

### Bước 4 — Tiền vàng tự tính

Sau khi có **G** (Loại vàng) và **I** (T.Phẩm), cột **H** tự tính:

```
Tiền vàng [H] = GiáVàng/gram × T.Phẩm vàng thực tế [K]

Trong đó GiáVàng/gram tra theo Loại vàng [G]:
  24K  → SUMMARY!C4  = D2 / 31.103
  22K  → SUMMARY!C6  = D2 × (22/24) / 31.103
  18K  → SUMMARY!C7  = D2 × 1.06 × (18/24) / 31.103
  15K  → SUMMARY!C8
  14K  → SUMMARY!C9
  10K  → SUMMARY!C10
  PT   → SUMMARY!C11
  AG   → SUMMARY!C12
  PD   → SUMMARY!C13
```

> Tiền vàng tự cập nhật khi nhập hột vì K = I − tổng TL xoàn (gr).

### Bước 5 — Nhập thông tin hột (tối đa 5 dòng/SP)

| Cột | Tên | Loại | Ghi chú |
|-----|-----|------|---------|
| L | Mã Xoàn | Thủ công | |
| M | P. chất | Thủ công | |
| N | Size Xoàn | Thủ công | Chọn dropdown từ NVL-Hột cột C |
| O | SL hột | Thủ công | |
| P | TL (ct.) trước xử lý | Thủ công | |
| Q | TL (ct.) sau xử lý | Thủ công | Hiện chưa dùng trong công thức |
| R | TL Xoàn (gr) | **Auto** | `= P / 5` (trước xử lý ÷ 5) |
| S | Đơn giá ($) | **Auto** | VLOOKUP từ NVL-Hột theo Size N |
| T | T.GIÁ XOÀN | **Auto** | `= P × S` |
| U | Đơn giá phí nhận hột | **Auto** | Cố định = 1$ |
| V | T.Phí | **Auto** | `= U × O` = SL hột × 1$ |

**Công thức S (Đơn giá) chi tiết:**
```
S = IF(N = "", "", IFERROR(INDEX(NVL-Hột!E3:E82, MATCH(N, NVL-Hột!C3:C82, 0)), ""))
```
> ⚠️ Khi N trống, S trả về `""` (chuỗi rỗng) — xem Case B phần 6.

### Bước 6 — T.Phẩm cập nhật theo hột

```
T.Phẩm (trừ NVL đá) [J] = I − SUBTOTAL(109, R_dòng1 : R_dòng5)
T.Phẩm (vàng thực tế) [K] = I − SUBTOTAL(109, R_dòng1 : R_dòng5)
```

> J và K có **cùng công thức**, cho cùng giá trị.

### Bước 7 — Nhập gia công (thủ công)

`W` Gia công, `X` Đúc, `Y` Thiết Kế, `Z` Resin, `AA` Phí phụ kiện

### Bước 8 — Vốn sản xuất tự tính [AB]

```
Vốn sản xuất =
    SUBTOTAL(109, T_dòng1:T_dòng5)   ← Tổng T.GIÁ XOÀN
  + SUBTOTAL(109, V_dòng1:V_dòng5)   ← Tổng T.Phí
  + H                                 ← Tiền vàng
  + W                                 ← Gia công / 1 SP
  + X                                 ← Đúc / 1sp
  + Y                                 ← Thiết Kế / 1sp
  + Z                                 ← Resin / 1sp
  + AA                                ← Phí phụ kiện
```

### Bước 9 — Nhập thủ công ghi chú vận chuyển

`AC` Bảo hiểm, `AD` Ngày gửi, `AE` Tracking#, `AF` Hóa Đơn (V-INVOICE)

### Bước 10 — JM FORM nhận giá cuối (auto)

```
HP for Purchase price [L] = SUMMARY!AB  (Vốn sản xuất)
HP for CIF price      [M] = L × (1 + 10%)
```

---

## 6. Các case đặc biệt

### Case A — Sản phẩm CÓ hột (bình thường)

```
Input:  I > 0, G = loại vàng, N/O/P = thông tin hột
        (tối đa 5 dòng size xoàn khác nhau)

Tính:
  R = P / 5                     ✅
  S = lookup đơn giá theo N     ✅
  T = P × S                     ✅
  V = 1 × O                     ✅
  J = K = I − Σ(R)              ✅
  H = giá/gram × K              ✅ (tự cập nhật khi thêm hột)
  AB = ΣT + ΣV + H + W+X+Y+Z+AA ✅
  JM FORM L = AB                ✅
  JM FORM M = AB × 1.1          ✅
```

---

### Case B — Sản phẩm KHÔNG CÓ hột

```
Input:  I > 0, G = loại vàng, bỏ trống toàn bộ N/O/P

Tính:
  R = 0                         ✅
  S = "" (chuỗi rỗng)           ⚠️ (nên trả về 0)
  T = P × "" = #VALUE!          ❌ LỖI
  SUBTOTAL(109, T range) = #VALUE! ❌ LỖI
  AB = #VALUE!                  ❌ LỖI
  JM FORM L, M = #VALUE!        ❌ LỖI

  J = K = I − 0 = I             ✅ (đúng nếu không bị lỗi lan)
  H = giá/gram × I              ✅

FIX:
  Đổi công thức S từ:
    IF(N="", "",  IFERROR(..., ""))
  thành:
    IF(N="", 0, IFERROR(..., 0))
```

---

## 7. Các điểm cần xác nhận

| # | Câu hỏi | Trả lời |
|---|---------|---------|
| 1 | `Qt. (pcs)` ở JM FORM kéo từ SUMMARY — số lượng nhập tại SUMMARY cột E? | ☐ Đúng / ☐ Sai |
| 2 | `Mã số mẫu` = Vendor model# (cột D JM FORM), không extract từ Description? | ☐ Đúng / ☐ Sai |
| 3 | `Kích Thước` nhập thủ công tại SUMMARY, không auto từ Description? | ☐ Đúng / ☐ Sai |
| 4 | `TL Xoàn (gr)` = TL **trước** xử lý / 5 (không phải sau xử lý)? | ☐ Đúng / ☐ Sai |
| 5 | `T.Phí` = SL hột × 1$ (tự động, không nhập thủ công)? | ☐ Đúng / ☐ Sai |
| 6 | Cột Q (TL sau xử lý ct.) chưa dùng trong công thức — có cần dùng không? | ☐ Cần / ☐ Không |
| 7 | J và K có cùng công thức — có cần khác nhau không? | ☐ Giữ nguyên / ☐ Cần khác |
| 8 | `Tiền vàng [H]` được cộng vào Vốn sản xuất — đúng ý định không? | ☐ Đúng / ☐ Sai |
| 9 | Case không có hột bị lỗi `#VALUE!` — cần sửa công thức S về `0`? | ☐ Sửa / ☐ Giữ nguyên |

---

## 8. So sánh 5 Template

### Phân loại theo tầng và kênh

| Template | Tầng | Kênh | File đại diện |
|----------|------|------|--------------|
| **CH1** | Lầu 2 | CH1 Khách, CH1 SR | `20179...CH1` |
| **CH2** | Lầu 2 | CH2, CH3 | `20178...CH2` |
| **ADM** | Lầu 2 | CH1 ADM1, CH1 ADM2 | `20184...ADM` |
| **CH1 AG3** | Lầu 3 | CH1, CH2, CH3 | `20185...CH1[AG3]` |
| **VNSI AG3** | Lầu 3 | Kênh sỉ | `20128...VNSI[AG3]` |

---

### 8.1 Bảng so sánh tổng quan

| Đặc điểm | CH1 (Lầu 2) | CH2 (Lầu 2) | ADM (Lầu 2) | CH1 AG3 (Lầu 3) | VNSI AG3 (Lầu 3) |
|----------|:-----------:|:-----------:|:-----------:|:---------------:|:----------------:|
| Sheet NVL riêng | ✅ NVL-10 | ✅ NVL + NVL-10 | ✅ NVL-10 | ❌ (embedded) | ❌ (embedded) |
| Có section Xoàn | ✅ | ✅ | ✅ | ❌ | ❌ |
| Dòng/SP (block size) | 5 | **10** | 5 | 1 | 1 |
| Gia công W/X/Y/Z/AA | ✅ | ✅ | ❌ (gộp) | ❌ | ❌ |
| Cột CIF trong JM FORM | ✅ (cột M) | ❌ | ✅ (cột M) | ✅ (cột N) | ✅ (cột M) |
| Tỉ lệ CIF | 5% hardcode | Không có | 5% hardcode | 5% từ SUMMARY | 10% từ SUMMARY |
| Giá/1sp (per unit) | ❌ | ❌ | ❌ | ✅ | ✅ |
| 2 cột SKU | ❌ | ❌ | ❌ | ✅ (AG + USA) | ❌ |
| Dòng dịch tiếng Trung | ✅ | ✅ | ✅ | ✅ | ✅ |

---

### 8.2 Chi tiết từng template

---

#### Template CH1 (Lầu 2) — CH1 Khách & CH1 SR

```
NVL:        10) Bảng giá NVL-10
Block:      5 dòng/SP  (dòng chính + 4 dòng xoàn phụ)
Von SX:     SUMMARY!AB  (= ΣT.GIÁ XOÀN + ΣT.Phí + Tiền vàng + W+X+Y+Z+AA)
Purchase:   JM FORM L = SUMMARY!AB
CIF:        JM FORM M = L × 1.05  (5%, hardcode không qua SUMMARY)
ERP:        JM FORM N = nhập thủ công
Chênh lệch: JM FORM O = (L - N) / L
```

**JM FORM columns:** No, Store, Location, Vendor model#, SO# & MO#, SKU JM mới, Class, Sub class, Description, Qt.(pcs), Wt.(gr), Purchase price, CIF price, ERP cost, Chênh lệch, Tag price, FB price, Ghi chú

**SUMMARY columns đặc trưng:**
- Gia công đầy đủ: W (Gia công), X (Đúc), Y (Thiết Kế), Z (Resin), AA (Phụ kiện)
- Vốn sản xuất [AB] = ΣT.GIÁ XOÀN + ΣT.Phí + H + W + X + Y + Z + AA
- Ghi chú vận chuyển: AC (Bảo hiểm), AD (Ngày gửi), AE (Tracking#), AF (V-INVOICE)

---

#### Template CH2 (Lầu 2) — CH2 & CH3

```
NVL:        10) Bảng giá NVL  +  10) Bảng giá NVL-10  (2 sheets NVL)
Block:      10 dòng/SP  (dòng chính + 9 dòng xoàn phụ)
Von SX:     SUMMARY!AB  (= ΣT17:T26 + ΣV17:V26 + H + W + X + Y + Z + AA)
Purchase:   JM FORM L = SUMMARY!AB
CIF:        KHÔNG CÓ cột CIF trong JM FORM
Tag price:  JM FORM M
FB price:   JM FORM N
```

**JM FORM columns:** No, Store, Location, Vendor model#, SO# & MO#, SKU# new, Class, Sub class, Description, Qt.(pcs), Wt.(gr), Purchase price, Tag price, FB price, Ghi chú

> **Khác biệt quan trọng:** Block xoàn lớn hơn gấp đôi (10 dòng vs 5 dòng). Không có cột CIF price và ERP.

---

#### Template ADM (Lầu 2) — CH1 ADM1 & CH1 ADM2

```
NVL:        10) Bảng giá NVL-10
Block:      5 dòng/SP
Von SX:     SUMMARY!W  (công thức đơn giản hơn: chỉ ΣT + ΣV + H, không có Gia công riêng)
CIF SUMMARY: SUMMARY!X  = W × (1 + 10%)  ← CIF tính trong SUMMARY
Purchase:   JM FORM L = SUMMARY!W
CIF JM:     JM FORM M = L × 1.05  (5%, dùng JM FORM riêng, không dùng SUMMARY!X)
```

**SUMMARY columns đặc trưng:**
- Không có gia công riêng lẻ (W, X, Y, Z, AA)
- W (Vốn sản xuất) = ΣT.GIÁ XOÀN + ΣT.Phí + Tiền vàng ← **không cộng gia công**
- X (CIF) = W × 1.1

> **Khác biệt quan trọng:** ADM bỏ các cột gia công riêng (Đúc, Thiết Kế, Resin, Phụ kiện). Vốn sản xuất đơn giản hơn — chỉ tính nguyên vật liệu (vàng + xoàn).

---

#### Template CH1 AG3 (Lầu 3) — CH1, CH2, CH3

```
NVL:        Embedded trong SUMMARY (không có sheet NVL riêng)
Block:      1 dòng chính/SP  (không có section xoàn)
Xoàn:       KHÔNG CÓ
Trị giá:    SUMMARY!J = H  (Trị giá = Tiền vàng, không có chi phí khác)
Purchase:   JM FORM M = SUMMARY!J
CIF:        JM FORM N = M × (1 + 5%)  — tham chiếu SUMMARY!G7 = 0.05
```

**NVL giá vàng (embedded trong SUMMARY):**
- Giá 24K / PT / AG / PD ở D2/E2/F2/G2 (thứ tự cột KHÁC với Lầu 2)
- Loss 14K/18K: G3 = 0.11 (11%, khác Lầu 2 dùng 6%)
- Loss PT: G11 = 0.17
- CIF: G7 = 0.05 (5%)

**JM FORM columns đặc trưng:**
- F2: SKU# AG (mã sản phẩm phía AG/Việt Nam)
- G2: SKU# USA (mã sản phẩm phía Mỹ)
- E2: PO# (thay vì SO# & MO#)
- Q2-T3: Các cột tính Giá/1sp và Trọng lượng/1sp (per unit)

**SUMMARY cấu trúc sản phẩm:**
```
Hàng 17-18: Headers
Hàng 19:    Dòng dịch tiếng Trung
Hàng 20:    Dòng chính SP1 (CH1-Khách)
Hàng 21:    Sub-row SP1 cho kênh CH1-SR (nếu có)
Hàng 22-23: (trống hoặc sub-channel)
Hàng 23:    Dòng tổng nếu có nhiều sub-row
```

> **Khác biệt quan trọng:** Không có xoàn, không có gia công chi tiết. Trị giá = Tiền vàng. Loss vàng 11% (cao hơn Lầu 2 do thị trường AG khác).

---

#### Template VNSI AG3 (Lầu 3) — Kênh Sỉ

```
NVL:        Embedded trong SUMMARY (không có sheet NVL riêng)
Block:      ~3 dòng/SP  (1 dòng chính + 2 dòng trống/sub)
Xoàn:       KHÔNG CÓ
Trị giá:    SUMMARY!J = H  (Trị giá = Tiền vàng)
Purchase:   JM FORM L = SUMMARY!J
CIF:        JM FORM M = L × (1 + 10%)  — SUMMARY!G7 = 0.10
```

**NVL giá vàng:** Cùng cấu trúc CH1 AG3 nhưng:
- Loss vàng: G3 = 0.11
- CIF: G7 = **0.10** (10%, khác CH1 AG3 là 5%)

**JM FORM columns đặc trưng:**
- P2-S3: Các cột Giá/1sp (per-unit pricing)
- T2: Chi tiết/1sp
- Không có cột SKU AG riêng

> **Khác biệt quan trọng so với CH1 AG3:** CIF 10% thay vì 5%. Cấu trúc tương tự nhưng không có 2 cột SKU.

---

### 8.3 Sơ đồ phân cấp template

```
SP Lầu 2 ─────────────────────────────────────────────────────
  │  NVL: sheet "10) Bảng giá NVL-10"  (dùng chung)
  │  Có section Xoàn, có gia công chi tiết
  │
  ├── CH1 (Khách + SR)    Block 5 dòng | CIF 5% | Vốn SX = SUMMARY!AB
  ├── CH2 / CH3           Block 10 dòng | Không CIF | Vốn SX = SUMMARY!AB
  └── ADM1 / ADM2         Block 5 dòng | CIF 5% | Vốn SX = SUMMARY!W (đơn giản)

SP Lầu 3 ─────────────────────────────────────────────────────
  │  NVL: Embedded trong SUMMARY  (loss 11%, không có sheet riêng)
  │  KHÔNG có Xoàn, KHÔNG có gia công chi tiết
  │  Trị giá = Tiền vàng
  │
  ├── CH1 AG3 (CH1/CH2/CH3)   CIF 5% | 2 cột SKU (AG + USA)
  └── VNSI AG3 (Kênh Sỉ)      CIF 10% | Giá/1sp per unit
```

---

### 8.4 Mapping Purchase price → JM FORM

| Template | Nguồn Purchase price | Công thức CIF |
|----------|---------------------|---------------|
| CH1 | `SUMMARY!AB` | `L × 1.05` |
| CH2 | `SUMMARY!AB` | Không có cột CIF |
| ADM | `SUMMARY!W` | `L × 1.05` |
| CH1 AG3 | `SUMMARY!J` | `M × (1 + SUMMARY!G7)` = M × 1.05 |
| VNSI AG3 | `SUMMARY!J` | `L × (1 + SUMMARY!G7)` = L × 1.10 |

---

## 9. Lookup xoàn từ file THEO DÕI XOÀN (CH1, CH2, ADM)

> Áp dụng cho 3 template có section xoàn: **CH1, CH2, ADM**

---

### 9.1 File nguồn

**File:** `TỔNG HỢP THEO DÕI XOÀN 2026 (để lấy chi tiết hột).xlsx`
**Sheet:** `Copy of Copy of Dữ liệu 2026`
**Kích thước:** ~4000+ dòng (A1:O4141)

| Cột | Tên | Mô tả |
|-----|-----|-------|
| A | STT | Số thứ tự |
| B | Ngày | Ngày xuất/nhập |
| C | Số CT | Số chứng từ |
| D | SO | Sales Order number |
| E | **MO** | **Manufacturing Order number** ← khóa lookup |
| F | = G & " " & H | Mã xoàn + Size (combined) |
| G | **Mã xoàn** | Ví dụ: `RD-11119-2.1`, `PR-L13`, `BG-L14` |
| H | **Size** | Kích thước thực tế (mm hoặc ct tuỳ loại) |
| I | **Số lượng** | Số viên hột |
| J | Trọng lượng | Tổng TL (ct) |
| K | Thợ | Tên thợ xử lý |
| L | **TB viên** | Trọng lượng trung bình/viên = J ÷ I (ct) |
| M | **Trạng thái** | `Xuất` hoặc `Nhập` ← **bộ lọc** |
| N | Ghi chú | Mã chất lượng (L, X, C, ...) |
| O | (phụ) | Loại đá phụ |

---

### 9.2 Điều kiện lookup

```
Lookup theo:   E (MO) = MO của sản phẩm trong SUMMARY
Filter:        M (Trạng thái) = "Xuất"
Kết quả:       Có thể nhiều dòng khớp → mỗi dòng = 1 sub-row xoàn trong SUMMARY
```

**Cách trích MO từ SUMMARY:**
- SUMMARY cột C (SO/MO) = `"SO26.10628-MO26.36160"` (kéo từ JM FORM cột E)
- Cần extract phần sau `"MO"`: → `26.36160`
- Regex: `/MO([\d.]+)/`

**Lưu ý:** Một MO có thể có **nhiều dòng** trong tracking (nhiều loại/size xoàn khác nhau cho cùng 1 sản phẩm). Mỗi dòng khớp → điền vào 1 sub-row trong block 5 dòng (CH1/ADM) hoặc 10 dòng (CH2) của sản phẩm đó.

---

### 9.3 Mapping dữ liệu auto-fill vào SUMMARY

| Tracking (nguồn) | → | SUMMARY (đích) | Ghi chú |
|---|---|---|---|
| G: Mã xoàn | → | L: Mã Xoàn | Copy trực tiếp |
| *(cố định)* | → | M: P. chất | Luôn = `"VVS1"` |
| H + L: Size mapping | → | N: Size Xoàn | Xem logic bảng 9.4 |
| I: Số lượng | → | O: SL hột | Copy trực tiếp |
| L: TB viên | → | Q: TL sau xử lý (ct.) | Copy trực tiếp |

> **Các cột còn lại tự tính sau khi fill:**
> - R (TL Xoàn gr) = P / 5 ← P vẫn nhập thủ công (TL trước xử lý)
> - S (Đơn giá) = lookup từ NVL-Hột theo N (Size Xoàn range)
> - T (T.GIÁ XOÀN) = P × S
> - V (T.Phí) = U × O = 1 × SL

---

### 9.4 Logic mapping Size → Range NVL-Hột

Size trong tracking file (cột H) có 2 dạng:
- **mm** (dạng `"2.1"` hoặc `"2.3*2.3"`) — dùng cho RD, RD-LG, PR
- **ct** — dùng TB viên (cột L) — dùng cho BG, MQ, PS, OV và các loại khác

#### Bảng mapping theo loại đá

**RD (Round Diamond) — dùng H (mm đường kính):**

| H (mm) | → Size Xoàn range (N) |
|--------|----------------------|
| 0.7 – 2.0 | `RD1 0.7 - 2.0` |
| 2.1 – 2.4 | `RD2 2.1 - 2.4` |
| 2.5 – 2.6 | `RD3 2.5 - 2.6` |
| 2.7 – 2.8 | `RD4 2.7 - 2.8` |
| 2.9 – 3.2 | `RD5 2.9 - 3.2` |
| 3.3 – 3.4 | `RD6 3.3 - 3.4` |
| 3.5 – 3.6 | `RD7 3.5 - 3.6` |
| 3.7 – 3.9 | `RD8 3.7 - 3.9` |
| 4.0 – 4.4 | `RD9 4.0 - 4.4` |
| 4.5 – 5.0 | `RD9 4.5 - 5.0` |

**RD-LG (Lab Grown RD) — dùng H (mm đường kính):**

| H (mm) | → Size Xoàn range (N) |
|--------|----------------------|
| 0.6 – 0.9 | `RDL1: 0.6-0.9` |
| 1.0 – 1.1 | `RDL2: 1.0-1.1` |
| 1.2 – 1.4 | `RDL3: 1.2-1.4` |
| 1.5 – 1.6 | `RDL4: 1.5-1.6` |
| 1.7 – 2.0 | `RDL5: 1.7-2.0` |
| 2.1 – 2.3 | `RDL6: 2.1-2.3` |
| 2.4 – 2.7 | `RDL7: 2.4-2.7` |
| 2.8 – 3.0 | `RDL8: 2.8-3.0` |
| 2.9 – 3.4 | `RDL9: 2.9-3.4` |
| 3.5 – 3.6 | `RDL10: 3.5-3.6` |
| 3.7 – 4.0 | `RDL11: 3.7-4.0` |

**PR (Princess) — dùng H (mm, dạng `"W*W"`), lấy chiều đầu tiên:**

| H (mm) | → Size Xoàn range (N) |
|--------|----------------------|
| 1.0 – 1.8 | `1.0x1.0 - 1.8x 1.8` |
| 1.9 – 2.3 | `1.9x1.9 - 2.3x 2.3` |
| 2.4 – 2.8 | `2.4x 2.4 -2.8x 2.8` |
| 2.9 – 3.4 | `2.9x 2.9 - 3.4x 3.4` |
| 3.5 – 3.7 | `3.5x 3.5 - 3.7x 3.7` |

**BG (Baguette) — dùng L (TB viên, ct):**

| L (ct/viên) | → Size Xoàn range (N) |
|-------------|----------------------|
| 0.005 – 0.025 | `BG 0.005 - 0.025` |
| 0.03 – 0.05 | `BG1 0.03 - 0.05` |
| 0.06 – 0.07 | `BG2 0.06 - 0.07` |
| 0.08 – 0.09 | `BG3 0.08 - 0.09` |
| 0.10 – 0.16 | `BG4 0.10 - 0.16` |
| 0.17 – 0.20 | `BG5 0.17 - 0.20` |
| 0.21 – 0.25 | `BG6 0.21 - 0.25` |
| 0.26 – 0.28 | `BG7 0.26 - 0.28` |
| 0.29 – 0.35 | `BG8 0.29 - 0.35` |

**MQ (Marquise) — dùng L (TB viên, ct):**

| L (ct/viên) | → Size Xoàn range (N) |
|-------------|----------------------|
| 0.005 – 0.10 | `MQ1 0.005 - 0.10` |
| 0.11 – 0.12 | `MQ2 0.11 - 0.12` |
| 0.13 – 0.17 | `MQ3 0.13 - 0.17` |
| 0.18 – 0.24 | `MQ4 0.18 - 0.24` |
| 0.25 – 0.29 | `MQ5 0.25 - 0.29` |
| 0.30 – 0.36 | `MQ6 0.30 - 0.36` |
| 0.37 – 0.39 | `MQ7 0.37 - 0.39` |

**PS (Pear Shape) — dùng L (TB viên, ct):**

| L (ct/viên) | → Size Xoàn range (N) |
|-------------|----------------------|
| 0.005 – 0.12 | `PS1 0.005 - 0.12` |
| 0.12 – 0.17 | `PS2 0.12 - 0.17` |
| 0.18 – 0.25 | `PS3 0.18 - 0.25` |
| 0.26 – 0.29 | `PS4 0.26 - 0.29` |
| 0.30 – 0.34 | `PS5 0.30 - 0.34` |
| 0.35 – 0.38 | `PS6 0.35 - 0.38` |
| 0.39 – 0.40 | `PS7 0.39 - 0.40` |
| 0.41 – 0.45 | `PS8 0.41 - 0.45` |

**OV (Oval) — dùng L (TB viên, ct):**

| L (ct/viên) | → Size Xoàn range (N) |
|-------------|----------------------|
| 0.005 – 0.095 | `OV1 0.005 - 0.095` |
| 0.10 – 0.14 | `OV2 0.10 - 0.14` |
| 0.15 – 0.25 | `OV3 0.15 - 0.25` |
| 0.30 – 0.35 | `OV4 0.30 - 0.35` |
| 0.40 – 0.45 | `OV5 0.40 - 0.45` |
| 0.50 – 0.55 | `OV6 0.50 - 0.55` |

**Xác định loại đá từ Mã xoàn (G column):**
```
prefix(Mã xoàn)  →  nhóm lookup
  RD-LG...       →  RD-LG (ưu tiên check trước RD)
  RD...          →  RD
  PR...          →  PR
  BG...          →  BG
  MQ...          →  MQ
  PS...          →  PS
  OV...          →  OV
  RDCZ...        →  RD (CZ = cubic zirconia, dùng bảng RD)
  Khác           →  cần xử lý thủ công / fallback
```

---

### 9.5 Flow tổng hợp auto-fill

```
User nhập MO vào JM FORM cột E (SO# & MO#)
          │
          ▼
  SUMMARY cột C = pull từ JM FORM E
  Extract MO: regex /MO([\d.]+)/
          │
          ▼
  Query tracking file:
    WHERE E (MO) = extracted_MO
      AND M (Trạng thái) = "Xuất"
          │
          ├── 0 kết quả  → không fill, user nhập thủ công
          │
          └── N kết quả  → fill N sub-rows trong block xoàn
                │
                ▼  Mỗi dòng tracking → 1 sub-row SUMMARY:
                  L = G (Mã xoàn)
                  M = "VVS1"  (cố định)
                  N = mapSizeToRange(G, H, L)
                  O = I (SL hột)
                  Q = L (TB viên)  [TL sau xử lý ct.]
                  
                  Sau đó tự tính:
                  R = P / 5
                  S = VLOOKUP(N, NVL-Hột)
                  T = P × S
                  V = 1 × O
```

---

### 9.6 Edge cases

| Case | Xử lý |
|------|-------|
| Không tìm thấy MO trong tracking | Để trống, user nhập thủ công |
| MO có nhiều dòng > block size (>5 cho CH1/ADM, >10 cho CH2) | Báo lỗi / overflow — cần user xử lý thủ công |
| Loại đá không nằm trong bảng NVL-Hột | Fill Mã xoàn + Size gốc, để N trống hoặc ghi "(không có trong bảng)" |
| Cùng MO có nhiều dòng "Xuất" trùng Mã xoàn | Fill tất cả, user tự quyết merge hay giữ riêng |
| Size nằm ngoài range bảng | Lấy range gần nhất hoặc để trống + cảnh báo |

---

## 10. Nguồn dữ liệu đầu vào — File SPHT NHẬP KHO

> File này là **nguồn chính** tạo ra các invoice cho hàng gửi US.

---

### 10.1 File nguồn

**File:** `[HPVN-KO301] 2026-BÁO CÁO SPHT NHẬP KHO TỔNG.xlsx`
**Sheet:** `HT05.26` (tên thay đổi theo tháng, ví dụ HT04.26, HT05.26, ...)
**Header:** Hàng 11
**Dữ liệu US:** Hàng có cột A = `"US"`, lọc thêm cột Q = `"Đã ship"`

---

### 10.2 Cấu trúc cột (header hàng 11)

| Cột | Tên | Mô tả |
|-----|-----|-------|
| A | CH | Mã kho/kênh: `214`, `359`, `US`, `Kênh sỉ`, ... |
| B | SỐ PHIẾU NK | Số phiếu nhập kho |
| C | NGÀY NK | Ngày nhập kho |
| D | **SKU** | Mã SKU → JM Form cột F (SKU#) |
| E | **SO** | Sales Order number |
| F | **MO** | Manufacturing Order number |
| G | **CHI TIẾT SẢN PHẨM** | Mô tả chi tiết → JM Form cột I (Description) |
| H | **LOẠI VÀNG** | Loại vàng → SUMMARY cột G (Loại vàng) |
| I | **SỐ LƯỢNG** | Số lượng → JM Form cột J (Qt. pcs) |
| J | **TỔNG TL (gr)** | Trọng lượng → JM Form cột K (Wt. gr) |
| K | TÊN SP | Tên sản phẩm ngắn |
| L | QUI CÁCH | Qui cách (size/model code) |
| M | SL HỘT | Số lượng hột |
| N | TL HỘT (cts) | Trọng lượng hột |
| O | TL VÀNG (gr) | TL vàng thực tế = J − (N × 0.2) |
| **P** | **TÊN KHÁCH** | **Kênh/khách hàng** ← phân loại template |
| **Q** | **SỐ PO** | **Trạng thái ship** ← bộ lọc chính |
| **R** | **V-INV** | **Mã invoice** ← gom nhóm vào 1 file |
| S | Trị giá ship (OLD) | |
| T | Trị giá ship ($) | |
| U | Trị giá NVL-Invoice ($) | |
| V | NGUỒN NHẬP | SX-L2, SX-L3, ... |

---

### 10.3 Điều kiện lấy dữ liệu

```
WHERE A (CH) = "US"
  AND Q (SỐ PO) = "Đã ship"
```

> Các hàng có Q = `"Đã lên danh sách ship"` hoặc Q trống → **chưa ship**, không xử lý.

---

### 10.4 Phân loại template theo TÊN KHÁCH (cột P)

| Giá trị cột P | Template | Ghi chú |
|---------------|----------|---------|
| `CH1-Khách` | **CH1** | Cả 2 giá trị CH1-Khách và CH1-SR |
| `CH1-SR` | **CH1** | đều vào cùng 1 template CH1 |
| `ADM` | **ADM** | |
| `CH1-AG3` | **CH1 AG3** | |
| `CH2-AG3` | **CH1 AG3** | Cùng template, khác kênh AG3 |
| `CH3-AG3` | **CH1 AG3** | |
| `KENH-SI` (hoặc chứa `KÊNH SỈ`) | **VNSI AG3** | |
| `Ba Sao`, các giá trị khác | **Nhập thủ công** | |

---

### 10.5 Gom nhóm vào invoice theo V-INV (cột R)

Tất cả hàng có cùng giá trị `R (V-INV)` → **cùng 1 file invoice**.

```
Ví dụ: V-INV = "P60501"
  → CH1-Khách row 1  ┐
  → CH1-Khách row 2  ├── cùng 1 file invoice CH1 (P60501)
  → CH1-SR row 1     │
  → ADM row 1        ┘ (nếu có cùng V-INV)

  V-INV = "P60503"
  → CH1-SR row 1     ┐
  → CH1-SR row 2     ├── cùng 1 file invoice CH1 (P60503)
  → ADM row 1        ┘
```

> Trong thực tế, CH1-Khách và CH1-SR cùng V-INV → cùng 1 invoice CH1.
> ADM có V-INV riêng → invoice ADM riêng.

---

### 10.6 Field mapping SPHT → JM Form / SUMMARY

| SPHT cột | Giá trị ví dụ | → Đích | Field |
|----------|--------------|--------|-------|
| D | `109842` | JM Form | **SKU# new** (cột F) |
| E | `26.10696` | JM Form | SO# (phần SO trong cột E: `SO26.10696`) |
| F | `26.36390` | JM Form | MO# (phần MO trong cột E: `SO26.10696-MO26.36390`) |
| G | `DPDMT: 18KY 30RD/...` | JM Form | **Description** (cột I) |
| H | `18KY` | SUMMARY | **Loại vàng** (cột G) |
| I | `1` | JM Form ← SUMMARY E | **Qt. (pcs)** / Số lượng |
| J | `2.52` | JM Form | **Wt. (gr)** (cột K) |

**Kết hợp SO + MO thành chuỗi JM Form cột E:**
```
JM Form E = "SO" + E(SPHT) + "-MO" + F(SPHT)
           = "SO26.10696-MO26.36390"
```

---

### 10.7 Flow tổng hợp tạo invoice

```
File SPHT (sheet HT05.26)
          │
          ▼ Lọc: A="US" AND Q="Đã ship"
          │
          ├── Group by R (V-INV)
          │         │
          │         ▼ Mỗi V-INV = 1 invoice file
          │
          ├── Mỗi nhóm V-INV:
          │     │
          │     ▼ Phân loại P (TÊN KHÁCH) → chọn template
          │
          ├── CH1-Khách / CH1-SR → Invoice CH1
          │     Mỗi row = 1 sản phẩm trong JM Form
          │     ┌────────────────────────────────────────┐
          │     │ JM Form cột F (SKU) ← D                │
          │     │ JM Form cột E (SO#&MO#) ← "SO{E}-MO{F}"│
          │     │ JM Form cột I (Description) ← G         │
          │     │ JM Form cột K (Wt.gr) ← J               │
          │     │ SUMMARY cột G (Loại vàng) ← H           │
          │     │ SUMMARY cột E (Số lượng) ← I            │
          │     │ SUMMARY cột I (T.Phẩm có NVL đá) ← J   │
          │     └────────────────────────────────────────┘
          │     Sau đó: lookup xoàn từ tracking (Section 9)
          │
          ├── ADM → Invoice ADM (cấu trúc đơn giản hơn, không gia công)
          │
          ├── CH1-AG3/CH2-AG3/CH3-AG3 → Invoice CH1 AG3
          │     Không cần xoàn lookup
          │
          ├── KENH-SI → Invoice VNSI AG3
          │
          └── Các giá trị P khác → Nhập thủ công

```

---

### 10.8 Trạng thái ship và xử lý

| Q (SỐ PO) | R (V-INV) | Xử lý |
|-----------|-----------|-------|
| `Đã ship` | Có giá trị (e.g. `P60501`) | ✅ Tạo invoice tự động |
| `Đã lên danh sách ship` | Thường trống | ⏳ Chờ — chưa ship, bỏ qua |
| Trống / khác | — | ❌ Không xử lý |

---

### 10.9 T.Phẩm (có NVL đá) trong SUMMARY

Từ SPHT, cột J = TỔNG TL (gr) là trọng lượng toàn bộ sản phẩm (vàng + đá).
→ Đây là giá trị điền vào **SUMMARY cột I (T.Phẩm có NVL đá)**.

Sau khi lookup xoàn (Section 9) điền TL xoàn vào R:
```
T.Phẩm (trừ NVL đá) [J] = I − Σ(TL xoàn, gr)
T.Phẩm (vàng thực tế) [K] = J  (giống J)
Tiền vàng [H] = giá/gram × K
```
