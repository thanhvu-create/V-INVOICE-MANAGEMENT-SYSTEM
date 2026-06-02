import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'
import { recalcItem } from '@/lib/formulas/pricing'
import { checkEditPermission } from '@/lib/auth/editGuard'

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
    const ctx  = await requireRole('user')
    const body = await req.json()
    const db   = createServiceClient()

    const { data: inv } = await db.from('invoice_headers').select('is_locked, status, created_by_user_id').eq('id', params.id).single()
    if (!inv) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 })
    const editErrorPatch = checkEditPermission({ isLocked: inv.is_locked, status: inv.status, role: ctx.role, createdBy: (inv as any).created_by_user_id, userId: ctx.userId })
    if (editErrorPatch) return NextResponse.json({ success: false, message: editErrorPatch }, { status: 403 })

    const EDITABLE = [
      'gem_type', 'quality', 'shape', 'size_mm', 'qty_pcs',
      'weight_ct_before', 'weight_ct_after', 'unit_price_per_ct',
      'setting_type', 'setting_fee_per_pcs', 'sort_order',
    ]
    const updates: Record<string, unknown> = {}
    for (const k of EDITABLE) { if (k in body) updates[k] = body[k] }

    const { error } = await db.from('item_gem_details').update(updates).eq('id', params.gemId)
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

// DELETE /api/invoices/[id]/items/[itemId]/gems/[gemId]
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireRole('user')
    const db  = createServiceClient()

    const { data: inv } = await db.from('invoice_headers').select('is_locked, status, created_by_user_id').eq('id', params.id).single()
    if (!inv) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 })
    const editErrorDel = checkEditPermission({ isLocked: inv.is_locked, status: inv.status, role: ctx.role, createdBy: (inv as any).created_by_user_id, userId: ctx.userId })
    if (editErrorDel) return NextResponse.json({ success: false, message: editErrorDel }, { status: 403 })

    const { error } = await db.from('item_gem_details').delete().eq('id', params.gemId)
    if (error) throw error

    await triggerRecalc(db, params.itemId, params.id)

    // Return the recalculated parent item (with remaining gems) for local state update
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
