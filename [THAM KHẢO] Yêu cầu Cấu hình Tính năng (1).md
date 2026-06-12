Dưới đây là tài liệu **Yêu cầu Cấu hình Tính năng (PRD \- Product Requirement Document)** hoàn chỉnh, được hệ thống hóa bài bản dựa trên các yêu cầu nghiệp vụ, logic ngầm, và các điểm bổ sung cho ngành kim hoàn.  
Tài liệu này được thiết kế theo cấu trúc chuẩn để cả **Business Analyst (BA)** và **Developer (Dev)** có thể đọc – hiểu – lập trình được ngay.

# **TÀI LIỆU YÊU CẦU PHÁT TRIỂN PHẦN MỀM (PRD)**

## **MODULE: QUẢN LÝ & TẠO V-INVOICE (INTEGRATED BOM)**

## **1\. TỔNG QUAN HỆ THỐNG & LUỒNG NGHIỆP VỤ (WORKFLOW)**

Tính năng này cho phép quản lý, tính toán giá thành, và xuất hóa đơn (V-Invoice) cho các sản phẩm trang sức dựa trên dữ liệu tích hợp từ hệ thống Định mức nguyên vật liệu (BOM). Hệ thống hỗ trợ 2 góc nhìn (View): **Invoice rút gọn (JM Form View)** dành cho khách hàng và **BOM chi tiết nội bộ (Detail View)** dành cho quản lý và kế toán.

### **Luồng Trạng thái của Invoice (Invoice State Machine)**

Developer cần cấu hình hệ thống chuyển trạng thái nghiêm ngặt theo workflow sau:

| Trạng thái (Status) | Quyền hạn trên Giao diện | Logic Hệ thống áp dụng |
| :---- | :---- | :---- |
| **Draft** (Nháp) | Được phép Thêm/Xóa/Sửa tất cả các trường dữ liệu. | \- Giá vàng tự động lấy theo bảng giá kim loại quý trong ngày. \- Giá đá, tiền công lấy từ hệ thống BOM. |
| **Pending Approval**  (Chờ duyệt) | **Khóa toàn bộ giao diện** đối với User thường. Chỉ Admin/Manager được sửa đổi. | Đợi xác nhận cấu hình giá, chi phí phát sinh hoặc các tỷ lệ chiết khấu/bù hao hụt. |
| **Approved** (Đã duyệt) | Mở tính năng "In Invoice" (PDF) và "Export Excel". Không cho sửa data. | Đóng gói dữ liệu để chuẩn bị xuất kho hoặc gửi cho khách hàng. |
| **Invoiced**  (Đã xuất hóa đơn) | **Khóa vĩnh viễn (Read-only)** đối với tất cả mọi User (kể cả Admin). | **Kích hoạt Cơ chế Snapshot Data:** Toàn bộ dữ liệu tại thời điểm này được sao lưu cố định. Mọi thay đổi sau đó của hệ thống BOM gốc hoặc Bảng giá vàng ngày không được phép tác động vào Invoice này. |

## **2\. YÊU CẦU CHỨC NĂNG (FUNCTIONAL REQUIREMENTS)**

### **2.1. Quản lý Bảng Giá Kim Loại Quý Theo Ngày (Daily Metal Rate)**

* **Giao diện:** Một bảng cấu hình nằm trong trang Admin hoặc Header của Module.  
* **Các trường dữ liệu:** 24K, PT (Platinum), AG (Bạc), PD (Palladium), 18KW, 14KY...  
* **Logic:** Cho phép Admin cập nhật giá USD/gram hoặc USD/Chỉ theo ngày. Khi một Invoice ở trạng thái **Draft** được tạo, hệ thống sẽ gọi giá trị từ bảng này để tính toán.

### **2.2. Tính năng Nhập Dữ Liệu (Data Entry & Validation)**

Hệ thống hỗ trợ 2 phương thức khởi tạo Invoice:

1. **Import Excel/CSV:** Người dùng tải file lên.  
2. **Thêm dòng thủ công (Add Row):** Người dùng gõ mã SKU JWMold hoặc SO\#/MO\#.

⚠️ **Quy tắc Kiểm tra lỗi (Validation Rule) khi Import/Add Row:**

* Nếu SKU hoặc SO\#/MO\# **không tồn tại** trong thư viện hệ thống BOM, hệ thống phải dừng tiến trình, không cho lưu, và xuất một **Error Log** hiển thị rõ: *"Dòng số \[X\]: Mã SKU/SO-MO không tồn tại trong hệ thống. Vui lòng kiểm tra lại."*  
* Nếu hợp lệ, hệ thống tự động tải hình ảnh từ thư viện sản phẩm và điền tự động (Auto-populate) toàn bộ thông tin chi tiết của sản phẩm đó vào cả 2 View.

## **3\. THIẾT KẾ GIAO DIỆN & LOGIC TÍNH TOÁN CHI TIẾT (UI/UX & FORMULAS)**

### **Giao diện 1: JM FORM VIEW (Góc nhìn Invoice rút gọn)**

* **Header:** Hiển thị PO: 1000011528 và MR: 1000011901.  
* **Grid Data:** Hiển thị danh sách phẳng (Flat list).

#### **Công thức thiết lập cấu hình giá ngầm (Pricing Rule Configuration):**

Để hiển thị các cột giá tại giao diện này, hệ thống áp dụng công thức từ giá vốn sản xuất ($HPUSA$ tính ở Giao diện 2):

* $$\\text{HP for CIF price} \= \\text{HPUSA} \\times \\text{Hệ số A (Cấu hình tùy chỉnh)}$$  
* $$\\text{HP for Tag price} \= \\text{HP for CIF price} \\times \\text{Hệ số B (Cấu hình tùy chỉnh)}$$  
* $$\\text{HP for FB price} \= \\text{HP for CIF price} \\times \\text{Hệ số C (Cấu hình tùy chỉnh)}$$

#### **Quy tắc hiển thị đặc biệt (Conditional Formatting):**

* Tại cột **Ghi chú (Notes)**: Nếu chuỗi ký tự chứa từ khóa "Ba Sao", hệ thống tự động chuyển màu font chữ sang **Bold Đỏ** để cảnh báo dòng hàng đặc biệt. Các chuỗi khác hiển thị font màu xanh dương hoặc đen mặc định.

### **Giao diện 2: DETAIL VIEW (BOM Chi Tiết Nội Bộ)**

Giao diện này thiết kế theo dạng **Master-Detail Grid** (Bảng lồng nhau). Dòng Master là thông tin sản phẩm tổng quan, click bung dòng sẽ ra các dòng Detail (đá tấm, xoàn).

#### **A. Cấu trúc các trường dữ liệu & Công thức tính cho từng Sản phẩm:**

| STT | Tên cột trên Giao diện | Thuộc tính dữ liệu | Logic & Công thức xử lý dữ liệu (Dành cho Developer) |
| :---- | :---- | :---- | :---- |
| 1 | **Hình ảnh** | Image (Thumb) | Tự động render từ thư viện sản phẩm theo mã SO/MO. |
| 2 | **SO/MO & Tên KH** | Text (Mutiline) | Dòng 1: Mã đơn hàng. Dòng 2: Tên khách hàng (Ví dụ: *Robin Adams vòng custom(PM)*). |
| 3 | **Kích thước & SL** | Number / Text | Kích thước sản phẩm (Size) và Số lượng sản phẩm (Mặc định \= 1). |
| 4 | **Mã số mẫu & Loại vàng** | Text / Dropdown | Ví dụ: P10194 \- 18KW. |
| 5 | **Tiền vàng ($)** | Currency (USD) | $$\\text{Tiền vàng} \= \\text{T.Phẩm (vàng thực tế)} \\times \\text{Giá loại vàng tương ứng theo ngày} \\times (1 \+ \\text{\\% Hao hụt đúc)}$$ *(Lưu ý: % Hao hụt đúc/Casting Loss được cấu hình trong Admin, ví dụ: 5%).* |
| 6 | **Trọng lượng (gr)** | Gồm 3 cột con: |  |
|  | *• T.Phẩm (có NVL đá)* | Number (Decimal) | Trọng lượng tổng của sản phẩm nhập từ cân hoặc hệ thống. |
|  | *• T.Phẩm (trừ NVL đá)* | Number (Decimal) | $$\\text{T.Phẩm (trừ NVL đá)} \= \\text{T.Phẩm (có NVL đá)} \- \\sum \\text{TL Xoàn (gr) của sản phẩm đó}$$ |
|  | *• T.Phẩm (vàng thực tế)* | Number (Decimal) | Highlight nền màu vàng. Giá trị dùng để tính toán trực tiếp ra tiền vàng. |
| 7 | DÒNG DETAIL: Thông tin Xoàn/Đá tấm | List lồng nhau (0 \-\> nhiều dòng) | **Mỗi dòng đá tấm gồm các cột:**  \- **Mã Xoàn / P.chất / Size Xoàn**: Text. \- **SL**: Số lượng viên đá tấm. \- **TL (ct.) trước & sau xử lý**: Trọng lượng carat. \- **TL Xoàn (gr)**: Hệ thống tự động quy đổi từ Carat sang Gram để trừ cân: $1 \\text{ ct} \= 0.2 \\text{ gr}$. \- **Đơn giá**: Giá trên 1 carat. \- **T.Giá Xoàn**: $$\\text{T.Giá Xoàn} \= \\text{TL (ct.) sau xử lý} \\times \\text{Đơn giá}$$ |
| 8 | **Chi phí sản xuất** | Nhóm các cột chi phí: |  |
|  | *• Phí nhận hột* | Currency (USD) | Gồm Đơn giá nhận hột/viên và Tổng phí: $$\\text{Tổng T.Phí nhận hột} \= \\sum (\\text{SL viên đá} \\times \\text{Đơn giá nhận hột tương ứng})$$ |
|  | *• Gia công / Đúc / Thiết kế / Resin / Phụ kiện* | Currency (USD) | Các chi phí cố định nhập từ hệ thống định mức BOM cho 1 SP. |
| 9 | **HPUSA (Vốn sản xuất)** | Currency (USD) | **Cột tính toán cốt lõi của hệ thống:**  $$\\text{HPUSA} \= \\text{Tiền vàng} \+ \\sum \\text{T.Giá Xoàn} \+ \\text{Tổng T.Phí nhận hột} \+ \\text{Gia công} \+ \\text{Đúc} \+ \\text{Thiết kế} \+ \\text{Resin} \+ \\text{Phụ kiện}$$ |

#### **B. Khối hiển thị Tổng cộng của từng Sản phẩm (Sub-total):**

* Cuối mỗi nhóm dòng Detail của một sản phẩm, hệ thống phải có một dòng ngầm tích hợp hiển thị: **Tổng cộng tiền đá ($\\sum \\text{T.Giá Xoàn}$)** và **Tổng phí nhận hột** của riêng sản phẩm đó trước khi đưa lên công thức tính $HPUSA$.

## **4\. QUY TẮC TÍNH TOÀN BẢNG (TOTAL ROW LOGIC)**

Dòng **TOTAL** ở cuối trang của cả hai giao diện phải tự động tính toán chính xác theo thời gian thực (Real-time sync) khi có bất kỳ sự thay đổi nào ở trạng thái *Draft*:

* **Tổng số lượng sản phẩm:**  
* $$\\text{Total\\\_Qty} \= \\sum \\text{Sản phẩm \- Qt (pcs)}$$  
* (Kết quả mẫu: 36)  
* **Tổng Trọng lượng tổng:**  
* $$\\text{Total\\\_Weight} \= \\sum \\text{T.Phẩm (có NVL đá)}$$  
* (Kết quả mẫu: 251.38)  
* **Tổng Trọng lượng đá quy đổi:**  
* $$\\text{Total\\\_Stone\\\_Weight} \= \\sum \\text{TL Xoàn (gr)}$$  
* (Kết quả mẫu: 6.55)  
* **Tổng Tiền Vàng:**  
* $$\\text{Total\\\_Gold\\\_Amount} \= \\sum \\text{Tiền vàng (\\$)}$$  
* (Kết quả mẫu: $33,289)  
* **Tổng Vốn Sản Xuất:**  
* $$\\text{Total\\\_HPUSA} \= \\sum \\text{HPUSA}$$  
* (Kết quả mẫu: $39,926)  
* **Tổng Giá Invoice CIF:**  
* $$\\text{Total\\\_CIF} \= \\sum \\text{HP for CIF price}$$  
* (Kết quả mẫu: $42,708)

## **5\. TÍNH NĂNG ĐẦU RA (OUTPUT & EXPORT)**

* **Nút "Export Excel":** Xuất chính xác lưới dữ liệu đang hiển thị theo đúng định dạng mẫu, giữ nguyên cấu trúc dòng Master-Detail (Merge cell hợp lý ở các cột thông tin chung sản phẩm).  
* **Nút "In Invoice" (PDF):** Hệ thống kết xuất dữ liệu sang layout file PDF chuẩn khổ giấy **A4 nằm ngang (Landscape)**. Layout phải căn chỉnh bao gồm đầy đủ logo công ty, thông tin Header (PO/MR), bảng danh mục sản phẩm thu gọn (Giao diện 1\) và dòng ký tên của các bên.

# **HƯỚNG DẪN DÀNH CHO DEVELOPER (DEV GUIDELINES)**

### **Kiến trúc dữ liệu gợi ý (Database Schema)**

* Tách biệt bảng Invoice\_Header (Lưu thông tin PO, MR, Trạng thái, Ngày tạo), Invoice\_Items (Lưu dòng Master: SKU, Trọng lượng tổng, Tiền vàng, HPUSA...) và Invoice\_Item\_Details (Lưu dòng Detail: Thông tin các loại đá tấm đính trên sản phẩm đó).  
* Khi trạng thái Invoice chuyển sang Invoiced, sử dụng một Trigger hoặc Service để copy toàn bộ dữ liệu hiện tại sang bảng Invoice\_Snapshot\_Log hoặc bật flag Is\_Locked \= true trên database để chặn tất cả các lệnh UPDATE/DELETE.

### **Đồng bộ hóa thời gian thực (Real-time Sync)**

* Sử dụng các React State hoặc Vuex/Redux Store để quản lý biến thể giá. Khi user chỉnh sửa số lượng đá tấm ở bảng Detail (Ảnh 2), các hàm tính toán Sub-total \-\> HPUSA \-\> HP for CIF price (Ảnh 1\) phải lập tức thay đổi trên màn hình mà không cần Reload lại trang.

