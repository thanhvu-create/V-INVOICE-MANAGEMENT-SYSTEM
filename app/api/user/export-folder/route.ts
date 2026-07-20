/**
 * Per-user Google Drive export folder.
 *  GET   → the caller's own configured folder URL (any authenticated user).
 *  PATCH → set the caller's own folder URL (admin/manager only).
 *
 * Each user exports into their OWN folder with their OWN connected Google account, so
 * different users on different Google accounts never collide. Replaces the old global
 * app_settings key 'export_drive_folder_url'.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

  const db = createServiceClient()
  const { data, error } = await db
    .from('app_users')
    .select('export_drive_folder_url')
    .eq('id', ctx.userId)
    .maybeSingle()
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })

  return NextResponse.json({ success: true, value: (data as any)?.export_drive_folder_url ?? null })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(ctx.role))
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })

  const { value } = await req.json()
  const clean = typeof value === 'string' ? value.trim() : ''

  const db = createServiceClient()
  const { error } = await db
    .from('app_users')
    .update({ export_drive_folder_url: clean || null })
    .eq('id', ctx.userId)
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
