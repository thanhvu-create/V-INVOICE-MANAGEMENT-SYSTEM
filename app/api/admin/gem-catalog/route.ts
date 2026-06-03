import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/session'

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(ctx.role))
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })

  const db = createServiceClient()
  const type = req.nextUrl.searchParams.get('type')
  let q = db.from('gem_price_catalog').select('*').order('gem_type').order('gem_code')
  if (type) q = q.eq('gem_type', type)
  const { data, error } = await q
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'admin')
    return NextResponse.json({ success: false, message: 'Admin only' }, { status: 403 })

  const body = await req.json()
  const db = createServiceClient()
  const { data, error } = await db.from('gem_price_catalog').insert({
    gem_code:   body.gem_code?.trim().toUpperCase(),
    gem_type:   body.gem_type?.trim().toUpperCase(),
    size_range: body.size_range?.trim() || null,
    cost_price: body.cost_price ? parseFloat(body.cost_price) : null,
    mk_price:   body.mk_price   ? parseFloat(body.mk_price)   : null,
    price_unit: body.price_unit || 'per_ct',
    notes:      body.notes?.trim() || null,
    is_active:  body.is_active ?? true,
  }).select().single()
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 409 })
  return NextResponse.json({ success: true, data })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'admin')
    return NextResponse.json({ success: false, message: 'Admin only' }, { status: 403 })

  const body = await req.json()
  const { id, ...rest } = body
  if (!id) return NextResponse.json({ success: false, message: 'id required' }, { status: 400 })

  const db = createServiceClient()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (rest.gem_code   !== undefined) update.gem_code   = rest.gem_code?.trim().toUpperCase()
  if (rest.gem_type   !== undefined) update.gem_type   = rest.gem_type?.trim().toUpperCase()
  if (rest.size_range !== undefined) update.size_range = rest.size_range?.trim() || null
  if (rest.cost_price !== undefined) update.cost_price = rest.cost_price ? parseFloat(rest.cost_price) : null
  if (rest.mk_price   !== undefined) update.mk_price   = rest.mk_price   ? parseFloat(rest.mk_price)   : null
  if (rest.price_unit !== undefined) update.price_unit = rest.price_unit
  if (rest.notes      !== undefined) update.notes      = rest.notes?.trim() || null
  if (rest.is_active  !== undefined) update.is_active  = rest.is_active

  const { data, error } = await db.from('gem_price_catalog').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

export async function DELETE(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'admin')
    return NextResponse.json({ success: false, message: 'Admin only' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ success: false, message: 'id required' }, { status: 400 })

  const db = createServiceClient()
  const { error } = await db.from('gem_price_catalog').delete().eq('id', id)
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
