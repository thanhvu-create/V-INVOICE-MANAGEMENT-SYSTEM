# **YÊU CẦU PHÁT TRIỂN MODULE QUẢN LÝ & TẠO V-INVOICE** 

# **Target:** Xây dựng tính năng tạo, hiển thị danh sách và tạo Invoice dựa trên danh mục sản phẩm (vàng bạc, đá quý, trang sức) từ dữ liệu kho hiện có.

## **1\. Yêu cầu về Giao diện & Hiển thị (UI/UX)**

Hệ thống cần cung cấp một giao diện bảng (Data Table) quản lý danh sách sản phẩm trong một Invoice với các cột thông tin sau:

* **Thông tin chung của Invoice (Header):**  
  1. Mã đơn hàng/Mã mua hàng: PO (Purchase Order) và MR (Material Request).  
* **Các cột dữ liệu bắt buộc trên bảng (Grid):**  
  1. No. (STT): Tự động tăng.  
  2. Store (Cửa hàng): Mặc định hoặc chọn từ danh sách (Ví dụ: HP).  
  3. Location in store (Vị trí kho): Ví dụ: Safe 1\.  
  4. Vendor model\# (Mã mẫu nhà cung cấp).  
  5. SO\# & MO\# (Mã đơn hàng bán & Mã đơn hàng sản xuất).  
  6. SKU JWMold (Mã SKU sản phẩm) \-\> *Cần highlight hoặc có cơ chế tìm kiếm nhanh theo SKU này.*  
  7. Class (Loại trang sức): Ví dụ: 14MTG, PTJE, 18KJE, DIAMT, LGRI...  
  8. Sub class (Phân loại phụ): Ví dụ: ER (Earrings), RI (Ring), PD (Pendant), BL (Bracelet), CH (Chain), BG (Bangle)...  
  9. Description (Mô tả chi tiết sản phẩm): Bao gồm chất liệu, hàm lượng vàng, trọng lượng, số lượng kim cương/đá tấm đính kèm và size (Ví dụ: *18KPD: 18KY 2.84gr P11154* hoặc *DIARI: 18KW 39RD/0.185cts 2.49gr*).  
  10. Sản phẩm \- Qt (pcs) (Số lượng miếng/chiếc): Thường mặc định là 1\.  
  11. Sản phẩm \- Wt (gr) (Trọng lượng tổng bằng gram).  
  12. HP for CIF price (Giá CIF): Định dạng tiền tệ USD.  
  13. HP for Tag price (Giá gắn tag): Cho phép nhập hoặc tính toán.  
  14. HP for FR price (Giá FR): Cho phép nhập hoặc tính toán.  
  15. Ghi chú (Notes): Ghi nhận trạng thái hoặc tên khách hàng (Ví dụ: CH1-Khách, CH1-SR, Ba Sao...).

## **2\. Yêu cầu về Luồng Nghiệp vụ & Tính năng (Functional Requirements)**

* **Tính năng Tạo & Nhập dữ liệu (Data Entry):**  
  * Hỗ trợ tạo một Invoice mới bằng cách **Import file Excel/CSV** có cấu trúc tương tự như ảnh.  
  * Hoặc cho phép **Add row (Thêm dòng)** bằng cách gõ mã SKU JWMold. Khi gõ SKU, hệ thống phải tự động link với hệ thống BOM hiện tại để tự động điền (Auto-populate) các thông tin: *Class, Sub class, Description, Wt (gr), và Giá CIF*.  
* **Tính năng Tính toán tự động (Calculation Rules):**  
  * Dòng tổng cộng (**Total Row**) ở cuối bảng phải tự động tính:  
    * Tổng số lượng sản phẩm: $\\sum \\text{Qt (pcs)}$  
    * Tổng giá trị CIF: $\\sum \\text{HP for CIF price}$  
    * Tổng các cột giá Tag và giá FR tương ứng.  
* **Tính năng Phân loại dữ liệu (Formatting & Validation):**  
  * Hệ thống cần nhận diện được các trạng thái đặc biệt ở cột Ghi chú để highlight màu sắc (Ví dụ: "Ba Sao" \-\> chữ màu đỏ để cảnh báo).  
* **Tính năng Xuất bản (Export & Print):**  
  * Cho phép xuất lưới dữ liệu này ra file Excel đúng định dạng.  
  * Có nút "In Invoice" để xuất ra file PDF định dạng A4 nằm ngang (Landscape) chuẩn chỉnh để gửi cho khách hàng hoặc lưu trữ.

## **3\. Câu hỏi làm rõ dành cho Product Owner / User (Q\&A để hoàn thiện PRD)**

*Để team BA/Developer có thể làm chính xác nhất, cần làm rõ với khách hàng 3 câu hỏi sau:*

1. **Nguồn gốc giá CIF, Tag price, FR price:** Các giá này được lấy tự động từ hệ thống BOM hiện tại, hay người dùng sẽ nhập tay trên giao diện này, hay tính theo một công thức tỉ lệ % nào đó từ giá BOM?  
   \-\> Trả lời: Có công thức quy định riêng, không nhập tay  
2. **Quản lý trạng thái Invoice:** Hệ thống có cần quản lý trạng thái của Invoice này không? (Ví dụ: *Draft \-\> Pending Approval \-\> Approved \-\> Invoiced*).  
   \-\> Trả lời: Cần  
3. **Mối quan hệ với hệ thống BOM:** Khi thông tin sản phẩm trên hệ thống BOM thay đổi, thông tin trên các Invoice cũ đã tạo có cần cập nhật theo không, hay giữ nguyên dữ liệu tại thời điểm tạo Invoice (Snapshot data)?  
   \-\> Nếu trạng thái là invoiced thì giữ nguyên

# **CẤU TRÚC CHI TIẾT BẢNG TÍNH GIÁ SẢN PHẨM (BOM INTEGRATION)**

## **1\. Cấu trúc hiển thị & Nhóm dữ liệu (UI/UX \- Master-Detail Grid)**

Giao diện quản lý Invoice cần hỗ trợ hiển thị dạng **bảng lồng nhau** (hoặc cho phép click bung dòng chi tiết). Một sản phẩm (Dòng Master) sẽ bao gồm nhiều thành phần đá/hột đi kèm (Các dòng Detail phụ bên dưới).

### **A. Nhóm Thông tin sản phẩm chính (Master Row \- Dòng màu xanh/cam):**

* **Hình ảnh (Mới):** Cột hiển thị hình ảnh trực quan của sản phẩm.  
* **SO/MO:** Mã đơn hàng (Ví dụ: SO25.10008-MO26.36400) kèm Tên Khách hàng hiển thị ngay bên dưới (Ví dụ: Robin Adams vòng custom(PM)).  
* **Kích thước & Số lượng:** Size (Ví dụ: 22in, 6, 7...) và Số lượng (Mặc định thường là 1).  
* **Mã số mẫu & Loại vàng:** Ví dụ: P10194 \- 18KW, PT950, 14KY.  
* **Tiền vàng ($):** Giá trị phần vàng của sản phẩm.  
* **Trọng lượng (gr):** Gồm 3 cột bóc tách:  
  * *T.Phẩm (có NVL đá):* Trọng lượng tổng.  
  * *T.Phẩm (trừ NVL đá):* Trọng lượng cốt vàng sau khi trừ đá.  
  * *T.Phẩm (vàng thực tế):* Trọng lượng để tính tiền vàng (Highlight màu vàng).

### **B. Nhóm Thông tin Xoàn/Đá tấm (Detail Rows \- Các dòng nhỏ màu trắng/hồng phía dưới):**

Một sản phẩm có thể có từ 0 đến nhiều dòng đá tấm. Mỗi dòng đá tấm gồm:

* **Mã Xoàn:** Mã loại đá (Ví dụ: RD-10721-0.9mm).  
* **P. chất:** Phẩm chất/Độ sạch (Ví dụ: VVS1, LG).  
* **Size Xoàn:** Kích thước đá.  
* **SL:** Số lượng viên đá tấm (Ví dụ: 20, 18, 14 viên...).  
* **TL (ct.) trước xử lý:** Trọng lượng kim cương tính bằng carat.  
* **TL (ct.) sau xử lý:** Trọng lượng thực tế sau chế tác.  
* **TL Xoàn (gr):** Trọng lượng đá quy đổi ra gram để hệ thống tự động trừ vào trọng lượng tổng của sản phẩm.  
* **Đơn giá & T.Giá Xoàn:** Giá trên mỗi carat và Tổng thành tiền đá của dòng đó.

### **C. Nhóm Chi phí sản xuất & Phí dịch vụ (Cột màu xanh lá cây):**

Mỗi sản phẩm sẽ có thêm các chi phí cố định hoặc biến đổi đi kèm:

* **Phí nhận hột:** Gồm Đơn giá và T.Phí (Tiền công gắn đá/chấu, tính theo số lượng viên).  
* **Gia công/1 SP:** Tiền công thợ.  
* **Đúc/1sp:** Chi phí đúc khuôn.  
* **Thiết kế/1sp:** Chi phí thiết kế 3D/CAD.  
* **Resin/1sp:** Chi phí in mẫu resin.  
* **Phí phụ kiện (mua bên ngoài):** Chi phí phát sinh ngoại vi.

### **D. Cột Tổng giá trị & Logistics (Cột bên phải ngoài cùng):**

* **HPUSA (Vốn sản xuất):** Tổng giá thành sản xuất ra sản phẩm.  
* $$\\text{HPUSA} \= \\text{Tiền vàng} \+ \\text{Tổng T.Giá Xoàn} \+ \\text{Tổng T.Phí nhận hột} \+ \\text{Các chi phí sản xuất (Gia công \+ Đúc \+ Thiết kế \+ Resin \+ Phụ kiện)}$$  
* **Logistics & Tracking:** Các cột phụ vụ vận chuyển quốc tế: Ngày gửi, Tracking\# USA, gửi hàng USA.  
* **Hóa Đơn (V-INVOICE):** Đánh dấu số hóa đơn VAT/Hóa đơn chính thức của Việt Nam nếu có.

## **2\. Yêu cầu Logic Hệ thống cho Team AI / Dev (Functional Logic)**

1. **Logic Tự động Tính toán (Automation Formulas):**  
   * Khi người dùng nhập Số lượng viên đá (SL) và Đơn giá nhận hột, hệ thống phải tự tính T.Phí nhận hột.  
   * Hệ thống tự động cộng dồn tất cả các chi phí thành phần ở mục (A, B, C) để fill vào cột **HPUSA (Vốn sản xuất)**.  
   * Dòng **TOTAL** cuối trang: Tự động Sum toàn bộ số lượng sản phẩm, Tổng tiền vàng, Tổng trọng lượng, Tổng tiền đá, Tổng phí nhận hột, Các chi phí sản xuất, và Tổng vốn sản xuất ($39,926 như trong hình).  
2. **Đồng bộ hóa dữ liệu (Data Sync):**  
   * Giao diện ở Bức ảnh “1. JM Form” (Invoice rút gọn) và Bức ảnh “2. Detail” (BOM chi tiết nội bộ) là **2 góc nhìn (View) của cùng một Invoice**.  
   * *Ví dụ:* Khi chỉnh sửa số lượng đá tấm ở bảng chi tiết (Ảnh 2), giá CIF ở bảng 1 phải tự động cập nhật theo thời gian thực (Real-time).

## **3\. Câu hỏi cần làm rõ bổ sung (Q\&A cho phần này)**

1. **Công thức tính Tiền Vàng:** Tiền vàng ($548, $486...) được tính tự động dựa trên Trọng lượng vàng thực tế $\\times$ Giá vàng theo ngày đúng không? Hệ thống có cần khu vực để cập nhật giá vàng hôm nay (24K, PT, AG, PD ở góc trên bên trái) không?  
   \-\> Trả lời: Có  
2. **Hình ảnh sản phẩm:** Hình ảnh lấy tự động từ thư viện sản phẩm dựa theo mã SO/MO, hay người dùng sẽ upload tay lên từng dòng?  
   \-\> Từ thư viện

### **1\. Bổ sung các Logic ngầm (Hidden Logic) phát sinh từ câu trả lời của khách**

* **Về việc "Không nhập tay giá CIF, Tag, FR":**  
  * *Yêu cầu bổ sung cho Dev:* Cần xây dựng một **Module Cấu hình Công thức (Pricing Rule Configuration)** cho Admin. Nơi này cho phép thiết lập công thức tính toán từ Vốn sản xuất (HPUSA) ra các loại giá. Ví dụ: Giá CIF \= HPUSA x hệ số A, Giá Tag \= Giá CIF x hệ số B.  
* **Về việc "Trạng thái Invoiced thì giữ nguyên dữ liệu (Snapshot)":**  
  * *Yêu cầu bổ sung cho Dev:* Cần thiết lập cơ chế **Lock dữ liệu (Read-only)**. Khi Invoice chuyển sang trạng thái Invoiced, tất cả các dòng dữ liệu (bao gồm cả dòng chi tiết đá tấm, chi phí gia công...) tại thời điểm đó phải được nhân bản sao lưu (Snapshot) vào một bảng riêng hoặc khóa sửa đổi hoàn toàn. Dù hệ thống BOM gốc có cập nhật giá đá hay mã xoàn mới, Invoice này cũng không bị thay đổi.  
* **Về việc "Cập nhật giá vàng theo ngày":**  
  * *Yêu cầu bổ sung cho Dev:* Hệ thống cần một **Bảng cập nhật giá kim loại quý (Daily Metal Rate)** ở thanh Menu hoặc trang Admin để điền giá theo ngày cho: 24K, PT (Platinum), AG (Bạc), PD (Palladium)...  
  * *Logic tính toán:* Tiền vàng \= Trọng lượng vàng thực tế $\\times$ Giá loại vàng tương ứng trong bảng cấu hình theo ngày.

### **2\. Những điểm "Thiếu sót nghiêm trọng" cần bổ sung ngay**

Ngành trang sức đá tấm tính tiền rất kỹ, trong tài liệu hiện tại đang thiếu các cơ chế xử lý lỗi giao diện và tính toán sau:

* **Thiếu cấu trúc lưu trữ và hiển thị dòng Tổng cộng của từng Sản phẩm (Sub-total):**  
  * Trong ảnh 2, một sản phẩm (Master) có nhiều dòng đá (Detail). Hệ thống cần hiển thị dòng **Tổng cộng tiền đá** và **Tổng phí nhận hột** của *riêng sản phẩm đó* trước khi cộng tổng (Total) toàn bảng ở cuối trang.  
* **Thiếu cơ chế xử lý hao hụt vàng (Gold Loss / Casting Loss %):**  
  * Thông thường trong chế tác, trọng lượng cốt vàng luôn có một tỉ lệ hao hụt (ví dụ 5% \- 7%). Hệ thống cần thêm cột % hao hụt vào nhóm Chi phí sản xuất?  
* **Thiếu tính năng Kiểm tra lỗi (Validation Rule) khi Import file:**  
  * Nếu Import file Excel mà mã SKU hoặc mã SO/MO không tồn tại trong thư viện BOM hiện có, hệ thống sẽ xử lý thế nào?  
  * *Yêu cầu:* Hệ thống phải hiển thị thông báo lỗi (Error Log) chỉ rõ dòng nào bị sai và không cho phép lưu Invoice lỗi.

### **3\. Gợi ý cấu trúc lại trạng thái Invoice để BA dễ viết User Story**

Thay vì chỉ ghi chung chung, hãy chuẩn hóa **Luồng trạng thái (Workflow)** dưới dạng các bước cụ thể để Dev bắt sự kiện (Event) chính xác:

1. **Draft (Nháp):** Khi mới Import hoặc thêm dòng thủ công. Giá vàng lấy theo giá ngày hôm đó. Cho phép sửa/xóa mọi thứ.  
2. **Pending Approval (Chờ duyệt):** Khóa không cho sửa, chờ Quản lý duyệt các chi phí phát sinh hoặc công thức tính giá.  
3. **Approved (Đã duyệt):** Cho phép xuất file in gửi khách hoặc chuẩn bị xuất hàng.  
4. **Invoiced (Đã xuất hóa đơn):** Hệ thống chính thức chạy lệnh **Snapshot Data** (Khóa vĩnh viễn dữ liệu thời điểm này) và đồng thời **trừ kho vật tư/BOM** (nếu hệ thống có module kho).

