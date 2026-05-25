# V-Invoice — Sơ Đồ Hệ Thống (Stakeholder Review)

> **Mục đích:** Tài liệu tổng quan cho stakeholder xem xét nghiệp vụ
> **Cập nhật:** 2026-05-25

---

## 1. VÒNG ĐỜI INVOICE (Status Lifecycle)

```mermaid
stateDiagram-v2
    direction LR

    [*] --> DRAFT : Tạo mới (user/manager/admin)

    DRAFT --> PENDING_APPROVAL : Submit\n(user/manager/admin)
    PENDING_APPROVAL --> APPROVED : Duyệt\n(manager/admin)
    PENDING_APPROVAL --> DRAFT : Trả về\n(manager/admin)
    APPROVED --> INVOICED : Mark Invoiced\n(admin only)
    APPROVED --> PENDING_APPROVAL : Trả về review\n(admin only)

    INVOICED --> [*] : 🔒 FROZEN\nKhóa vĩnh viễn

    note right of INVOICED
        Trigger PostgreSQL tự động:
        • Tạo snapshot bất biến
        • is_locked = true
        • Không thể sửa bất cứ thứ gì
    end note
```

---

## 2. PHÂN QUYỀN THEO ROLE

```mermaid
graph TD
    subgraph ROLES["👥 4 ROLES"]
        A["🔴 ADMIN\nToàn quyền"]
        M["🟡 MANAGER\nDuyệt + Tạo"]
        U["🟢 USER\nTạo draft"]
        V["⚪ VIEWER\nChỉ xem"]
    end

    subgraph ACTIONS["⚙️ ACTIONS"]
        C["✏️ Tạo / Sửa Invoice"]
        AP["✅ Duyệt (Approve)"]
        INV["🔒 Mark Invoiced"]
        DEL["🗑️ Xóa Invoice"]
        IMP["📥 Import Excel"]
        EXP["📤 Export Excel"]
        ADM["⚙️ Trang Admin"]
        USR["👤 Quản lý Users"]
    end

    A -->|✓| C
    A -->|✓| AP
    A -->|✓| INV
    A -->|✓| DEL
    A -->|✓| IMP
    A -->|✓| EXP
    A -->|✓| ADM
    A -->|✓| USR

    M -->|✓| C
    M -->|✓| AP
    M -->|✗| INV
    M -->|✗| DEL
    M -->|✓| IMP
    M -->|✓| EXP
    M -->|✗| ADM

    U -->|✓ own| C
    U -->|✗| AP
    U -->|✗| INV
    U -->|✗| DEL
    U -->|✓| IMP
    U -->|✓| EXP
    U -->|✗| ADM

    V -->|✗| C
    V -->|✗| AP
    V -->|✗| INV
    V -->|✗| DEL
    V -->|✗| IMP
    V -->|✓| EXP
    V -->|✗| ADM
```

---

## 3. LUỒNG TÍNH GIÁ (Pricing Chain)

```mermaid
flowchart TD
    A["⚖️ Weight Gold\nActual (g)"]
    B["💰 Metal Rate\n(USD/g theo loại kim loại)"]
    C["📉 Casting Loss %\n(thường 5%)"]

    A & B & C --> D["🥇 Gold Value USD\n= weight × rate × (1 + loss%)"]

    E["💎 Gems Total\n(Σ total_price từ DB)"]
    F["🔧 Setting Fee\n(Σ total_setting_fee từ DB)"]
    G["🛠️ Labor + Casting\n+ Design + Resin + Misc Fee"]

    D & E & F & G --> H["📊 HPUSA\nTổng vốn sản xuất"]

    I["✖️ CIF Multiplier\n(VD: 1.10)"]
    H --> J["📦 CIF Price\n= HPUSA × CIF_mult"]
    J --> I

    J --> K["🏷️ Tag Price\n= CIF × Tag_mult\n(manager/admin xem)"]
    J --> L["🌐 FR Price\n= CIF × FR_mult\n(manager/admin xem)"]

    style H fill:#FEF3C7,stroke:#92400E,color:#1A1814
    style J fill:#D1FAE5,stroke:#065F46,color:#1A1814
    style K fill:#FEE2E2,stroke:#991B1B,color:#1A1814
    style L fill:#FEE2E2,stroke:#991B1B,color:#1A1814
```

---

## 4. CỘT GIÁ — HIỂN THỊ THEO ROLE

| Cột giá | viewer | user | manager | admin |
|---------|:------:|:----:|:-------:|:-----:|
| Gold Value USD | ✓ | ✓ | ✓ | ✓ |
| HPUSA | ✓ | ✓ | ✓ | ✓ |
| CIF Price | ✓ | ✓ | ✓ | ✓ |
| **Tag Price** | ✗ | ✗ | ✓ | ✓ |
| **FR Price** | ✗ | ✗ | ✓ | ✓ |
| **Sell Price** | ✗ | ✗ | ✓ | ✓ |
| **Discount %** | ✗ | ✗ | ✓ | ✓ |
| **After Discount** | ✗ | ✗ | ✓ | ✓ |

> **Lý do:** User và Viewer chỉ cần thấy giá thành (HPUSA, CIF). Giá bán, tag, FR là thông tin nhạy cảm dành cho quản lý.

---

## 5. SƠ ĐỒ DỮ LIỆU (Entity Relationships)

```mermaid
erDiagram
    APP_USERS {
        uuid id PK
        text email
        text full_name
        text role "admin|manager|user|viewer"
        bool is_active
    }

    INVOICE_HEADERS {
        uuid id PK
        text invoice_no "GENERATED tự động"
        text po_number
        text customer_name
        date invoice_date
        enum status "draft|pending_approval|approved|invoiced"
        bool is_locked "chỉ trigger mới set true"
        uuid metal_rate_id FK
        uuid pricing_rule_id FK
        uuid created_by FK
        jsonb snapshot_data "chỉ trigger mới ghi"
    }

    INVOICE_ITEMS {
        uuid id PK
        uuid invoice_id FK
        int line_no
        text sku_jwmold
        int qty_pcs
        numeric weight_total_gr
        numeric weight_gold_actual_gr
        numeric weight_no_gem_gr
        text metal_type
        numeric gold_value_usd
        numeric hpusa
        numeric cif_price
        numeric tag_price
        numeric fr_price
        numeric sell_price
    }

    ITEM_GEM_DETAILS {
        uuid id PK
        uuid invoice_item_id FK
        text gem_type
        text shape
        numeric weight_ct_after
        numeric unit_price_per_ct
        numeric weight_gr "GENERATED = ct×0.2"
        numeric total_price "GENERATED"
        numeric total_setting_fee "GENERATED"
    }

    DAILY_METAL_RATES {
        uuid id PK
        date rate_date "UNIQUE"
        numeric gold_24k
        numeric gold_18kw
        numeric gold_18ky
        numeric platinum
        numeric silver
        numeric palladium
    }

    PRICING_RULES {
        uuid id PK
        text name
        numeric cif_multiplier
        numeric tag_multiplier
        numeric fr_multiplier
        numeric casting_loss_pct
        bool is_active
    }

    BOM_PRODUCTS {
        uuid id PK
        text sku_jwmold "UNIQUE"
        text description
        numeric labor_fee
        numeric casting_fee
        bool is_active
    }

    AUDIT_LOGS {
        uuid id PK
        uuid invoice_id FK
        text action
        enum from_status
        enum to_status
        uuid changed_by FK
        text note
    }

    APP_USERS ||--o{ INVOICE_HEADERS : "tạo"
    INVOICE_HEADERS ||--|{ INVOICE_ITEMS : "có"
    INVOICE_ITEMS ||--o{ ITEM_GEM_DETAILS : "có đá"
    INVOICE_HEADERS }o--|| DAILY_METAL_RATES : "dùng rate"
    INVOICE_HEADERS }o--|| PRICING_RULES : "dùng rule"
    INVOICE_ITEMS }o--|| BOM_PRODUCTS : "tham chiếu SKU"
    INVOICE_HEADERS ||--o{ AUDIT_LOGS : "lịch sử"
    APP_USERS ||--o{ AUDIT_LOGS : "thực hiện"
```

---

## 6. LUỒNG IMPORT EXCEL

```mermaid
flowchart LR
    A["📄 File Excel\nJM Format\n(cột A–L)"] --> B["📋 Parse\nSheetJS"]
    B --> C{"Validate\ntừng row"}
    C -->|"SKU tồn tại\nqty ≥ 1\nweight hợp lệ"| D["✅ Valid Rows"]
    C -->|"SKU sai\ntrống qty\nv.v."| E["❌ Error Rows"]
    D --> F["Preview\n& Confirm"]
    E --> F
    F -->|"Import N rows\nhợp lệ"| G["INSERT\ninvoice_items"]
    G --> H["⚙️ Tính lại giá\ncho từng item"]
    H --> I["✓ Done"]
    E -->|"Hiện bảng lỗi\nRow | SKU | Lỗi"| F
```

**Quy tắc:**
- Invalid rows **không** chặn valid rows — partial import OK
- Fees (labor, casting...) **tự động copy** từ `bom_products`
- `line_no` **tự động gán** server-side (MAX + 1)

---

## 7. JM FORM VIEW — 15 CỘT

| # | Cột | Ghi chú |
|---|-----|---------|
| 1 | **No.** | Số thứ tự — sticky |
| 2 | **SKU JWMold** | Nền vàng `#FEF3C7` — sticky |
| 3 | Qty Pcs | |
| 4 | Description | |
| 5 | Class | |
| 6 | Sub Class | |
| 7 | **Notes** | 🔴 Đỏ nếu chứa "ba sao" |
| 8 | Wt Total (g) | |
| 9 | **Wt Gold (g)** | Nền vàng nhạt `#FFFBEB` |
| 10 | Wt No Gem (g) | Tính tự động |
| 11 | Metal Type | |
| 12 | Gold Value USD | Tính tự động |
| 13 | **HPUSA** | Tính tự động, in đậm |
| 14 | CIF Price | Tính tự động |
| 15 | **Tag Price** | ⚠️ Chỉ manager/admin |

> **FR Price** không hiển thị trong JM View — chỉ có trong Detail View và Export.

---

## 8. LUỒNG NGHIỆP VỤ ĐẦY ĐỦ

```mermaid
sequenceDiagram
    actor U as User
    actor M as Manager
    actor A as Admin
    participant SYS as V-Invoice System
    participant DB as Supabase DB

    U->>SYS: Tạo Invoice mới (PO, customer, date)
    SYS->>DB: INSERT invoice_headers (status=draft)

    U->>SYS: Import Excel hoặc Add Items
    SYS->>DB: INSERT invoice_items
    DB-->>SYS: Trigger tính giá (gold_value, hpusa, cif...)
    SYS-->>U: Hiển thị JM Form View (15 cột)

    U->>SYS: Submit for Approval
    SYS->>DB: UPDATE status → pending_approval
    DB->>DB: INSERT audit_logs

    M->>SYS: Review & Approve
    SYS->>DB: UPDATE status → approved
    DB->>DB: INSERT audit_logs

    A->>SYS: Mark as Invoiced
    SYS->>DB: UPDATE status → invoiced
    DB->>DB: 🔒 TRIGGER: snapshot + is_locked=true
    DB-->>A: Invoice frozen vĩnh viễn

    A->>SYS: Export / Print
    SYS-->>A: Excel (theo role) / PDF A4 landscape
```

---

## 9. CÁC RÀNG BUỘC NGHIỆP VỤ QUAN TRỌNG

| # | Quy tắc | Chi tiết |
|---|---------|---------|
| 🔒 | **Invoice locked = bất khả xâm phạm** | Sau khi `invoiced`, không ai có thể sửa — kể cả admin |
| 📸 | **Snapshot bất biến** | Khi `invoiced`, PostgreSQL trigger tự lưu toàn bộ dữ liệu vào snapshot |
| ⚙️ | **Tính giá server-side** | Giá không bao giờ tính ở client — luôn server tính sau mỗi thay đổi |
| 💎 | **GENERATED columns** | `weight_gr`, `total_price`, `total_setting_fee` của đá quý do PostgreSQL tính |
| 🗂️ | **1 active pricing rule** | Tại một thời điểm chỉ có 1 pricing rule active |
| 🚫 | **Không xóa metal rate đang dùng** | Nếu invoice đang ref → 409 Conflict |
| 👤 | **Role trong DB, không trong JWT** | Role lấy từ `app_users.role`, không phải từ Supabase JWT claims |

---

## 10. TRANG ADMIN

| Trang | Mô tả | Quyền |
|-------|-------|-------|
| `/admin/metal-rates` | CRUD tỷ giá vàng/bạch kim theo ngày | Admin |
| `/admin/pricing-rules` | CRUD bộ nhân CIF/Tag/FR + casting loss | Admin |
| `/admin/products` | Quản lý danh mục SKU (bom_products) | Admin |
| `/admin/users` | Quản lý tài khoản và phân quyền | Admin |
| `/import` | Import Excel JM format vào invoice | Admin/Manager/User |
| `/dashboard` | Thống kê tổng quan + recent invoices | Tất cả |

---

## 11. STACK KỸ THUẬT

```
Browser
  └── Next.js 14 (App Router + TypeScript)
      ├── Thiết kế: CSS Variables, Cormorant Garamond, Jost, JetBrains Mono
      ├── Icons: Font Awesome 6
      └── Excel: SheetJS (xlsx)

Server
  └── Next.js API Routes (serverless)
      └── Supabase Service Role (bypass RLS)

Database
  └── Supabase PostgreSQL
      ├── RLS (Row Level Security)
      ├── Realtime (invoice_items, item_gem_details)
      ├── Trigger (trg_snapshot_invoice)
      └── RPC Functions (get_invoice_list, get_dashboard_stats...)

Deploy
  └── Vercel (Next.js) + Supabase (PostgreSQL)
```
