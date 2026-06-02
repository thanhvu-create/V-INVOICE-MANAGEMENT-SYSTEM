# Invoice Workflow — State Machine & Lock Rules

> **Phạm vi:** Status transitions, lock guard, snapshot trigger, audit log
> **Đọc trước:** CLAUDE.md section 5

---

## 1. STATUS STATE MACHINE

```
          [user]              [manager/admin]       [admin]
draft ──────────────> pending_approval ──────────> approved ──────────> invoiced
  ↑                          │                        │                    │
  └──────────────────────────┘                        │                    │
            [manager/admin reject]                    │                    │
                                                      ↓                    │
                                            pending_approval               │
                                         [admin rollback]                  │
                                                                    FROZEN (is_locked=true)
```

### ALLOWED_TRANSITIONS Map

```typescript
// viewer role has NO transitions — read-only access
const ALLOWED_TRANSITIONS: Record<string, Record<string, string[]>> = {
  user: {
    draft: ['pending_approval'],
  },
  manager: {
    pending_approval: ['approved', 'draft'],
  },
  admin: {
    draft:            ['pending_approval'],
    pending_approval: ['approved', 'draft'],
    approved:         ['invoiced', 'pending_approval'],
  },
  viewer: {},  // no transitions allowed
}

function canTransition(role: string, from: string, to: string): boolean {
  return ALLOWED_TRANSITIONS[role]?.[from]?.includes(to) ?? false
}
```

---

## 2. STATUS TRANSITION API

**Endpoint:** `POST /api/invoices/[id]/status`

```typescript
// Request body:
{ to_status: string, note?: string }

// Server logic:
// 1. GET header → check is_locked (403 nếu locked)
// 2. Lấy current status từ header
// 3. Lấy role từ session (via app_users lookup, NOT JWT claims)
// 4. canTransition(role, current, to_status) → 422 nếu false
// 5. UPDATE invoice_headers SET status = to_status, updated_at = now()
//    (trigger fires automatically when status → 'invoiced')
// 6. INSERT audit_logs { action: 'status_change', from_status, to_status, changed_by, note }

// Response: { success: true, data: { status: newStatus } }
```

### Validation Errors

| Code | Condition |
|------|-----------|
| 403 | `is_locked = true` |
| 403 | User không có quyền transition này |
| 422 | Transition không hợp lệ theo ALLOWED_TRANSITIONS |
| 404 | Invoice không tìm thấy |

---

## 3. IS_LOCKED GUARD — CRITICAL

```typescript
// PHẢI check TRƯỚC MỌI write operation (items, gems, header update):
const { data: header } = await db.from('invoice_headers').select('is_locked, status').eq('id', invoiceId).single()
if (header?.is_locked) {
  return NextResponse.json({ success: false, message: 'Invoice is locked (invoiced status).' }, { status: 403 })
}
```

**Applies to:**
- PATCH invoice header fields
- POST/PUT/DELETE invoice_items
- POST/PUT/DELETE item_gem_details
- PATCH status (ngoại lệ: invoiced → không thể transition đi đâu nữa)

**Does NOT apply to:**
- GET (read operations)
- Generating PDF/print

---

## 3b. STATUS-BASED EDIT GUARD — CRITICAL (Gap từ [THAM KHẢO] §1)

Ngoài `is_locked`, các write operations phải check **status + role + ownership** theo bảng:

| Status | viewer | user | manager | admin |
|--------|--------|------|---------|-------|
| `draft` | ✗ | ✓ (own only) | ✓ (all) | ✓ (all) |
| `pending_approval` | ✗ | ✗ | ✓ | ✓ |
| `approved` | ✗ | ✗ | ✗ | ✗ |
| `invoiced` | ✗ | ✗ | ✗ | ✗ (is_locked) |

**"own only"** = invoice_headers.created_by = ctx.userId

---

### Helper function — đặt tại `lib/auth/editGuard.ts`

```typescript
// lib/auth/editGuard.ts
// Import và dùng trong TẤT CẢ write API routes cho invoices

export interface EditGuardContext {
  isLocked:    boolean
  status:      string
  role:        string
  createdBy:   string   // invoice_headers.created_by (app_users.id)
  userId:      string   // current user's app_users.id
}

/**
 * Returns error message string nếu không được phép edit, null nếu được phép.
 * Gọi sau khi đã load invoice header.
 */
export function checkEditPermission(ctx: EditGuardContext): string | null {
  // 1. Invoiced — is_locked từ trigger
  if (ctx.isLocked) {
    return 'Invoice is locked (invoiced). No changes allowed.'
  }

  // 2. Approved — không ai được edit
  if (ctx.status === 'approved') {
    return 'Invoice is approved and cannot be modified. Ask a manager to return it to pending.'
  }

  // 3. Pending Approval — chỉ manager/admin
  if (ctx.status === 'pending_approval' && ctx.role === 'user') {
    return 'Invoice is pending approval. Only managers and admins can make changes.'
  }

  // 4. Draft — user chỉ edit invoice của mình
  if (ctx.status === 'draft' && ctx.role === 'user' && ctx.createdBy !== ctx.userId) {
    return 'You can only edit your own draft invoices.'
  }

  // 5. viewer — không bao giờ edit
  if (ctx.role === 'viewer') {
    return 'Viewers cannot make changes.'
  }

  return null // allowed
}
```

---

### Dùng trong route handlers

```typescript
// Trong bất kỳ write route nào (PATCH/POST/DELETE cho items, gems, header):

import { checkEditPermission } from '@/lib/auth/editGuard'

// Load header (luôn cần is_locked + status + created_by):
const { data: header } = await db
  .from('invoice_headers')
  .select('is_locked, status, created_by')
  .eq('id', params.id)
  .single()

if (!header) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 })

const editError = checkEditPermission({
  isLocked:  header.is_locked,
  status:    header.status,
  role:      ctx.role,
  createdBy: header.created_by,
  userId:    ctx.userId,
})
if (editError) {
  return NextResponse.json({ success: false, message: editError }, { status: 403 })
}
```

**Áp dụng cho tất cả routes:**
- `PATCH  /api/invoices/[id]`
- `POST   /api/invoices/[id]/items`
- `PATCH  /api/invoices/[id]/items/[itemId]`
- `DELETE /api/invoices/[id]/items/[itemId]`
- `POST   /api/invoices/[id]/items/[itemId]/gems`
- `PATCH  /api/invoices/[id]/items/[itemId]/gems/[gemId]`
- `DELETE /api/invoices/[id]/items/[itemId]/gems/[gemId]`

**KHÔNG áp dụng cho:**
- GET (read-only)
- `POST /api/invoices/[id]/status` — có logic riêng (ALLOWED_TRANSITIONS)
- Print / Export

---

### UI guard — `app/(dashboard)/invoices/[id]/page.tsx`

```typescript
// Thay thế:
// const canEdit = canDo('edit')

// Bằng:
const canEdit = canDo('edit')
  && !header.is_locked
  && header.status !== 'approved'
  && !(header.status === 'pending_approval' && user.role === 'user')
  && !(header.status === 'draft' && user.role === 'user' && header.created_by !== user.id)

// Truyền canEdit vào: JMFormView, DetailView, ItemCard, AddItemModal
// Khi canEdit = false → ẩn edit buttons, inline inputs, Add/Delete controls
```

---

### Locked banner theo status

```tsx
// Thêm banner phía trên invoice (ngoài banner is_locked đã có):
{header.status === 'approved' && !header.is_locked && (
  <div style={{ background: 'var(--color-success)', color: '#fff', padding: '6px 16px', textAlign: 'center', fontSize: 'var(--text-xs)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1rem' }}>
    <i className="fa-solid fa-circle-check" style={{ marginRight: 6 }} />
    Approved — Read Only · Print and Export available
  </div>
)}

{header.status === 'pending_approval' && user.role === 'user' && (
  <div style={{ background: 'var(--color-warning)', color: '#fff', padding: '6px 16px', textAlign: 'center', fontSize: 'var(--text-xs)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1rem' }}>
    <i className="fa-solid fa-clock" style={{ marginRight: 6 }} />
    Pending Approval — Awaiting manager review
  </div>
)}
```

---

### Error responses HTTP 403

| Tình huống | Message |
|-----------|---------|
| is_locked (invoiced) | `"Invoice is locked (invoiced). No changes allowed."` |
| approved | `"Invoice is approved and cannot be modified. Ask a manager to return it to pending."` |
| pending + user role | `"Invoice is pending approval. Only managers and admins can make changes."` |
| draft + user + not owner | `"You can only edit your own draft invoices."` |
| viewer | `"Viewers cannot make changes."` |

---

## 4. SNAPSHOT TRIGGER (PostgreSQL)

```sql
-- Tự động chạy khi status → 'invoiced'
CREATE TRIGGER trg_snapshot_invoice
BEFORE UPDATE ON invoice_headers
FOR EACH ROW EXECUTE FUNCTION snapshot_invoice_on_invoiced();

-- Function:
-- 1. IF NEW.status = 'invoiced' AND OLD.status != 'invoiced':
-- 2.   Collect items + gems + rate + rule
-- 3.   SET NEW.snapshot_data = jsonb_build_object(...)
-- 4.   SET NEW.snapshot_at  = now()
-- 5.   SET NEW.is_locked    = true
```

**QUAN TRỌNG:**
- `snapshot_data` chỉ được ghi bởi trigger — KHÔNG bao giờ ghi từ application code
- `is_locked` chỉ được set `true` bởi trigger — KHÔNG set từ application
- Khi đọc invoiced invoice → dùng `snapshot_data` thay vì join live tables

---

## 5. AUDIT LOG

**Table:** `audit_logs`

```typescript
// Insert sau mỗi status transition:
await db.from('audit_logs').insert({
  invoice_id:  invoiceId,
  action:      'status_change',     // required field
  from_status: currentStatus,
  to_status:   newStatus,
  changed_by:  userId,              // app_users.id (UUID)
  note:        note || null,
  metadata:    null,                // optional extra context
  // created_at: DEFAULT now()
})
```

**API:** `GET /api/invoices/[id]/audit`

```typescript
// Response (joined with app_users):
[{
  id, invoice_id, action, from_status, to_status,
  changed_by, note, metadata, created_at,
  app_users: { id, full_name, email, role }
}]
// ORDER BY created_at ASC (oldest first — timeline view)
```

---

## 6. WORKFLOW BAR UI

### Desktop (≥ 768px) — Horizontal

```
[DRAFT ✓]  ──────  [PENDING ✓]  ──────  [APPROVED →]  ──────  [INVOICED]
  button              button               button (active)       button
```

### Mobile (< 768px) — Vertical Stack

```
[DRAFT ✓]
    │
[PENDING ✓]
    │
[APPROVED →]  ← current step
    │
[INVOICED]
```

### Step States

```typescript
type StepState = 'completed' | 'current' | 'upcoming'

// Visual mapping:
// completed: color = --color-success, icon = fa-check
// current:   color = --text-primary, border = 2px solid --border-strong, icon = fa-arrow-right
// upcoming:  color = --text-muted, icon = (number)
```

### Action Buttons (bên dưới workflow bar)

```typescript
// Render dựa trên role + current status:
function getAvailableActions(role: string, status: string, isLocked: boolean): Action[] {
  if (isLocked) return []  // Không action nào
  const transitions = ALLOWED_TRANSITIONS[role]?.[status] ?? []
  return transitions.map(to => ({
    label: getActionLabel(status, to),
    toStatus: to,
    variant: to === 'draft' ? 'outline-danger' : 'primary',
  }))
}

function getActionLabel(from: string, to: string): string {
  if (from === 'draft' && to === 'pending_approval') return 'Submit for Approval'
  if (from === 'pending_approval' && to === 'approved') return 'Approve'
  if (from === 'pending_approval' && to === 'draft') return 'Return to Draft'
  if (from === 'approved' && to === 'invoiced') return 'Mark as Invoiced'
  if (from === 'approved' && to === 'pending_approval') return 'Return for Review'
  return to.replace(/_/g, ' ')
}
```

---

## 7. STATUS BADGE COMPONENT

```tsx
// CORRECTED: approved uses --color-success (green), NOT --color-info (blue)
const STATUS_CONFIG = {
  draft:            { label: 'Draft',            color: 'var(--text-muted)' },
  pending_approval: { label: 'Pending Approval', color: 'var(--color-warning)' },
  approved:         { label: 'Approved',         color: 'var(--color-success)' },
  invoiced:         { label: 'Invoiced',         color: 'var(--color-success)', filled: true },
}

// Badge style:
// border: 1px solid currentColor
// border-radius: 0
// padding: 2px 8px
// font-size: var(--text-xs)
// text-transform: uppercase
// letter-spacing: 0.08em
```

---

## 8. LOADING STATES & UX

```typescript
// Khi submit status transition:
// 1. Disable action button + show spinner
// 2. POST to API
// 3. Success → update UI status + workflow bar (optimistic hoặc re-fetch)
// 4. Error → show error message + re-enable button

// Confirm trước khi:
// - Submit for Approval: không cần confirm
// - Approve: confirm "Approve invoice [PO]?"
// - Return to Draft: confirm "Return to draft? This will require re-approval."
// - Mark as Invoiced: confirm MẠNH "This will LOCK the invoice permanently. Continue?"
// - Không dùng window.confirm() — dùng custom ConfirmDialog component
```

---

## 9. INVOICE LIST — STATUS FILTER

```typescript
// Filter UI: dropdown hoặc tab group
const STATUS_FILTERS = ['all', 'draft', 'pending_approval', 'approved', 'invoiced']

// API query:
if (status && status !== 'all') {
  query = query.eq('status', status)
}
```

---

## 10. INVOICE STATUS BANNERS (Toàn bộ trạng thái)

Mỗi status có banner riêng ở đầu trang invoice detail. Thứ tự check:

```tsx
{/* 1. INVOICED — đen, lock icon */}
{header.is_locked && (
  <div style={{ background: '#1A1814', color: '#FAFAF7', padding: '8px 16px', textAlign: 'center', fontSize: 'var(--text-xs)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '1rem' }}>
    <i className="fa-solid fa-lock" style={{ marginRight: 6 }} />
    Invoiced — This invoice is locked and cannot be modified
  </div>
)}

{/* 2. APPROVED — xanh lá, read-only */}
{header.status === 'approved' && !header.is_locked && (
  <div style={{ background: 'var(--color-success)', color: '#fff', padding: '6px 16px', textAlign: 'center', fontSize: 'var(--text-xs)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1rem' }}>
    <i className="fa-solid fa-circle-check" style={{ marginRight: 6 }} />
    Approved — Read only · Print and Export are available
  </div>
)}

{/* 3. PENDING — amber, chỉ hiện với user thường */}
{header.status === 'pending_approval' && user.role === 'user' && (
  <div style={{ background: 'var(--color-warning)', color: '#fff', padding: '6px 16px', textAlign: 'center', fontSize: 'var(--text-xs)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1rem' }}>
    <i className="fa-solid fa-clock" style={{ marginRight: 6 }} />
    Pending Approval — Awaiting manager review · No changes allowed
  </div>
)}
```

**Mapping canEdit → ẩn gì:**
```
canEdit = false  →  ẩn: Add Item, Import, inline edit cells, Edit button, Delete button
canEdit = false  →  giữ: Export, Print, Audit timeline, Read-only display
```

---

## 11. AUDIT LOG UI

```
┌─── Lịch sử trạng thái ────────────────────────────────────────┐
│                                                                │
│  ● DRAFT                                                       │
│    John Doe · 2026-05-20 09:15                                │
│                                                                │
│  ● PENDING APPROVAL                                            │
│    Jane Doe · 2026-05-20 10:30 · "Ready for review"           │
│                                                                │
│  ● APPROVED                                                    │
│    Manager · 2026-05-21 14:00                                 │
│                                                                │
│  ● INVOICED  🔒                                               │
│    Admin · 2026-05-22 16:45 · "Final approval"                │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

```tsx
// Timeline component:
// - Vertical line connecting dots
// - Dot color: STATUS_CONFIG[status].color
// - timestamp: format 'YYYY-MM-DD HH:mm'
// - note (nếu có): italic, text-secondary
// - Last item = is_locked → show lock icon
```
