import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'

type Params = { params: { id: string } }

// PATCH /api/metal-rates/[id] — update nvl_prices row
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireRole('manager')
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message ?? 'Unauthorized' }, { status: err.status ?? 401 })
  }

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 })
  }

  const EDITABLE = ['gold_24k', 'pt_price', 'ag_price', 'pd_price', 'loss_gold', 'loss_pt', 'tag_multiplier', 'fr_multiplier']
  const updates: Record<string, unknown> = {}
  for (const k of EDITABLE) { if (k in body) updates[k] = body[k] }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ success: false, message: 'No valid fields to update' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('nvl_prices')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 })
  return NextResponse.json({ success: true, data })
}

// DELETE /api/metal-rates/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requireRole('manager')
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message ?? 'Unauthorized' }, { status: err.status ?? 401 })
  }

  const db = createServiceClient()
  const { error } = await db.from('nvl_prices').delete().eq('id', params.id)
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
