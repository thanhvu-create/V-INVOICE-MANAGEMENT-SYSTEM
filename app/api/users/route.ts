import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/auth/getRole'

// GET /api/users — admin only
export async function GET(_req: NextRequest) {
  try {
    await requireRole('admin')
    const db = createServiceClient()
    const { data, error } = await db
      .from('app_users')
      .select('id, auth_id, email, full_name, role, is_active, created_at, updated_at')
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}

// POST /api/users — admin creates new user
export async function POST(req: NextRequest) {
  try {
    await requireRole('admin')
    const { email, full_name, role, password } = await req.json()

    if (!email?.trim() || !full_name?.trim() || !role || !password) {
      return NextResponse.json({ success: false, message: 'email, full_name, role, and password are required' }, { status: 400 })
    }

    const adminClient = createAdminClient()
    const db          = createServiceClient()

    // 1. Create Supabase Auth user
    const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
      email:             email.trim(),
      password,
      email_confirm:     true,
    })
    if (authErr || !authData.user) {
      return NextResponse.json({ success: false, message: authErr?.message ?? 'Failed to create auth user' }, { status: 400 })
    }

    // 2. Insert into app_users — rollback auth user if this fails
    const { data, error } = await db.from('app_users').insert({
      auth_id:   authData.user.id,
      email:     email.trim(),
      full_name: full_name.trim(),
      role,
      is_active: true,
    }).select().single()

    if (error) {
      await adminClient.auth.admin.deleteUser(authData.user.id)
      throw error
    }

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
