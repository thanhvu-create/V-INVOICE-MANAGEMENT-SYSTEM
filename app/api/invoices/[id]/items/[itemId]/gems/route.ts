import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'
import { recalcItem } from '@/lib/formulas/pricing'

type Params = { params: { id: string; itemId: string } }

async function guardLocked(db: ReturnType<typeof createServiceClient>, invoiceId: string) {
  const { data } = await db.from('invoice_headers').select('is_locked, daily_metal_rates(*), pricing_rules(*)').eq('id', invoiceId).single()
  if (!data) throw { status: 404, message: 'Not found' }
  if (data.is_locked) throw { status: 403, message: 'Invoice is locked' }
  return data
}

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

// GET /api/invoices/[id]/items/[itemId]/gems
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireRole('user')
    const db = createServiceClient()
    const { data, error } = await db.from('item_gem_details').select('*').eq('invoice_item_id', params.itemId).order('id')
    if (error) throw error
    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}

// POST /api/invoices/[id]/items/[itemId]/gems
export async function POST(req: NextRequest, { params }: Params) {
  try {
    await requireRole('user')
    const body = await req.json()
    const db   = createServiceClient()

    await guardLocked(db, params.id)

    const { data, error } = await db
      .from('item_gem_details')
      .insert({
        invoice_item_id:     params.itemId,
        gem_type:            body.gem_type            ?? null,
        shape:               body.shape               ?? null,
        size_mm:             body.size_mm             ?? null,
        qty_pcs:             body.qty_pcs             ?? 1,
        weight_ct_after:     body.weight_ct_after     ?? 0,
        price_per_carat:     body.price_per_carat     ?? 0,
        setting_type:        body.setting_type        ?? null,
        setting_fee_per_pcs: body.setting_fee_per_pcs ?? 0,
      })
      .select()
      .single()

    if (error) throw error
    await triggerRecalc(db, params.itemId, params.id)

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
