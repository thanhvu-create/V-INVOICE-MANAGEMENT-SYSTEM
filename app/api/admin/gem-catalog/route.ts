import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'

// Admin CRUD for nvl_hot (diamond price table)
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(ctx.role))
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })

  const db   = createServiceClient()
  const type = req.nextUrl.searchParams.get('type')
  let q = db.from('nvl_hot').select('*').order('stone_type').order('size_range')
  if (type) q = q.eq('stone_type', type)
  const { data, error } = await q
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(ctx.role)) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const db   = createServiceClient()
  const { data, error } = await db.from('nvl_hot').insert({
    stone_type: body.stone_type?.trim().toUpperCase() || null,
    grade:      body.grade?.trim()      || null,
    size_range: body.size_range?.trim() || null,
    mk_price:   body.mk_price != null ? parseFloat(body.mk_price) : null,
  }).select().single()
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 409 })
  return NextResponse.json({ success: true, data })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(ctx.role)) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { id, ...rest } = body
  if (!id) return NextResponse.json({ success: false, message: 'id required' }, { status: 400 })

  const db = createServiceClient()
  const update: Record<string, unknown> = {}
  if (rest.stone_type !== undefined) update.stone_type = rest.stone_type?.trim().toUpperCase()
  if (rest.grade      !== undefined) update.grade      = rest.grade?.trim() || null
  if (rest.size_range !== undefined) update.size_range = rest.size_range?.trim() || null
  if (rest.mk_price   !== undefined) update.mk_price   = rest.mk_price != null ? parseFloat(rest.mk_price) : null

  const { data, error } = await db.from('nvl_hot').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

export async function DELETE(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(ctx.role)) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ success: false, message: 'id required' }, { status: 400 })

  const db = createServiceClient()
  const { error } = await db.from('nvl_hot').delete().eq('id', id)
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
