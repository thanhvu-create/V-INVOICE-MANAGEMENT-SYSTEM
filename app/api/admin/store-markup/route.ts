import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/session'

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(ctx.role))
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })

  const db = createServiceClient()
  const [{ data: tiers }, { data: channels }] = await Promise.all([
    db.from('mk_store_markup').select('*').order('sort_order'),
    db.from('mk_price_list_type').select('*').order('sort_order'),
  ])
  return NextResponse.json({ success: true, data: { tiers: tiers ?? [], channels: channels ?? [] } })
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'admin')
    return NextResponse.json({ success: false, message: 'Admin only' }, { status: 403 })

  const body = await req.json()
  const db = createServiceClient()

  // POST to /api/admin/store-markup handles both tiers and channels
  if (body._type === 'channel') {
    const { data, error } = await db.from('mk_price_list_type').insert({
      price_list_type: body.price_list_type?.trim(),
      region:          body.region?.trim() || null,
      sort_order:      body.sort_order ?? 0,
    }).select().single()
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 409 })
    return NextResponse.json({ success: true, data })
  }

  // Default: tier row
  const { data, error } = await db.from('mk_store_markup').insert({
    value_from: parseFloat(body.value_from),
    value_to:   parseFloat(body.value_to),
    markups:    body.markups ?? {},
    notes:      body.notes?.trim() || null,
    sort_order: body.sort_order ?? 0,
  }).select().single()
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'admin')
    return NextResponse.json({ success: false, message: 'Admin only' }, { status: 403 })

  const body = await req.json()
  const { id, _type, ...rest } = body
  if (!id) return NextResponse.json({ success: false, message: 'id required' }, { status: 400 })

  const db = createServiceClient()

  if (_type === 'channel') {
    const { data, error } = await db.from('mk_price_list_type')
      .update({ price_list_type: rest.price_list_type, region: rest.region, sort_order: rest.sort_order, is_active: rest.is_active })
      .eq('id', id).select().single()
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  }

  const update: Record<string, unknown> = {}
  if (rest.value_from !== undefined) update.value_from = parseFloat(rest.value_from)
  if (rest.value_to   !== undefined) update.value_to   = parseFloat(rest.value_to)
  if (rest.markups    !== undefined) update.markups    = rest.markups
  if (rest.notes      !== undefined) update.notes      = rest.notes?.trim() || null
  if (rest.sort_order !== undefined) update.sort_order = rest.sort_order

  const { data, error } = await db.from('mk_store_markup').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

export async function DELETE(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'admin')
    return NextResponse.json({ success: false, message: 'Admin only' }, { status: 403 })

  const id     = req.nextUrl.searchParams.get('id')
  const _type  = req.nextUrl.searchParams.get('type')
  if (!id) return NextResponse.json({ success: false, message: 'id required' }, { status: 400 })

  const db = createServiceClient()
  const table = _type === 'channel' ? 'mk_price_list_type' : 'mk_store_markup'
  const { error } = await db.from(table).delete().eq('id', id)
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
