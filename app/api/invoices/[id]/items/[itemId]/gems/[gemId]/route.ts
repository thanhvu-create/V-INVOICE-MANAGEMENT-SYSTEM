import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'
import { recalcItem } from '@/lib/formulas/pricing'

type Params = { params: { id: string; itemId: string; gemId: string } }

async function triggerRecalc(db: ReturnType<typeof createServiceClient>, itemId: string, invoiceId: string) {
  const [{ data: item }, { data: gems }, { data: invoice }] = await Promise.all([
    db.from('invoice_items').select('*').eq('id', itemId).single(),
    db.from('item_gem_details').select('*').eq('invoice_item_id', itemId),
    db.from('invoice_headers').select('daily_metal_rates(*), pricing_rules(*)').eq('id', invoiceId).single(),
  ])
  const rate = (invoice as any)?.daily_metal_rates
  const rule = (invoice as any)?.pricing_rules
  if (item && rate && rule) {
    const updates = recalcItem(item, gems ?? [], rate, rule)
    await db.from('invoice_items').update(updates).eq('id', itemId)
  }
}

// PATCH /api/invoices/[id]/items/[itemId]/gems/[gemId]
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireRole('user')
    const body = await req.json()
    const db   = createServiceClient()

    const { data: inv } = await db.from('invoice_headers').select('is_locked').eq('id', params.id).single()
    if (!inv) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 })
    if (inv.is_locked) return NextResponse.json({ success: false, message: 'Invoice is locked' }, { status: 403 })

    const EDITABLE = ['gem_type', 'shape', 'size_mm', 'qty_pcs', 'weight_ct_after', 'price_per_carat', 'setting_type', 'setting_fee_per_pcs']
    const updates: Record<string, unknown> = {}
    for (const k of EDITABLE) { if (k in body) updates[k] = body[k] }

    const { data, error } = await db.from('item_gem_details').update(updates).eq('id', params.gemId).select().single()
    if (error) throw error

    await triggerRecalc(db, params.itemId, params.id)
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}

// DELETE /api/invoices/[id]/items/[itemId]/gems/[gemId]
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requireRole('user')
    const db = createServiceClient()

    const { data: inv } = await db.from('invoice_headers').select('is_locked').eq('id', params.id).single()
    if (!inv) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 })
    if (inv.is_locked) return NextResponse.json({ success: false, message: 'Invoice is locked' }, { status: 403 })

    const { error } = await db.from('item_gem_details').delete().eq('id', params.gemId)
    if (error) throw error

    await triggerRecalc(db, params.itemId, params.id)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
