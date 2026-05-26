# Toast Notifications — Kế hoạch triển khai
> **Cập nhật:** 2026-05-26
> **Trạng thái:** PLAN — chưa implement
> **Mục tiêu:** Thống nhất 100% feedback UX về toast system, loại bỏ `alert()` native browser

---

## 1. HIỆN TRẠNG (Audit)

### ✅ Đã có
- **`/components/ui/Toast.tsx`** — Component + Provider + global `toast()` function
  - `toast(message, 'success' | 'error' | 'warn')`
  - Auto-dismiss sau 3.5s, icon FA6, close button, animation
- **`WorkflowBar.tsx`** — Đã dùng toast cho status transitions

### ❌ Vấn đề
| File | Vấn đề |
|------|--------|
| `app/(dashboard)/invoices/page.tsx` | Dùng `alert()` cho delete invoice |
| `app/(dashboard)/admin/metal-rates/page.tsx` | Dùng `alert()` cho save/delete |
| `app/(dashboard)/admin/users/page.tsx` | Dùng `alert()` cho save/delete |
| `app/(dashboard)/admin/products/page.tsx` | Dùng `alert()` cho save/delete |
| `app/(dashboard)/admin/pricing-rules/page.tsx` | Dùng `alert()` cho save/delete |
| `app/(dashboard)/import/page.tsx` | Full-page states, không dùng toast |

**Kết luận:** Infrastructure đã sẵn sàng, chỉ cần _thay thế_ `alert()` bằng `toast()` và _bổ sung_ success toasts còn thiếu.

---

## 2. TIÊU CHUẨN TOAST (Convention)

### Loại toast & khi nào dùng

| Type | Màu | Icon | Khi dùng |
|------|-----|------|----------|
| `success` | `--color-success` (green) | `fa-circle-check` | CRUD thành công, import done |
| `error` | `--color-danger` (red) | `fa-circle-xmark` | API error, validation fail, 403/409 |
| `warn` | `--color-warning` (amber) | `fa-triangle-exclamation` | Cảnh báo (VD: rate đang được dùng) |

### Message convention

```typescript
// ✅ Ngắn gọn, rõ action:
toast('Metal rate saved.', 'success')
toast('Invoice deleted.', 'success')
toast('Cannot delete: 3 invoice(s) reference this rate.', 'error')
toast('Invoice locked — no changes allowed.', 'warn')

// ❌ Tránh:
toast('Operation completed successfully!', 'success')  // quá generic
toast('Error: something went wrong', 'error')           // không rõ lý do
```

### Inline error vs Toast — phân biệt rõ

| Tình huống | Cách xử lý |
|-----------|-----------|
| Form validation (field trống, sai format) | **Inline** trong modal/form — bên dưới field |
| API error khi submit (409 conflict, 403 locked) | **Toast error** — không đóng modal |
| Network/server error (500, timeout) | **Toast error** |
| CRUD success (save, delete, update) | **Toast success** — đóng modal |
| Status transition success/fail | **Toast** (đã có trong WorkflowBar) |

---

## 3. NÂNG CẤP TOAST COMPONENT

### 3a. Thêm type `info`

```typescript
// Hiện tại: 'success' | 'error' | 'warn'
// Thêm:     'info'

// Dùng khi: thông báo trung tính (VD: "Recalculating prices...")
type ToastType = 'success' | 'error' | 'warn' | 'info'

// info style:
// color: var(--color-info), icon: fa-circle-info
```

### 3b. Thêm duration tùy chỉnh

```typescript
// Hiện tại: hardcode 3500ms
// Nâng cấp:
toast('Invoice deleted.', 'success')               // default 3500ms
toast('Recalculating 12 items...', 'info', 6000)   // custom duration
toast('Server error. Please retry.', 'error', 0)   // 0 = persistent (không auto-dismiss)
```

### 3c. Thêm action button (optional, low priority)

```typescript
// Dùng cho undo hoặc link to detail:
toast('Invoice deleted.', 'success', 5000, {
  actionLabel: 'View invoices',
  onAction: () => router.push('/invoices'),
})
```
> **Note:** 3c là nice-to-have — chỉ implement nếu cần.

---

## 4. DANH SÁCH THAY ĐỔI CỤ THỂ

### Phase 1 — Loại bỏ `alert()` (Priority: HIGH)

#### 4.1 Invoice List (`app/(dashboard)/invoices/page.tsx`)

```typescript
// ❌ Trước:
alert(json.message || 'Error deleting invoice')

// ✅ Sau:
toast('Invoice deleted.', 'success')
// hoặc nếu error:
toast(json.message || 'Failed to delete invoice.', 'error')
```

**Triggers cần cover:**
- Delete invoice: success + error
- Bất kỳ `alert()` nào khác trong file

---

#### 4.2 Metal Rates (`app/(dashboard)/admin/metal-rates/page.tsx`)

```typescript
// ✅ Toast map cho trang này:
// Save new rate (POST success)   → toast('Metal rate added.', 'success')
// Save new rate (409 duplicate)  → toast('Rate for this date already exists.', 'error')
// Update rate (PATCH success)    → toast('Metal rate updated.', 'success')
// Delete rate (success)          → toast('Metal rate deleted.', 'success')
// Delete rate (409 referenced)   → toast('Cannot delete: N invoice(s) use this rate.', 'error')
// Close modal on success (save)  → đóng modal SAU khi toast
```

---

#### 4.3 Users (`app/(dashboard)/admin/users/page.tsx`)

```typescript
// ✅ Toast map:
// Invite/create user (success)   → toast('User invited.', 'success')
// Update role/status (success)   → toast('User updated.', 'success')
// Deactivate user (success)      → toast('User deactivated.', 'success')
// Cannot demote self             → toast('You cannot change your own role.', 'error')
// Any API error                  → toast(json.message || 'Error.', 'error')
```

---

#### 4.4 Products (`app/(dashboard)/admin/products/page.tsx`)

```typescript
// ✅ Toast map:
// Add product (success)          → toast('Product added.', 'success')
// Update product (success)       → toast('Product updated.', 'success')
// Delete product (success)       → toast('Product deleted.', 'success')
// Delete product (FK conflict)   → toast('Cannot delete: product is referenced by invoices.', 'error')
// Any API error                  → toast(json.message || 'Error.', 'error')
```

---

#### 4.5 Pricing Rules (`app/(dashboard)/admin/pricing-rules/page.tsx`)

```typescript
// ✅ Toast map:
// Add rule (success)             → toast('Pricing rule added.', 'success')
// Update rule (success)          → toast('Pricing rule updated.', 'success')
// Set as active (success)        → toast('Pricing rule activated.', 'success')
// Delete rule (success)          → toast('Pricing rule deleted.', 'success')
// Any API error                  → toast(json.message || 'Error.', 'error')
```

---

### Phase 2 — Import page (`app/(dashboard)/import/page.tsx`) (Priority: MEDIUM)

Import page dùng full-page states (idle → parsing → preview → importing → done) — đây là UX đúng cho flow nhiều bước. Không thay toàn bộ bằng toast, nhưng **bổ sung** toast ở các điểm chuyển quan trọng:

```typescript
// Sau khi import thành công (stage: 'done'):
toast(`Imported ${imported} items successfully.`, 'success')

// Nếu API trả về lỗi khi save:
toast('Import failed. Please try again.', 'error')

// Partial import (valid rows imported, errors existed):
toast(`${imported} items imported. ${errors.length} rows skipped.`, 'warn')
```

Giữ nguyên full-page preview/error table — toast chỉ là thông báo bổ sung.

---

### Phase 3 — Invoice Detail mutations (Priority: MEDIUM)

Các inline edit trong Detail View cần feedback nhanh:

```typescript
// Sau khi save item field (PATCH success):
toast('Item saved.', 'success')

// Sau khi save item field (error):
toast('Failed to save. Please retry.', 'error')

// Sau khi delete item:
toast('Item removed.', 'success')

// Sau khi add/edit/delete gem:
toast('Gem updated.', 'success')

// Locked invoice write attempt:
toast('Invoice is locked — no changes allowed.', 'warn')
```

---

### Phase 4 — Global network error handler (Priority: LOW)

```typescript
// Wrapper utility để mọi fetch đều có fallback toast:
async function apiCall<T>(
  fn: () => Promise<Response>,
  successMsg?: string
): Promise<T | null> {
  try {
    const res = await fn()
    const json = await res.json()
    if (!res.ok || !json.success) {
      toast(json.message || 'An error occurred.', 'error')
      return null
    }
    if (successMsg) toast(successMsg, 'success')
    return json.data as T
  } catch {
    toast('Network error. Please check your connection.', 'error')
    return null
  }
}
```

---

## 5. THỨ TỰ TRIỂN KHAI

```
Sprint A (Phase 1) — ✅ DONE 2026-05-26:
  [x] Nâng cấp Toast.tsx: thêm type 'info' + custom duration + duration=0 persistent
  [x] invoices/page.tsx — replace alert() → toast() + success toast on delete
  [x] admin/metal-rates/page.tsx — replace alert() → toast() + success toasts
  [x] admin/users/page.tsx — replace alert() → toast() + success toasts
  [x] admin/products/page.tsx — replace alert() → toast() + success toasts
  [x] admin/pricing-rules/page.tsx — replace alert() → toast() + success toasts

Sprint B (Phase 2) — ✅ DONE 2026-05-26:
  [x] import/page.tsx — toast success / warn (partial) / error tại handleImport()
  [ ] Invoice Detail inline edit — chưa implement feature, add toast khi build

Sprint C (Phase 3) — ✅ DONE 2026-05-26:
  [x] lib/api.ts — apiCall() wrapper với auto toast error + optional success toast
```

---

## 6. KHÔNG THAY ĐỔI

- **WorkflowBar.tsx** — Đã dùng toast() đúng chuẩn, giữ nguyên
- **Inline form validation errors** — Giữ nguyên inline (bên dưới field)
- **Import preview table / error table** — Giữ nguyên full-page state, chỉ thêm toast ở điểm kết thúc
- **Confirm dialogs** — Giữ custom ConfirmDialog component (không dùng window.confirm)

---

## 7. KIỂM TRA SAU KHI TRIỂN KHAI

```
[ ] Không còn alert() native nào trong codebase (grep "alert(")
[ ] Mọi CRUD thành công đều có success toast
[ ] Mọi API error đều có error toast với message rõ ràng
[ ] Toast không che UI quan trọng (positioned bottom-right hoặc bottom-center)
[ ] Modal đóng TRƯỚC hoặc SAU toast (nhất quán)
[ ] Auto-dismiss 3.5s — không annoying
[ ] Persistent toast (duration=0) chỉ dùng cho critical errors
```
