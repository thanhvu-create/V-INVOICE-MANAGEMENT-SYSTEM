# Users & Auth Module — V-Invoice

> **Routes:** `/login` · `/admin/users`
> **API:** `/api/auth/*` · `/api/users/*`
> **Roles:** `admin | manager | user | viewer`
> **Stack:** Supabase Auth + custom role table + Next.js middleware

---

## 1. ROLE PERMISSION MATRIX

```
Role      | Invoices       | Metal Rates | Pricing Rules | Products | Import | Users
──────────┼────────────────┼─────────────┼───────────────┼──────────┼────────┼──────
admin     | CRUD + approve | CRUD        | CRUD+activate | CRUD     | ✓      | CRUD
manager   | CRUD + approve | Read        | Read          | Read     | ✓      | ✗
user      | Create + edit  | Read        | Read          | Read     | ✓      | ✗
viewer    | Read only      | Read        | Read          | Read     | ✗      | ✗
```

### Column Visibility by Role

| Column | admin | manager | user | viewer |
|--------|-------|---------|------|--------|
| tag_price | ✓ | ✓ | ✗ | ✗ |
| fr_price | ✓ | ✓ | ✗ | ✗ |
| gold_value_usd | ✓ | ✓ | ✓ | ✗ |
| hpusa | ✓ | ✓ | ✓ | ✗ |
| cif_price | ✓ | ✓ | ✓ | ✗ |
| discount_pct | ✓ | ✓ | ✗ | ✗ |
| sell_price | ✓ | ✓ | ✓ | ✓ |

### Invoice Action Permissions

```typescript
const INVOICE_ACTIONS: Record<Role, string[]> = {
  admin:   ['create', 'edit', 'delete', 'approve', 'reject', 'invoice', 'add_item', 'edit_item', 'delete_item', 'import'],
  manager: ['create', 'edit', 'approve', 'reject', 'invoice', 'add_item', 'edit_item', 'delete_item', 'import'],
  user:    ['create', 'edit', 'add_item', 'edit_item', 'delete_item', 'import'],
  viewer:  [],
}
// Note: edit/add_item/delete_item/import blocked if invoice.is_locked = true (server-side)
```

---

## 2. DATABASE SCHEMA

### `app_users` Table

```sql
CREATE TABLE app_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id       UUID UNIQUE,           -- Supabase Auth user_id (nullable for service accounts)
  email         TEXT UNIQUE NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'user', 'viewer')),
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON app_users(auth_id);
CREATE INDEX ON app_users(email);
CREATE INDEX ON app_users(role);
```

### Supabase Auth Integration

```
Supabase Auth handles: password hashing, JWT tokens, session refresh
app_users table handles: role, display name, active status
Link: app_users.auth_id = auth.users.id

Login flow:
  supabase.auth.signInWithPassword({ email, password })
  → JWT stored in cookie (Supabase SSR)
  → GET /api/auth/me → lookup app_users by auth_id → return role + profile
```

---

## 3. AUTH FLOW

### 3.1 Login

**Route:** `POST /api/auth/login`

```typescript
// app/api/auth/login/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({
      success: false,
      message: 'Email and password are required.'
    }, { status: 400 })
  }

  const supabase = createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.user) {
    return NextResponse.json({
      success: false,
      message: 'Invalid email or password.'
    }, { status: 401 })
  }

  // Load role from app_users
  const { data: appUser } = await supabase
    .from('app_users')
    .select('id, email, full_name, role, is_active')
    .eq('auth_id', data.user.id)
    .single()

  if (!appUser || !appUser.is_active) {
    await supabase.auth.signOut()
    return NextResponse.json({
      success: false,
      message: 'Account not found or inactive.'
    }, { status: 403 })
  }

  return NextResponse.json({
    success: true,
    data: {
      id: appUser.id,
      email: appUser.email,
      fullName: appUser.full_name,
      role: appUser.role,
    }
  })
}
```

### 3.2 Get Current User

**Route:** `GET /api/auth/me`

```typescript
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
  }

  const { data: appUser } = await supabase
    .from('app_users')
    .select('id, email, full_name, role, is_active')
    .eq('auth_id', user.id)
    .single()

  if (!appUser || !appUser.is_active) {
    return NextResponse.json({ success: false, message: 'Account inactive' }, { status: 403 })
  }

  return NextResponse.json({ success: true, data: appUser })
}
```

### 3.3 Logout

**Route:** `POST /api/auth/logout`

```typescript
export async function POST() {
  const supabase = createClient()
  await supabase.auth.signOut()
  return NextResponse.json({ success: true })
}
```

---

## 4. MIDDLEWARE — ROUTE PROTECTION

```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_ROUTES = ['/login', '/api/auth/login']
const ADMIN_ROUTES = ['/admin/users', '/admin/metal-rates', '/admin/pricing-rules']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip public routes
  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) {
    return NextResponse.next()
  }

  // Create Supabase client for middleware
  let response = NextResponse.next()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => request.cookies.get(name)?.value,
        set: (name, value, options) => { response.cookies.set({ name, value, ...options }) },
        remove: (name, options) => { response.cookies.set({ name, value: '', ...options }) },
      }
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Not authenticated → redirect to login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Admin-only routes → check role
  if (ADMIN_ROUTES.some(r => pathname.startsWith(r))) {
    const { data: appUser } = await supabase
      .from('app_users')
      .select('role')
      .eq('auth_id', user.id)
      .single()

    if (!appUser || appUser.role !== 'admin') {
      return NextResponse.redirect(new URL('/unauthorized', request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
}
```

---

## 5. USER CONTEXT (CLIENT-SIDE)

```typescript
// contexts/UserContext.tsx
'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

interface AppUser {
  id: string
  email: string
  fullName: string
  role: 'admin' | 'manager' | 'user' | 'viewer'
}

interface UserContextValue {
  user: AppUser | null
  loading: boolean
  logout: () => Promise<void>
  canDo: (action: string) => boolean
}

const UserContext = createContext<UserContextValue | null>(null)

const ROLE_ACTIONS: Record<string, string[]> = {
  admin:   ['create', 'edit', 'delete', 'approve', 'reject', 'invoice', 'import', 'manage_users', 'manage_rates', 'manage_rules', 'manage_products', 'see_prices'],
  manager: ['create', 'edit', 'approve', 'reject', 'invoice', 'import', 'see_prices'],
  user:    ['create', 'edit', 'import'],
  viewer:  [],
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(({ success, data }) => {
        if (success) setUser(data)
      })
      .finally(() => setLoading(false))
  }, [])

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    window.location.href = '/login'
  }

  const canDo = (action: string): boolean => {
    if (!user) return false
    return ROLE_ACTIONS[user.role]?.includes(action) ?? false
  }

  return (
    <UserContext.Provider value={{ user, loading, logout, canDo }}>
      {children}
    </UserContext.Provider>
  )
}

export const useUser = () => {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser must be inside UserProvider')
  return ctx
}
```

### Usage in Components

```tsx
const { user, canDo } = useUser()

// Role-based rendering:
{canDo('see_prices') && <td>${item.tag_price?.toFixed(2)}</td>}
{canDo('approve') && <button onClick={handleApprove}>Approve</button>}
{canDo('manage_users') && <NavLink href="/admin/users">Users</NavLink>}
```

---

## 6. SERVER-SIDE ROLE HELPER

```typescript
// lib/auth/getRole.ts
import { createClient } from '@/lib/supabase/server'

export type Role = 'admin' | 'manager' | 'user' | 'viewer'

export interface AuthContext {
  userId: string
  appUserId: string
  role: Role
  email: string
  fullName: string
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: appUser } = await supabase
    .from('app_users')
    .select('id, email, full_name, role, is_active')
    .eq('auth_id', user.id)
    .single()

  if (!appUser || !appUser.is_active) return null

  return {
    userId:    user.id,
    appUserId: appUser.id,
    role:      appUser.role as Role,
    email:     appUser.email,
    fullName:  appUser.full_name,
  }
}

// Usage in API routes:
export async function requireRole(minRole: Role): Promise<AuthContext> {
  const ROLE_ORDER: Role[] = ['viewer', 'user', 'manager', 'admin']
  const ctx = await getAuthContext()
  if (!ctx) throw { status: 401, message: 'Not authenticated' }
  if (ROLE_ORDER.indexOf(ctx.role) < ROLE_ORDER.indexOf(minRole)) {
    throw { status: 403, message: 'Insufficient permissions' }
  }
  return ctx
}
```

### API Route Pattern with Auth

```typescript
// Standard API route with role check:
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole('manager')  // throw 403 if below manager
    // ... rest of handler using ctx.role, ctx.appUserId
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message },
      { status: err.status ?? 500 }
    )
  }
}
```

---

## 7. USER MANAGEMENT (Admin Only)

### 7.1 List Users

**Route:** `GET /api/users`

```typescript
export async function GET() {
  const ctx = await requireRole('admin')
  const db = createServiceClient()

  const { data, error } = await db
    .from('app_users')
    .select('id, email, full_name, role, is_active, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}
```

### 7.2 Create User

**Route:** `POST /api/users`

```typescript
// Body: { email, fullName, role, password }
export async function POST(req: NextRequest) {
  await requireRole('admin')
  const { email, fullName, role, password } = await req.json()

  if (!email || !fullName || !role || !password) {
    return NextResponse.json({ success: false, message: 'All fields required.' }, { status: 400 })
  }

  if (!['admin', 'manager', 'user', 'viewer'].includes(role)) {
    return NextResponse.json({ success: false, message: 'Invalid role.' }, { status: 400 })
  }

  // Create Supabase Auth user (admin API)
  const supabaseAdmin = createAdminClient()  // uses SERVICE_ROLE_KEY
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,  // skip email verification
  })

  if (authError) {
    return NextResponse.json({ success: false, message: authError.message }, { status: 400 })
  }

  // Create app_users record
  const db = createServiceClient()
  const { data, error } = await db
    .from('app_users')
    .insert({
      auth_id:   authData.user.id,
      email,
      full_name: fullName,
      role,
    })
    .select('id, email, full_name, role, is_active, created_at')
    .single()

  if (error) {
    // Rollback: delete auth user
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data }, { status: 201 })
}
```

### 7.3 Update User

**Route:** `PATCH /api/users/[id]`

```typescript
// Body: { fullName?, role?, isActive?, password? }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  await requireRole('admin')
  const body = await req.json()
  const db = createServiceClient()

  // Fetch user to get auth_id
  const { data: existing } = await db
    .from('app_users')
    .select('id, auth_id')
    .eq('id', params.id)
    .single()

  if (!existing) {
    return NextResponse.json({ success: false, message: 'User not found.' }, { status: 404 })
  }

  // Update app_users
  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  if (body.fullName)  updates.full_name = body.fullName
  if (body.role)      updates.role = body.role
  if (body.isActive !== undefined) updates.is_active = body.isActive

  const { data, error } = await db
    .from('app_users')
    .update(updates)
    .eq('id', params.id)
    .select('id, email, full_name, role, is_active')
    .single()

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })

  // Update password if provided
  if (body.password && existing.auth_id) {
    const supabaseAdmin = createAdminClient()
    await supabaseAdmin.auth.admin.updateUserById(existing.auth_id, {
      password: body.password
    })
  }

  return NextResponse.json({ success: true, data })
}
```

### 7.4 Delete User

**Route:** `DELETE /api/users/[id]`

```typescript
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await requireRole('admin')

  // Prevent self-deletion
  const db = createServiceClient()
  const { data: target } = await db
    .from('app_users')
    .select('id, auth_id, email')
    .eq('id', params.id)
    .single()

  if (!target) {
    return NextResponse.json({ success: false, message: 'User not found.' }, { status: 404 })
  }

  if (target.email === ctx.email) {
    return NextResponse.json({
      success: false,
      message: 'Cannot delete your own account.'
    }, { status: 400 })
  }

  // Delete from app_users (auth user kept for audit trail)
  const { error } = await db.from('app_users').delete().eq('id', params.id)
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })

  // Disable Supabase Auth user
  if (target.auth_id) {
    const supabaseAdmin = createAdminClient()
    await supabaseAdmin.auth.admin.updateUserById(target.auth_id, { ban_duration: 'none' })
  }

  return NextResponse.json({ success: true })
}
```

---

## 8. LOGIN PAGE UI

### 8.1 Layout

```
┌────────────────────────────────────────┐
│  [centered, max-width: 420px]          │
│                                        │
│  HP JEWELRY                            │ ← eyebrow, xs, uppercase, tracked
│  Invoice System                        │ ← serif h1, 44px
│  ──────────────────                    │
│                                        │
│  EMAIL                                 │ ← label
│  [____________________________]        │ ← underline input
│                                        │
│  PASSWORD                              │
│  [____________________________] [👁]   │ ← show/hide toggle
│                                        │
│  [  SIGN IN  ]                         │ ← full-width dark btn
│                                        │
│  {error message — inline red}          │
│                                        │
└────────────────────────────────────────┘
```

### 8.2 Component

```tsx
// app/(auth)/login/page.tsx
'use client'
import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    })
    const { success, message } = await res.json()

    if (success) {
      router.push('/invoices')
    } else {
      setError(message)
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>

        {/* Brand */}
        <div style={{
          fontSize: 'var(--text-xs)',
          fontFamily: 'var(--font-body)',
          fontWeight: 600,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: 'var(--text-secondary)',
          marginBottom: 8,
        }}>
          HP Jewelry
        </div>
        <h1 style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 'var(--text-3xl)',
          fontWeight: 400,
          color: 'var(--text-primary)',
          marginBottom: '2.5rem',
          lineHeight: 1.1,
        }}>
          Invoice System
        </h1>

        <form onSubmit={handleSubmit}>

          {/* Email */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              style={inputStyle}
              placeholder="you@company.com"
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: '2rem', position: 'relative' }}>
            <label style={labelStyle}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={{ ...inputStyle, paddingRight: 36 }}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                style={{
                  position: 'absolute', right: 0, top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: 14,
                }}
              >
                <i className={`fa-regular ${showPw ? 'fa-eye-slash' : 'fa-eye'}`} />
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              color: 'var(--color-danger)',
              fontSize: 'var(--text-sm)',
              marginBottom: '1rem',
              borderLeft: '2px solid var(--color-danger)',
              paddingLeft: 12,
            }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: loading ? 'var(--bg-muted)' : 'var(--btn-dark-bg)',
              color: 'var(--text-inverse)',
              border: 'none',
              borderRadius: 0,
              padding: '0.875rem',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {loading && <i className="fa-solid fa-circle-notch fa-spin" />}
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

        </form>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-xs)',
  fontWeight: 500,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  marginBottom: 8,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: 'none',
  borderBottom: '1px solid var(--border-base)',
  borderRadius: 0,
  background: 'transparent',
  padding: '8px 0',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  color: 'var(--text-primary)',
  outline: 'none',
}
```

---

## 9. ADMIN USERS PAGE

### 9.1 Layout

```
┌──────────────────────────────────────────────────────────────┐
│ PAGE HEADER: "User Management" (serif h1)                    │
│ Subtitle: "Manage access and roles"                          │
├──────────────────────────────────────────────────────────────┤
│ [+ Invite User]                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ TABLE                                                │   │
│  │ Name | Email | Role | Status | Created | Actions     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 9.2 Users Table

```tsx
// components/admin/users/UsersTable.tsx
interface AppUser {
  id: string
  email: string
  full_name: string
  role: string
  is_active: boolean
  created_at: string
}

const ROLE_BADGE: Record<string, { bg: string; color: string }> = {
  admin:   { bg: '#1A1814', color: '#FAFAF7' },
  manager: { bg: '#4A6B8C', color: '#FAFAF7' },
  user:    { bg: '#4A7C59', color: '#FAFAF7' },
  viewer:  { bg: '#8C7340', color: '#FAFAF7' },
}

export function UsersTable({
  users,
  currentUserId,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  users: AppUser[]
  currentUserId: string
  onEdit: (user: AppUser) => void
  onToggleActive: (user: AppUser) => void
  onDelete: (user: AppUser) => void
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {['Name', 'Email', 'Role', 'Status', 'Created', 'Actions'].map(h => (
            <th key={h} style={thStyle}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {users.map(user => {
          const badge = ROLE_BADGE[user.role] ?? ROLE_BADGE.viewer
          const isSelf = user.id === currentUserId
          return (
            <tr key={user.id}>
              <td style={tdStyle}>
                <div style={{ fontWeight: 500 }}>{user.full_name}</div>
              </td>
              <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
                {user.email}
              </td>
              <td style={tdStyle}>
                <span style={{
                  background: badge.bg,
                  color: badge.color,
                  padding: '2px 8px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}>
                  {user.role}
                </span>
              </td>
              <td style={tdStyle}>
                <span style={{
                  color: user.is_active ? 'var(--color-success)' : 'var(--color-danger)',
                  fontSize: 'var(--text-sm)',
                }}>
                  {user.is_active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
                {new Date(user.created_at).toLocaleDateString('en-CA')}
              </td>
              <td style={tdStyle}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => onEdit(user)} style={actionBtnStyle} title="Edit">
                    <i className="fa-solid fa-pen" />
                  </button>
                  <button
                    onClick={() => onToggleActive(user)}
                    disabled={isSelf}
                    style={{ ...actionBtnStyle, opacity: isSelf ? 0.4 : 1 }}
                    title={user.is_active ? 'Deactivate' : 'Activate'}
                  >
                    <i className={`fa-solid ${user.is_active ? 'fa-ban' : 'fa-check'}`} />
                  </button>
                  <button
                    onClick={() => onDelete(user)}
                    disabled={isSelf}
                    style={{
                      ...actionBtnStyle,
                      color: 'var(--color-danger)',
                      opacity: isSelf ? 0.4 : 1,
                    }}
                    title="Delete"
                  >
                    <i className="fa-solid fa-trash-can" />
                  </button>
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  background: 'var(--bg-base)',
  fontSize: 'var(--text-xs)',
  fontWeight: 500,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  borderBottom: '1px solid var(--border-base)',
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid var(--border-light)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
  verticalAlign: 'middle',
}

const actionBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border-base)',
  borderRadius: 0,
  padding: '4px 8px',
  cursor: 'pointer',
  color: 'var(--text-secondary)',
  fontSize: 12,
}
```

### 9.3 Create/Edit User Modal

```tsx
// components/admin/users/UserModal.tsx
interface UserFormData {
  email: string
  fullName: string
  role: string
  password: string
}

export function UserModal({
  mode,
  initialData,
  onSave,
  onClose,
}: {
  mode: 'create' | 'edit'
  initialData?: Partial<UserFormData & { id: string }>
  onSave: (data: UserFormData) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<UserFormData>({
    email:    initialData?.email    ?? '',
    fullName: initialData?.fullName ?? '',
    role:     initialData?.role     ?? 'user',
    password: '',
  })
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const handleSave = async () => {
    if (!form.fullName || !form.role) { setError('Name and role are required.'); return }
    if (mode === 'create' && (!form.email || !form.password)) {
      setError('Email and password are required for new users.'); return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(form)
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(26,24,20,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-base)',
        width: '100%', maxWidth: 480,
      }}>
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-base)' }}>
          <h5 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)', fontWeight: 400, margin: 0 }}>
            {mode === 'create' ? 'Invite User' : 'Edit User'}
          </h5>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Email (create only) */}
          {mode === 'create' && (
            <div>
              <label style={fieldLabel}>Email *</label>
              <input type="email" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                style={fieldInput} />
            </div>
          )}

          {/* Full Name */}
          <div>
            <label style={fieldLabel}>Full Name *</label>
            <input type="text" value={form.fullName}
              onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
              style={fieldInput} />
          </div>

          {/* Role */}
          <div>
            <label style={fieldLabel}>Role *</label>
            <select value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              style={{ ...fieldInput, cursor: 'pointer' }}>
              <option value="viewer">Viewer — Read only</option>
              <option value="user">User — Create & edit invoices</option>
              <option value="manager">Manager — Approve invoices</option>
              <option value="admin">Admin — Full access</option>
            </select>
          </div>

          {/* Password */}
          <div>
            <label style={fieldLabel}>
              {mode === 'create' ? 'Password *' : 'New Password (leave blank to keep)'}
            </label>
            <input type="password" value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder={mode === 'edit' ? '••••••••' : ''}
              style={fieldInput} />
          </div>

          {error && (
            <div style={{ color: 'var(--color-danger)', fontSize: 'var(--text-sm)', borderLeft: '2px solid var(--color-danger)', paddingLeft: 10 }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-light)', background: 'var(--bg-base)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: 0, padding: '8px 20px', cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} style={{ background: 'var(--btn-dark-bg)', color: 'var(--text-inverse)', border: 'none', borderRadius: 0, padding: '8px 20px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving && <i className="fa-solid fa-circle-notch fa-spin" />}
            {mode === 'create' ? 'Create User' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--text-xs)',
  fontWeight: 500,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  marginBottom: 6,
}

const fieldInput: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--border-base)',
  borderRadius: 0,
  background: 'var(--bg-surface)',
  padding: '8px 10px',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
}
```

---

## 10. NAVIGATION — ROLE-BASED

```tsx
// components/shared/Topbar.tsx (nav items filtered by role)

interface NavItem {
  href:  string
  label: string
  icon:  string
  roles: string[]   // which roles can see this nav item
}

const NAV_ITEMS: NavItem[] = [
  { href: '/invoices',            label: 'Invoices',      icon: 'fa-file-invoice',     roles: ['admin','manager','user','viewer'] },
  { href: '/import',              label: 'Import',         icon: 'fa-file-import',      roles: ['admin','manager','user'] },
  { href: '/admin/metal-rates',   label: 'Metal Rates',    icon: 'fa-coins',            roles: ['admin','manager'] },
  { href: '/admin/pricing-rules', label: 'Pricing Rules',  icon: 'fa-tags',             roles: ['admin'] },
  { href: '/admin/products',      label: 'Products',       icon: 'fa-gem',              roles: ['admin'] },
  { href: '/admin/users',         label: 'Users',          icon: 'fa-users',            roles: ['admin'] },
]

// Filter in Topbar:
const visibleNav = NAV_ITEMS.filter(item => item.roles.includes(user.role))
```

---

## 11. SUPABASE ADMIN CLIENT

```typescript
// lib/supabase/admin.ts
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      }
    }
  )
}
// Used ONLY in server-side API routes for auth admin operations
// (createUser, updateUserById, deleteUser)
// Never expose SERVICE_ROLE_KEY to client
```

---

## 12. ENVIRONMENT VARIABLES

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...          # Client-safe
SUPABASE_SERVICE_ROLE_KEY=eyJ...              # Server-only, NEVER expose
NEXT_PUBLIC_APP_NAME="HP Jewelry Invoice"
```

---

## 13. COMPONENT STRUCTURE

```
app/
├── (auth)/
│   └── login/
│       └── page.tsx           ← Login form (public route)
├── (dashboard)/
│   └── admin/
│       └── users/
│           └── page.tsx       ← Users management (admin only)
│
components/
└── admin/
    └── users/
        ├── UsersTable.tsx     ← Table with edit/toggle/delete
        └── UserModal.tsx      ← Create/Edit modal

lib/
└── auth/
    └── getRole.ts             ← getAuthContext(), requireRole()

contexts/
└── UserContext.tsx            ← useUser() hook for client components

middleware.ts                  ← Route protection + admin guard
```

---

## 14. API ENDPOINTS SUMMARY

| Method | URL | Auth | Description |
|--------|-----|------|-------------|
| POST | `/api/auth/login` | Public | Sign in with email/password |
| GET | `/api/auth/me` | Any | Get current user profile |
| POST | `/api/auth/logout` | Any | Sign out |
| GET | `/api/users` | admin | List all users |
| POST | `/api/users` | admin | Create user |
| PATCH | `/api/users/[id]` | admin | Update role/name/password |
| DELETE | `/api/users/[id]` | admin | Delete user |

---

## 15. SECURITY RULES

```
✓ Password hashing: delegated to Supabase Auth (bcrypt)
✓ JWT: Supabase SSR handles cookie storage + refresh
✓ Role stored in app_users (not JWT claims) → queried fresh each request
✓ SERVICE_ROLE_KEY: server-side only — never in NEXT_PUBLIC_ vars
✓ Self-deletion prevention: compare ctx.email with target.email
✓ Inactive users: is_active=false → 403 on GET /api/auth/me (cannot login)
✓ Viewer role: zero write access — all mutations return 403
✓ Column visibility: enforced server-side in export + per-row in client render
✓ is_locked guard: not a user permission issue — applies to ALL roles (even admin)
```
