# Hướng dẫn sử dụng V-Invoice

> Tài liệu này dùng làm nội dung cho màn hình Help trong ứng dụng.
> Review xong → Claude implement vào UI.

---

## MỤC LỤC

1. [Tổng quan hệ thống](#1-tổng-quan)
2. [Phân quyền — Ai làm được gì?](#2-phân-quyền)
3. [ADMIN — Quản trị viên](#3-admin)
4. [MANAGER — Quản lý](#4-manager)
5. [USER — Nhân viên tạo invoice](#5-user)
6. [VIEWER — Xem báo cáo](#6-viewer)
7. [Luồng duyệt invoice (Approval Flow)](#7-luồng-duyệt)
8. [Trạng thái invoice](#8-trạng-thái)
9. [Câu hỏi thường gặp](#9-faq)

---

## 1. TỔNG QUAN

**V-Invoice** là hệ thống quản lý invoice trang sức HP Jewelry, gồm 4 chức năng chính:

| Chức năng | Mô tả |
|-----------|-------|
| 📝 Tạo Invoice | Nhập từ file Excel hoặc tạo thủ công |
| ✅ Duyệt Invoice | Quy trình nhiều bước: Draft → Pending → Approved → Invoiced |
| 💰 Tính giá tự động | Hệ thống tính gold value, HPUSA, CIF, Tag, FR Price theo giá vàng ngày |
| 📊 Export & In ấn | Xuất Excel và in A4 theo phân quyền |

---

## 2. PHÂN QUYỀN — AI LÀM ĐƯỢC GÌ?

Hệ thống có **4 vai trò**. Mỗi tài khoản được Admin gán 1 vai trò cố định.

| Vai trò | Tạo invoice | Duyệt | Khóa invoice | Quản trị |
|---------|:-----------:|:-----:|:------------:|:--------:|
| 🔑 **Admin** | ✓ | ✓ | ✓ | ✓ |
| 👔 **Manager** | ✓ | ✓ | ✗ | ✗ |
| 👤 **User** | ✓ | ✗ | ✗ | ✗ |
| 👁️ **Viewer** | ✗ | ✗ | ✗ | ✗ |

> **Lưu ý:** Viewer chỉ xem và xuất Excel, không tạo hay sửa được gì.

---

## 3. ADMIN — Quản trị viên

Admin có toàn quyền hệ thống. Ngoài làm được mọi thứ của Manager và User, Admin còn:

### 3.1 Cấu hình ban đầu (làm 1 lần)

**Bước 1 — Tạo tài khoản cho team**
1. Vào menu → **Users**
2. Bấm **Add User**
3. Nhập: Họ tên · Email · Mật khẩu · Chọn vai trò
4. Bấm **Save** → Gửi thông tin đăng nhập cho nhân viên

**Bước 2 — Cấu hình Pricing Rule**
1. Vào menu → **Pricing Rules**
2. Bấm **Add Rule** → Đặt tên (VD: "Standard 2026")
3. Nhập hệ số nhân:
   - **CIF Multiplier**: HPUSA × hệ số → giá CIF (VD: 1.10)
   - **Tag Multiplier**: CIF × hệ số → giá Tag (VD: 1.25)
   - **FR Multiplier**: CIF × hệ số → giá FR (VD: 1.08)
   - **Casting Loss %**: % hao hụt đúc (VD: 5%)
4. Bật **Active** → **Save**

> ⚠️ Chỉ 1 Pricing Rule được Active tại một thời điểm.

**Bước 3 — Nhập danh mục sản phẩm (SKU)**
1. Vào menu → **Products**
2. Bấm **Add Product** → Nhập mã SKU, mô tả, loại kim loại
3. Nhập phí mặc định: labor, casting, design, resin, misc
4. Bấm **Save**

> SKU phải được nhập trước khi import Excel. Nếu SKU không tồn tại → Import sẽ báo lỗi.

---

### 3.2 Công việc hàng ngày của Admin

**Cập nhật giá vàng mỗi sáng**
1. Vào menu → **Metal Rates**
2. Bấm **Add Rate**
3. Nhập ngày hôm nay và các mức giá (USD/gram):
   - 24K · 18K White · 18K Yellow · 14K Yellow
   - Platinum · Silver · Palladium
4. Bấm **Save**

> 💡 Lấy giá từ SJC hoặc Kitco. Mỗi ngày nhập 1 dòng. Invoice sẽ "ghi nhớ" giá tại ngày tạo — thay đổi giá sau không ảnh hưởng invoice cũ.

**Khóa invoice (Mark as Invoiced)**
1. Mở invoice đang ở trạng thái **APPROVED**
2. Trong thanh trạng thái → Bấm **Mark as Invoiced**
3. Đọc cảnh báo → Xác nhận

> ⚠️ **Không thể hoàn tác.** Sau khi Invoiced, hệ thống tự lưu toàn bộ dữ liệu và khóa — không ai sửa được nữa.

---

## 4. MANAGER — Quản lý

Manager tạo invoice, kiểm tra, và duyệt invoice từ nhân viên.

### 4.1 Xem invoice chờ duyệt

1. Vào **Dashboard** → Xem ô **"Pending Approval: N"**
2. Bấm vào ô đó → Chuyển đến danh sách invoice đang chờ
3. Hoặc: Vào **Invoices** → Lọc **Status = Pending Approval**

### 4.2 Duyệt invoice

1. Mở invoice cần duyệt
2. Kiểm tra bảng **JM Form View** — xem toàn bộ dữ liệu
3. Chú ý: Dòng có chữ **"ba sao"** trong cột Notes sẽ **hiển thị màu đỏ** → Kiểm tra kỹ
4. Bấm trong thanh trạng thái:
   - **Approve** → Invoice chuyển sang APPROVED ✅
   - **Return to Draft** → Viết lý do → Nhân viên sửa lại

### 4.3 Tạo và chỉnh sửa invoice

Giống User — xem mục 5 bên dưới. Manager có thể chỉnh sửa **tất cả** invoice (không chỉ invoice của mình).

---

## 5. USER — Nhân viên tạo invoice

### 5.1 Tạo invoice từ Excel (phổ biến nhất)

1. Vào menu → **Import**
2. Chọn invoice cần import vào (hoặc tạo invoice mới trước)
3. **Kéo thả** hoặc **Browse** file Excel (.xlsx, .xls)
4. Hệ thống kiểm tra từng dòng:
   - ✅ Dòng hợp lệ → hiển thị trong bảng xanh
   - ❌ Dòng lỗi → hiển thị bảng đỏ với lý do (SKU không tồn tại, số lượng sai...)
5. Bấm **Import N Valid Rows** → Dữ liệu được nạp vào invoice
6. **Dòng lỗi không block** dòng hợp lệ — có thể import phần hợp lệ trước, sửa lỗi sau

> 📋 **Định dạng Excel JM chuẩn:**
> Cột A: Store | B: Location | C: SKU | D: SO/MO | E: Vendor Model | F: Description | G: Qty | H: Total Weight | I: Gold Weight | J: Metal Type | K: Class | L: Sub Class

### 5.2 Tạo invoice thủ công

1. Vào **Invoices** → Bấm **New Invoice**
2. Nhập: PO Number, MR Number, Store, chọn Metal Rate
3. Bấm **Save** → Invoice được tạo ở trạng thái DRAFT
4. Mở invoice → Bấm **Add Item** để thêm từng dòng sản phẩm

### 5.3 Kiểm tra và chỉnh sửa invoice

**Tab JM Form View** (bảng tổng quan 15 cột):
- Nhìn toàn bộ invoice như spreadsheet
- Cột **SKU JWMold** luôn có nền vàng để dễ nhận diện
- Cột **Notes** hiển thị **đỏ** nếu có ghi "ba sao"
- Các cột giá (Gold Value, HPUSA, CIF) được **tính tự động**

**Tab Detail View** (chỉnh từng dòng):
- Click vào ô để sửa: trọng lượng, số lượng, phí...
- Hệ thống **tính lại giá ngay lập tức** sau mỗi thay đổi
- Thêm/sửa/xóa đá quý (gem) cho từng sản phẩm

### 5.4 Gửi duyệt

1. Kiểm tra xong → Trong thanh trạng thái, bấm **Submit for Approval**
2. Viết ghi chú nếu cần (VD: "Kiểm tra lại dòng 3")
3. Bấm **Confirm** → Invoice chuyển sang **PENDING APPROVAL**
4. Manager sẽ nhận được để duyệt

> Sau khi Submit, bạn **không sửa được** invoice nữa cho đến khi Manager trả về Draft.

### 5.5 Nếu invoice bị trả về

1. Invoice sẽ quay về trạng thái **DRAFT**
2. Manager đã ghi lý do trong phần ghi chú
3. Sửa những gì Manager yêu cầu → Submit lại

---

## 6. VIEWER — Xem báo cáo

Viewer chỉ có quyền **xem và xuất Excel**. Không tạo, sửa, hay duyệt được.

### Viewer thấy gì?

| Cột | Viewer thấy không? |
|-----|:-----------------:|
| SKU, Qty, Weight, Metal Type | ✓ |
| Gold Value, HPUSA, CIF Price | ✗ |
| Tag Price, FR Price | ✗ |
| Sell Price, Discount % | ✗ |

> Viewer xuất Excel sẽ **không có các cột giá** — chỉ có thông tin sản phẩm cơ bản.

---

## 7. LUỒNG DUYỆT INVOICE (APPROVAL FLOW)

```
DRAFT ──[User Submit]──► PENDING APPROVAL ──[Manager Approve]──► APPROVED ──[Admin Invoice]──► INVOICED 🔒
                                │                    │
                         [Manager Return]     [Admin Return for Review]
                                │                    │
                                └──────────► DRAFT ◄─┘
```

| Bước | Người thực hiện | Hành động | Kết quả |
|------|----------------|-----------|---------|
| 1 | User / Manager / Admin | Submit for Approval | DRAFT → PENDING |
| 2 | Manager / Admin | Approve | PENDING → APPROVED |
| 2b | Manager / Admin | Return to Draft + ghi chú | PENDING → DRAFT |
| 3 | Admin | Mark as Invoiced | APPROVED → INVOICED 🔒 |
| 3b | Admin | Return for Review | APPROVED → PENDING |

---

## 8. TRẠNG THÁI INVOICE

| Trạng thái | Màu | Ý nghĩa | Ai sửa được? |
|-----------|-----|---------|--------------|
| **DRAFT** | Xám | Đang soạn thảo | User (chủ sở hữu), Manager, Admin |
| **PENDING APPROVAL** | Vàng | Đang chờ duyệt | Không ai (đang chờ) |
| **APPROVED** | Xanh lá | Đã duyệt, chờ invoiced | Không ai |
| **INVOICED** 🔒 | Đen (nền) | Đã khóa vĩnh viễn | Không ai |

> Khi invoice ở trạng thái **INVOICED**, hệ thống đã lưu snapshot toàn bộ dữ liệu. Dù giá vàng sau này thay đổi, invoice đã khóa vẫn giữ nguyên giá tại thời điểm khóa.

---

## 9. CÂU HỎI THƯỜNG GẶP

**Q: Import Excel bị lỗi "SKU not found"?**
> SKU trong file Excel chưa được nhập vào danh mục Products. Nhờ Admin thêm SKU đó vào /admin/products trước, sau đó import lại.

**Q: Tôi đã Submit nhưng muốn sửa lại?**
> Sau khi Submit, bạn không tự sửa được. Liên hệ Manager để "Return to Draft" — invoice sẽ trở lại DRAFT để bạn chỉnh sửa.

**Q: Giá tính sai, tôi có thể sửa không?**
> Giá được tính tự động từ trọng lượng × giá vàng × hệ số. Để sửa: (1) sửa trọng lượng/phí trong Detail View — giá tự cập nhật; hoặc (2) nhờ Admin cập nhật giá vàng ngày hôm đó.

**Q: Invoice đã INVOICED, tôi cần sửa thì làm sao?**
> Invoice đã INVOICED không thể sửa được. Cần tạo invoice mới để thay thế.

**Q: Tag Price và FR Price tôi không thấy?**
> Các cột này chỉ hiển thị cho Manager và Admin. Nếu bạn là User hoặc Viewer, các cột này bị ẩn theo chính sách phân quyền.

**Q: Import một lúc nhiều invoice được không?**
> Hiện tại mỗi lần Import gắn với 1 invoice. Tạo từng invoice riêng rồi import file Excel tương ứng vào mỗi invoice.

**Q: In invoice thì chất lượng in có giữ màu SKU vàng không?**
> Có. Trang in được tối ưu cho máy in — màu nền vàng của cột SKU và chữ đỏ "ba sao" sẽ giữ nguyên khi in.

---

*V-Invoice — HP Jewelry Management System*
