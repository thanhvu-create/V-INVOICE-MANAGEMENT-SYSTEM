import { createClient, createServiceClient } from '@/lib/supabase/server'

export type Role = 'viewer' | 'user' | 'manager' | 'admin'

export interface AuthContext {
  authId:   string
  userId:   string
  email:    string
  fullName: string
  role:     Role
}

const ROLE_ORDER: Role[] = ['viewer', 'user', 'manager', 'admin']

// Returns the current user's auth context, or null if unauthenticated.
export async function getAuthContext(): Promise<AuthContext | null> {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return null

    const db = createServiceClient()
    const { data: profile } = await db
      .from('app_users')
      .select('id, email, full_name, role, is_active')
      .eq('auth_id', user.id)
      .single()

    if (!profile || !profile.is_active) return null

    return {
      authId:   user.id,
      userId:   profile.id,
      email:    profile.email,
      fullName: profile.full_name,
      role:     profile.role as Role,
    }
  } catch {
    return null
  }
}

// Throws { status, message } if not authenticated or below required role.
export async function requireRole(minRole: Role): Promise<AuthContext> {
  const ctx = await getAuthContext()
  if (!ctx) throw { status: 401, message: 'Unauthorized' }

  const userLevel = ROLE_ORDER.indexOf(ctx.role)
  const minLevel  = ROLE_ORDER.indexOf(minRole)

  if (userLevel < minLevel) {
    throw { status: 403, message: 'Forbidden — insufficient role' }
  }

  return ctx
}
