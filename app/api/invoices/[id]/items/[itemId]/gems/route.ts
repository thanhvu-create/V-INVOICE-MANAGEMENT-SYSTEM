import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole, AuthContext } from '@/lib/auth/getRole'
import { recalcItem } from '@/lib/formulas/pricing'
import { checkEditPermission } from '@/lib/auth/editGuard'

type Params = { params: { id: string; itemId: string } }

async function guardAndCheck(db: ReturnType<typeof createServiceClient>, invoiceId: string, ctx: AuthContext) {
  const { data } = await db
    .from('invoice_headers')
    .select('is_locked, status, created_by_user_id, daily_metal_rates(*), pricing_rules(*)')
    .eq('id', invoiceId)
    .single()
  if (!data) throw { status: 404, message: 'Not found' }
  const editError = checkEditPermission({
    isLocked:  data.is_locked,
    status:    data.status,
    role:      ctx.role,
    createdBy: (data as any).created_by_user_id,
    userId:    ctx.userId,
  })
  if (editError) throw { status: 403, message: editError }
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
    const ctx  = await requireRole('user')
    const body = await req.json()
    const db   = createServiceClient()

    await guardAndCheck(db, params.id, ctx)

    const { error } = await db
      .from('item_gem_details')
      .insert({
        invoice_item_id:     params.itemId,
        gem_code:            body.gem_code            ?? null,
        price_unit:          body.price_unit          ?? 'per_ct',
        gem_type:            body.gem_type            ?? null,
        quality:             body.quality             ?? null,
        shape:               body.shape               ?? null,
        size_mm:             body.size_mm             ?? null,
        qty_pcs:             body.qty_pcs             ?? 1,
        weight_ct_before:    body.weight_ct_before    ?? null,
        weight_ct_after:     body.weight_ct_after     ?? 0,
        unit_price_per_ct:   body.unit_price_per_ct   ?? 0,
        setting_type:        body.setting_type        ?? null,
        setting_fee_per_pcs: body.setting_fee_per_pcs ?? 0,
        sort_order:          body.sort_order          ?? 0,
      })

    if (error) throw error
    await triggerRecalc(db, params.itemId, params.id)

    // Return the recalculated parent item (with updated gems) for local state update
    const { data: updatedItem } = await db
      .from('invoice_items')
      .select('*, item_gem_details(*)')
      .eq('id', params.itemId)
      .single()

    return NextResponse.json({ success: true, data: updatedItem })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
