# Thiết kế — Lớp "Loại đặc biệt" (Metal Type Registry)

**Ngày:** 2026-07-24
**Trạng thái:** Đã duyệt thiết kế, chờ review spec → lên plan
**Liên quan:** [system-overview](../../../.claude/rules/system-overview-2026-06-10.md) §5 Pricing, [JM-FORM logic](../../../.claude/rules/JM-FORM-SUMMARY-logic-flow.md) §2

---

## 1. Bối cảnh & vấn đề

Engine định giá vàng ([`lib/formulas/pricing.ts`](../../../lib/formulas/pricing.ts)) nhận diện loại kim loại bằng cách cắt **2 ký tự đầu** của `loai_vang` rồi `switch`:

- `18KR / 18KY / 18KW / 18KWY / 18KG` → `"18"` → cùng giá tuổi 18K (màu bị bỏ qua).
- `24K → "24"`, `PT950/PT850 → "PT"`, `AG → "AG"` — đều đúng.
- **`SV925 → "SV"` → không khớp case nào → trả `null` → `tien_vang = 0`.** Lỗi âm thầm: mọi sản phẩm bạc 925 ra $0.

Dữ liệu thực tế (SPHT import) phát sinh nhiều mã ngoại lệ: `SV925`, và các biến thể màu `18KW`, `18KY`, … mà nghiệp vụ có thể muốn định giá **khác** giá tuổi gốc. Cách xử lý cũ luôn quy `18KW → 18K`, không cho phép giá riêng.

**Nút "Thêm karat" hiện có trong NVL Prices là đồ giả:** chỉ lưu `localStorage` + vẽ thêm card hiển thị, KHÔNG vào DB, KHÔNG ảnh hưởng engine, KHÔNG snapshot. Gõ "SV925" vào đó card hiện `—` và invoice vẫn ra $0.

## 2. Mục tiêu & phạm vi

**Mục tiêu:** Cho người dùng khai báo giá cho các mã kim loại ngoại lệ trong NVL Prices; module invoice tra **khớp mã chính xác trước**, không có mới rơi về công thức cũ. Vá lỗi SV925 = $0.

**Non-goals (cố ý không làm — giữ gọn):**
- KHÔNG snapshot registry vào từng invoice (dùng live — xem §7).
- KHÔNG refactor lớn 3 danh sách dropdown đang lệch nhau; chỉ nạp thêm registry vào nguồn chung. Ghi chú nợ kỹ thuật.
- KHÔNG đụng công thức AG / karat hiện có.
- KHÔNG ALTER bảng `invoices`.

## 3. Data model — bảng mới `metal_types`

Một bảng duy nhất, là "registry ngoại lệ" phủ lên công thức mặc định.

```sql
CREATE TABLE IF NOT EXISTS metal_types (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT NOT NULL UNIQUE,              -- khớp loai_vang, viết HOA: '18KW', 'SV925'
  label               TEXT,                              -- tên hiển thị tuỳ chọn
  price_mode          TEXT NOT NULL CHECK (price_mode IN ('dynamic','fixed')),
  base_kind           TEXT CHECK (base_kind IN ('karat','ag','pt','pd')),  -- dùng khi dynamic
  karat               INT,                               -- dùng khi dynamic & base_kind='karat'
  surcharge_per_gram  NUMERIC DEFAULT 0,                 -- dynamic: cộng/trừ $/gram
  fixed_per_gram      NUMERIC,                           -- fixed: giá $/gram nhập thẳng
  active              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`code` lưu và so khớp dạng **UPPER(TRIM(...))**.

**Ví dụ dữ liệu:**

| code | price_mode | base_kind | karat | surcharge | fixed | Kết quả |
|---|---|---|---|---|---|---|
| SV925 | fixed | — | — | — | 3.20 | 3.20 $/gram cố định |
| 18KW | dynamic | karat | 18 | 1.50 | — | giá 18K + 1.50 |
| 18KY | dynamic | karat | 18 | 0 | — | = đúng giá 18K (khai báo tường minh) |
| SV999 | dynamic | ag | — | 0 | — | = giá AG hiện hành |

## 4. Engine — tra registry TRƯỚC, formula cũ làm fallback

Trong [`lib/formulas/pricing.ts`](../../../lib/formulas/pricing.ts) — thuần, không đụng DB:

```ts
export interface MetalTypeRule {
  code: string
  price_mode: 'dynamic' | 'fixed'
  base_kind?: 'karat' | 'ag' | 'pt' | 'pd' | null
  karat?: number | null
  surcharge_per_gram?: number | null
  fixed_per_gram?: number | null
  active?: boolean
}

export function resolveMetalPricePerGram(
  code: string,
  nvl: NVLSnapshot,
  registry: MetalTypeRule[] = []
): number | null {
  const key = (code ?? '').trim().toUpperCase()
  const rule = registry.find(r => r.active !== false && r.code.trim().toUpperCase() === key)
  if (rule) {
    if (rule.price_mode === 'fixed') {
      return rule.fixed_per_gram ?? null
    }
    // dynamic: base $/gram tái dùng goldPricePerGram cho gốc, rồi + surcharge
    let base: number | null = null
    if (rule.base_kind === 'karat' && rule.karat) base = goldPricePerGram(`${rule.karat}K`, nvl)
    else if (rule.base_kind === 'ag') base = goldPricePerGram('AG', nvl)
    else if (rule.base_kind === 'pt') base = goldPricePerGram('PT', nvl)
    else if (rule.base_kind === 'pd') base = goldPricePerGram('PD', nvl)
    if (base === null) return null
    return base + (rule.surcharge_per_gram ?? 0)
  }
  // Không có override → công thức substring cũ, GIỮ NGUYÊN
  return goldPricePerGram(code, nvl)
}
```

- `goldPricePerGram` **giữ nguyên** làm fallback (không xoá, không sửa logic).
- `recalcMetal(m, nvl, registry)` và `recalcItem(item, diamonds, nvl, template, metals, registry)` nhận thêm tham số `registry` (mặc định `[]`) và gọi `resolveMetalPricePerGram` thay vì gọi thẳng `goldPricePerGram`. Khi `registry = []`, hành vi y hệt hiện tại (backward compatible).

## 5. Recalc plumbing — nạp registry ở các đường tính lại

Registry là bảng nhỏ → nạp 1 lần mỗi request rồi truyền vào.

- [`lib/formulas/recalc-helpers.ts`](../../../lib/formulas/recalc-helpers.ts): `triggerItemRecalc` và `bulkRecalcInvoice` nạp registry (`SELECT * FROM metal_types WHERE active`) một lần, truyền vào `recalcMetal`/`recalcItem`. Đây là đường recalc trung tâm cho: items POST/PATCH, metals routes, sync-nvl.
- [`app/api/import/route.ts`](../../../app/api/import/route.ts): gọi `recalcItem(row, [], nvl, template)` trực tiếp (dòng ~122) → nạp registry và truyền vào.
- Các route gọi recalc (đã xác minh): `items/route.ts`, `items/[itemId]/route.ts`, `invoices/[id]/route.ts`, `import/route.ts`, `sync-nvl/route.ts` — đa số đi qua recalc-helpers; chỉ import gọi thẳng.

## 6. API

- **`GET /api/metal-types`** (đã tồn tại — feed dropdown): **giữ nguyên response shape** `{ success, data: string[] }`, nhưng danh sách gộp thêm `code` từ registry: `BASE ∪ registry.code ∪ mã đã dùng trong invoice_products`. Backward compatible với [ItemCard.tsx:61](../../../components/invoice/ItemCard.tsx#L61) và [AddItemModal.tsx:72](../../../components/invoice/AddItemModal.tsx#L72) (đều dùng `j.data` là `string[]`).
- **CRUD registry** (mới, theo mẫu `admin/gem-catalog`, `admin/store-markup`):
  - `GET  /api/admin/metal-types` → danh sách rows đầy đủ.
  - `POST /api/admin/metal-types` → tạo (validate: code không rỗng & unique; dynamic cần base_kind hợp lệ + karat khi base=karat; fixed cần fixed_per_gram).
  - `PATCH /api/admin/metal-types/[id]`, `DELETE /api/admin/metal-types/[id]`.

## 7. Đóng băng giá (snapshot semantics) — vẫn an toàn

- **Không thêm cột snapshot** vào `invoices`. Override *dynamic* dùng spot đã snapshot sẵn (`nvl_gold_24k`, `nvl_ag_price`, …) trong invoice.
- `tien_vang` từng item đã lưu ở `invoice_products`, chỉ tính lại khi edit/sync. Invoice **finalized bị khoá** ([editGuard](../../../lib/auth/editGuard.ts)) → không recalc → giá cũ giữ nguyên.
- Thay đổi tham số registry chỉ ảnh hưởng invoice **draft** khi có recalc tiếp theo — nhất quán với cách spot hiện hoạt động (draft dùng snapshot đến khi bấm Sync NVL).
- **Đánh đổi được chấp nhận:** tham số override là *live* (không freeze riêng từng invoice). Đủ an toàn vì finalized không recalc; đơn giản hơn nhiều so với snapshot cả bảng.

## 8. UI — NVL Prices ([admin/products/page.tsx](../../../app/(dashboard)/admin/products/page.tsx))

- Giữ nguyên: bảng spot, summary cards, lịch sử giá, các card $/gram theo công thức.
- **Thêm section "Loại đặc biệt (Override)":** bảng liệt kê registry (code, mode, gốc/phụ phí hoặc giá cố định, $/gram đã resolve, active, sửa/xoá) + modal Thêm/Sửa.
  - $/gram hiển thị tính bằng `resolveMetalPricePerGram(code, latestSnapshot, registry)`.
- **Thay** khối "Thêm karat" giả (localStorage `nvl_custom_karats`) bằng nút "Thêm loại đặc biệt" mở modal registry thật. Xoá code localStorage cosmetic.

## 9. Phân quyền

- Đọc registry (feed dropdown): `viewer+` như `/api/metal-types` hiện tại.
- Sửa registry CRUD: `manager+` (đồng bộ với `manage_rates` và các route metal-rates).

## 10. Migration (không seed data)

- File SQL idempotent `CREATE TABLE IF NOT EXISTS metal_types ...`.
- **Không seed data row** (tránh mâu thuẫn với ràng buộc validate ở §11 và tránh cắm số giá SV925 mà ta chưa biết). Việc "vá lỗi $0" xảy ra khi người dùng tự thêm dòng `SV925` (fixed + giá $/gram) trong UI NVL Prices — đúng tinh thần user-managed.
- Chạy qua Supabase (theo [project_db_access](../../../../.claude/projects/c--Users-pit008-Downloads-vinvoice/memory/project_db_access.md)).

## 11. Edge cases

| Case | Xử lý |
|---|---|
| Code trùng nhau khi thêm | UNIQUE + validate → báo lỗi |
| Override dynamic base=karat nhưng thiếu `karat` | Validate bắt buộc; nếu lọt → base null → resolver trả null → item nhập tay (không $0 ngầm) |
| Fixed thiếu `fixed_per_gram` | Validate bắt buộc |
| Mã có trong registry nhưng `active=false` | Bỏ qua override → dùng fallback formula |
| SV925 CHƯA được khai báo trong registry | Fallback `goldPricePerGram("SV925")` → `"SV"` → null → item $0 (đúng — chờ user thêm override) |
| Invoice cũ (trước thay đổi) có item SV925 | Sau khi user thêm override SV925: vẫn $0 tới khi bấm **Sync NVL** trên invoice đó (nút có sẵn) — đúng cơ chế snapshot |
| So khớp hoa/thường/space | Chuẩn hoá `UPPER(TRIM())` cả khi lưu lẫn khi tra |

## 12. Touch-point checklist

- [ ] Migration `metal_types` (SQL), KHÔNG seed data row.
- [ ] `lib/formulas/pricing.ts`: `MetalTypeRule`, `resolveMetalPricePerGram`, thêm param `registry` cho `recalcMetal` & `recalcItem` (mặc định `[]`).
- [ ] `lib/formulas/recalc-helpers.ts`: nạp registry trong `triggerItemRecalc` & `bulkRecalcInvoice`, truyền xuống.
- [ ] `app/api/import/route.ts`: nạp registry, truyền vào `recalcItem`.
- [ ] `app/api/metal-types/route.ts` GET: gộp thêm registry codes.
- [ ] `app/api/admin/metal-types/route.ts` + `[id]/route.ts`: CRUD (`manager+`).
- [ ] `app/(dashboard)/admin/products/page.tsx`: section "Loại đặc biệt" + modal; bỏ localStorage custom-karat giả.
- [ ] `types/index.ts`: interface cho MetalType (nếu cần dùng client).

## 13. Nợ kỹ thuật ghi nhận (ngoài phạm vi)

- 3 danh sách loại vàng hardcode lệch nhau: [metal-types API BASE](../../../app/api/metal-types/route.ts#L5), [ItemCard BASE_METAL_TYPES](../../../components/invoice/ItemCard.tsx#L16), [JMEditableCell METAL_TYPES](../../../components/invoice/JMEditableCell.tsx#L5). Nên gom về 1 nguồn (API). Lần này chỉ đảm bảo registry vào được nguồn API; `JMEditableCell` vẫn static — xử lý sau.
