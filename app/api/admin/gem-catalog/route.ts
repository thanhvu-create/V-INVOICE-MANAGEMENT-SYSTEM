import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'

function buildSizeRange(grade: string | null, min: number | null, max: number | null, unit: string): string | null {
  if (min == null || max == null) return grade || null
  const prefix = grade || ''
  if (unit === 'pcs') return min === max ? `${prefix} ${min}mm`.trim() : `${prefix} ${min}-${max}mm`.trim()
  const suffix = unit === 'ct' ? '' : ''
  return `${prefix} ${min} - ${max}`.trim() + suffix || null
}

// Admin CRUD for nvl_hot (diamond price table)
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

  const db   = createServiceClient()
  const type = req.nextUrl.searchParams.get('type')
  let q = db.from('nvl_hot').select('*').order('stone_type').order('size_min', { ascending: true, nullsFirst: false })
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
  const sizeMin = body.size_min != null ? parseFloat(body.size_min) : null
  const sizeMax = body.size_max != null ? parseFloat(body.size_max) : null
  const sizeUnit = body.size_unit?.trim() || 'mm'
  const sizeRange = body.size_range?.trim() || buildSizeRange(body.grade?.trim(), sizeMin, sizeMax, sizeUnit)

  const { data, error } = await db.from('nvl_hot').insert({
    stone_type: body.stone_type?.trim().toUpperCase() || null,
    grade:      body.grade?.trim()      || null,
    size_range: sizeRange || null,
    size_min:   sizeMin,
    size_max:   sizeMax,
    size_unit:  sizeUnit,
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
  if (rest.mk_price   !== undefined) update.mk_price   = rest.mk_price != null ? parseFloat(rest.mk_price) : null
  if (rest.size_min   !== undefined) update.size_min   = rest.size_min != null ? parseFloat(rest.size_min) : null
  if (rest.size_max   !== undefined) update.size_max   = rest.size_max != null ? parseFloat(rest.size_max) : null
  if (rest.size_unit  !== undefined) update.size_unit  = rest.size_unit?.trim() || 'mm'
  if (rest.size_range !== undefined) {
    update.size_range = rest.size_range?.trim() || null
  } else if (rest.size_min !== undefined || rest.size_max !== undefined) {
    const min = rest.size_min != null ? parseFloat(rest.size_min) : null
    const max = rest.size_max != null ? parseFloat(rest.size_max) : null
    const unit = rest.size_unit?.trim() || 'mm'
    update.size_range = buildSizeRange(rest.grade?.trim(), min, max, unit)
  }

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
