import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/auth/getRole'

type Params = { params: { id: string } }

// PATCH /api/users/[id] — edit role, name, active, or reset password
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx  = await requireRole('admin')
    const body = await req.json()
    const db   = createServiceClient()

    // Self-role guard: admin cannot demote themselves
    const { data: target } = await db.from('app_users').select('email, auth_id').eq('id', params.id).single()
    if (!target) return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 })
    if (target.email === ctx.email && body.role && body.role !== 'admin') {
      return NextResponse.json({ success: false, message: 'Cannot change your own role' }, { status: 403 })
    }

    // Update app_users fields
    const EDITABLE = ['full_name', 'role', 'is_active']
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const k of EDITABLE) { if (k in body) updates[k] = body[k] }

    const { data, error } = await db.from('app_users').update(updates).eq('id', params.id).select().single()
    if (error) throw error

    // Optional: reset password via admin client
    if (body.password && target.auth_id) {
      const adminClient = createAdminClient()
      await adminClient.auth.admin.updateUserById(target.auth_id, { password: body.password })
    }

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}

// DELETE /api/users/[id] — admin only, cannot delete self
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireRole('admin')
    const db  = createServiceClient()

    const { data: target } = await db.from('app_users').select('email, auth_id').eq('id', params.id).single()
    if (!target) return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 })
    if (target.email === ctx.email) {
      return NextResponse.json({ success: false, message: 'Cannot delete your own account' }, { status: 403 })
    }

    // Delete from app_users first, then auth
    await db.from('app_users').delete().eq('id', params.id)
    if (target.auth_id) {
      const adminClient = createAdminClient()
      await adminClient.auth.admin.deleteUser(target.auth_id)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
