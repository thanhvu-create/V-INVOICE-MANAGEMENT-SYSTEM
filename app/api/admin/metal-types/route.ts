import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'

function canEdit(role: string) { return ['admin', 'manager'].includes(role) }

// Chuẩn hoá + validate body cho create/update. Trả { error } hoặc { row }.
function buildRow(body: any): { error?: string; row?: Record<string, unknown> } {
  const code = body.code?.trim().toUpperCase()
  if (!code) return { error: 'code required' }
  const mode = body.price_mode
  if (!['dynamic', 'fixed'].includes(mode)) return { error: 'price_mode must be dynamic or fixed' }

  const row: Record<string, unknown> = {
    code,
    label: body.label?.trim() || null,
    price_mode: mode,
  }
  if (mode === 'dynamic') {
    const base = body.base_kind
    if (!['karat', 'ag', 'pt', 'pd'].includes(base)) return { error: 'base_kind invalid' }
    if (base === 'karat' && body.karat == null) return { error: 'karat required for base_kind=karat' }
    row.base_kind = base
    row.karat = base === 'karat' ? parseInt(body.karat) : null
    row.surcharge_per_gram = body.surcharge_per_gram != null ? parseFloat(body.surcharge_per_gram) : 0
    row.fixed_per_gram = null
  } else {
    if (body.fixed_per_gram == null || body.fixed_per_gram === '') return { error: 'fixed_per_gram required' }
    row.fixed_per_gram = parseFloat(body.fixed_per_gram)
    row.base_kind = null
    row.karat = null
    row.surcharge_per_gram = 0
  }
  return { row }
}

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  const db = createServiceClient()
  const { data, error } = await db.from('metal_types').select('*').order('code')
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  if (!canEdit(ctx.role)) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })

  const { error: verr, row } = buildRow(await req.json())
  if (verr) return NextResponse.json({ success: false, message: verr }, { status: 400 })

  const db = createServiceClient()
  const { data, error } = await db.from('metal_types').insert(row!).select().single()
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 409 })
  return NextResponse.json({ success: true, data })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  if (!canEdit(ctx.role)) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  if (!body.id) return NextResponse.json({ success: false, message: 'id required' }, { status: 400 })
  const { error: verr, row } = buildRow(body)
  if (verr) return NextResponse.json({ success: false, message: verr }, { status: 400 })

  const db = createServiceClient()
  const { data, error } = await db.from('metal_types')
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq('id', body.id).select().single()
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 409 })
  return NextResponse.json({ success: true, data })
}

export async function DELETE(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  if (!canEdit(ctx.role)) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ success: false, message: 'id required' }, { status: 400 })
  const db = createServiceClient()
  const { error } = await db.from('metal_types').delete().eq('id', id)
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
