import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'

// GET /api/settings?key=xoan_sheet_url  → { success, value }
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

  const key = req.nextUrl.searchParams.get('key')
  if (!key) return NextResponse.json({ success: false, message: 'Missing key' }, { status: 400 })

  const db = createServiceClient()
  const { data, error } = await db.from('app_settings').select('value').eq('key', key).maybeSingle()
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true, value: data?.value ?? null })
}

// PATCH /api/settings  body: { key, value }  → admin/manager only
export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(ctx.role))
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })

  const { key, value } = await req.json()
  if (!key) return NextResponse.json({ success: false, message: 'Missing key' }, { status: 400 })

  const db = createServiceClient()
  const { error } = await db.from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
