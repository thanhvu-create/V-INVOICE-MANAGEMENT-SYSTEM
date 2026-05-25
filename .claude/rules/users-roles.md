# Users & Roles — V-Invoice

> **Phạm vi:** app_users table, 4-role system, column visibility, UserContext, canDo()
> **Admin page:** `/admin/users`

---

## 1. APP_USERS TABLE

```sql
CREATE TABLE app_users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id    UUID UNIQUE,    -- maps to auth.users.id (nullable before first login)
  email      TEXT UNIQUE NOT NULL,
  full_name  TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'user'
             CHECK (role IN ('admin', 'manager', 'user', 'viewer')),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**CRITICAL:** Roles are stored in `app_users.role`, NOT in Supabase JWT custom claims.
Every API route must look up the user's role by matching `auth.uid()` → `app_users.auth_id`.

```typescript
// Server-side role lookup pattern (in API routes):
const { data: { user } } = await supabase.auth.getUser()
const { data: appUser }  = await db
  .from('app_users')
  .select('id, role, is_active')
  .eq('auth_id', user.id)
  .single()

if (!appUser?.is_active) return 403
const role = appUser.role  // 'admin' | 'manager' | 'user' | 'viewer'
```

---

## 2. FOUR ROLES

| Role | Description |
|------|-------------|
| `admin` | Full access: create/edit/approve/invoice + admin pages + user management |
| `manager` | Create/edit invoices + approve (pending → approved/draft) |
| `user` | Create/edit own draft invoices + submit for approval |
| `viewer` | Read-only — no creates, no edits, no transitions |

### Role Permission Matrix

| Action | viewer | user | manager | admin |
|--------|--------|------|---------|-------|
| View invoice list | ✓ | ✓ | ✓ | ✓ |
| View invoice detail | ✓ | ✓ | ✓ | ✓ |
| Create new invoice | ✗ | ✓ | ✓ | ✓ |
| Edit draft invoice | ✗ | ✓ (own) | ✓ (all) | ✓ (all) |
| Submit for approval | ✗ | ✓ | ✓ | ✓ |
| Approve / Return to Draft | ✗ | ✗ | ✓ | ✓ |
| Mark as Invoiced | ✗ | ✗ | ✗ | ✓ |
| Delete invoice | ✗ | ✗ | ✗ | ✓ |
| Import Excel | ✗ | ✓ | ✓ | ✓ |
| Export Excel | ✓ | ✓ | ✓ | ✓ |
| View Metal Rates admin | ✗ | ✗ | ✗ | ✓ |
| View Pricing Rules admin | ✗ | ✗ | ✗ | ✓ |
| View Products admin | ✗ | ✗ | ✗ | ✓ |
| Manage Users | ✗ | ✗ | ✗ | ✓ |

---

## 3. COLUMN VISIBILITY BY ROLE

### Invoice List & Detail — Price Columns

| Column | viewer | user | manager | admin |
|--------|--------|------|---------|-------|
| Gold Value USD | ✓ | ✓ | ✓ | ✓ |
| HPUSA | ✓ | ✓ | ✓ | ✓ |
| CIF Price | ✓ | ✓ | ✓ | ✓ |
| Tag Price | ✗ | ✗ | ✓ | ✓ |
| FR Price | ✗ | ✗ | ✓ | ✓ |
| Sell Price | ✗ | ✗ | ✓ | ✓ |
| Discount % | ✗ | ✗ | ✓ | ✓ |
| After Discount Price | ✗ | ✗ | ✓ | ✓ |

```typescript
// Usage pattern:
const canSeePrice = role === 'manager' || role === 'admin'

// In JM Form View — hide col 15 (Tag Price) for user/viewer
// In Detail View — hide tag_price, fr_price, sell_price, discount_pct, after_discount_price
// In Export — omit those columns from xlsx for user/viewer
```

---

## 4. CANDO() ACTION SYSTEM

```typescript
// contexts/UserContext.tsx
type Action =
  | 'create'           // create new invoice
  | 'edit'             // edit invoice fields/items
  | 'delete'           // delete invoice
  | 'approve'          // approve or return to draft
  | 'invoice'          // mark as invoiced (admin only)
  | 'import'           // import Excel
  | 'export'           // export Excel (all roles)
  | 'admin'            // access admin pages
  | 'manage_users'     // manage app_users

const PERMISSIONS: Record<Role, Action[]> = {
  admin:   ['create','edit','delete','approve','invoice','import','export','admin','manage_users'],
  manager: ['create','edit','approve','import','export'],
  user:    ['create','edit','import','export'],
  viewer:  ['export'],
}

// In UserContext:
function canDo(action: Action): boolean {
  return PERMISSIONS[user.role]?.includes(action) ?? false
}

// Usage in components:
const { canDo } = useUser()
{canDo('create') && <a href="/invoices/new">New Invoice</a>}
{canDo('admin')  && <a href="/admin/metal-rates">Metal Rates</a>}
```

---

## 5. USER CONTEXT

```typescript
// contexts/UserContext.tsx
interface UserContextValue {
  user: AppUser                         // from app_users table
  canDo: (action: Action) => boolean
  loading: boolean
}

// AppUser shape (from app_users table):
interface AppUser {
  id:        string
  auth_id:   string | null
  email:     string
  full_name: string
  role:      'admin' | 'manager' | 'user' | 'viewer'
  is_active: boolean
  created_at: string
  updated_at: string
}

// Provider loads user on mount:
// 1. supabase.auth.getSession() → get auth user
// 2. SELECT * FROM app_users WHERE auth_id = session.user.id
// 3. If no app_users row → show error / redirect to login
```

---

## 6. SUPABASE CLIENTS — ROLE-AWARE PATTERN

```typescript
// lib/supabase/server.ts

// ANON key (auth-aware — for Server Components, knows the logged-in user):
export async function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: ... } }
  )
}

// SERVICE ROLE (bypasses RLS — for API Routes):
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!   // server-only env var
  )
}

// ADMIN CLIENT (same as service role, alias):
export function createAdminClient() {
  return createServiceClient()
}

// RULE: All API routes → createServiceClient()
//       Server Components → createClient() (anon, auth-aware)
//       Client Components → createBrowserClient() (anon)
```

---

## 7. ADMIN PAGE — USER MANAGEMENT

**Route:** `/admin/users`
**Visible to:** admin only

```
┌──────────────────────────────────────────────────────────────┐
│ PAGE HEADER: "Users"                                         │
│ Subtitle: "Manage team access and roles"                     │
├──────────────────────────────────────────────────────────────┤
│ [+ Invite User]                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  TABLE: Full Name | Email | Role | Active | Actions          │
│  ─────────────────────────────────────────                   │
│  John Doe | john@... | admin | ✓ | [Edit] [Deactivate]      │
│  Jane Doe | jane@... | manager | ✓ | [Edit] [Deactivate]    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### API Endpoints

```typescript
GET    /api/admin/users          // list all app_users
POST   /api/admin/users          // create/invite new user
PATCH  /api/admin/users/[id]     // update role or is_active
DELETE /api/admin/users/[id]     // deactivate (set is_active = false)

// PATCH body: { role?: Role, is_active?: boolean, full_name?: string }
// Cannot change own role (admin cannot demote self)
// Cannot delete last admin
```

---

## 8. NAVIGATION VISIBILITY

```typescript
// Top nav items visible per role:
const NAV_ITEMS = [
  { href: '/invoices',             label: 'INVOICES',      roles: ['admin','manager','user','viewer'] },
  { href: '/import',               label: 'IMPORT',        roles: ['admin','manager','user'] },
  { href: '/admin/metal-rates',    label: 'METAL RATES',   roles: ['admin'] },
  { href: '/admin/pricing-rules',  label: 'PRICING RULES', roles: ['admin'] },
  { href: '/admin/products',       label: 'PRODUCTS',      roles: ['admin'] },
  { href: '/admin/users',          label: 'USERS',         roles: ['admin'] },
]
```

---

## 9. STATUS TRANSITIONS PER ROLE

```typescript
// invoice-workflow.md has full detail. Summary:
// user:    draft → pending_approval
// manager: pending_approval → approved | draft
// admin:   draft → pending_approval
//          pending_approval → approved | draft
//          approved → invoiced | pending_approval
// viewer:  NO transitions (read-only)
```

---

## 10. TYPESCRIPT TYPES

```typescript
// types/index.ts
export type Role = 'admin' | 'manager' | 'user' | 'viewer'

export interface AppUser {
  id:         string
  auth_id:    string | null
  email:      string
  full_name:  string
  role:       Role
  is_active:  boolean
  created_at: string
  updated_at: string
}
```
