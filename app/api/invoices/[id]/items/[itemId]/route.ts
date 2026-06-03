import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'
import { writeAuditLog } from '@/lib/audit/log'
import { recalcItem } from '@/lib/formulas/pricing'
import { checkEditPermission } from '@/lib/auth/editGuard'

type Params = { params: { id: string; itemId: string } }

// PATCH /api/invoices/[id]/items/[itemId]
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx  = await requireRole('user')
    const body = await req.json()
    const db   = createServiceClient()

    const { data: invoice } = await db
      .from('invoice_headers')
      .select('is_locked, status, created_by_user_id, daily_metal_rates(*), pricing_rules(*)')
      .eq('id', params.id)
      .single()

    if (!invoice) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 })
    const editErrorPatch = checkEditPermission({ isLocked: invoice.is_locked, status: invoice.status, role: ctx.role, createdBy: (invoice as any).created_by_user_id, userId: ctx.userId })
    if (editErrorPatch) return NextResponse.json({ success: false, message: editErrorPatch }, { status: 403 })

    const EDITABLE = [
      'description', 'store', 'location_store', 'so_mo_code', 'vendor_model',
      'qty_pcs', 'weight_total_gr', 'weight_gold_actual_gr', 'metal_type',
      'class', 'sub_class', 'labor_fee', 'casting_fee', 'design_fee',
      'resin_fee', 'misc_fee', 'sell_price', 'discount_pct',
      'notes', 'ship_date', 'tracking_no', 'vinvoice_no', 'size', 'customer_name',
      'image_url', 'price_list_type',
    ]
    const updates: Record<string, unknown> = {}
    for (const k of EDITABLE) { if (k in body) updates[k] = body[k] }

    // Compute after_discount_price server-side when sell_price or discount_pct changes
    if ('sell_price' in updates || 'discount_pct' in updates) {
      const { data: cur } = await db.from('invoice_items').select('sell_price, discount_pct').eq('id', params.itemId).single()
      const sp  = ('sell_price'   in updates ? updates.sell_price   : cur?.sell_price)   as number | null
      const pct = ('discount_pct' in updates ? updates.discount_pct : cur?.discount_pct) as number | null
      updates.after_discount_price = (sp != null && pct != null) ? sp * (1 - pct / 100) : sp ?? null
    }

    const { data: item, error } = await db
      .from('invoice_items')
      .update(updates)
      .eq('id', params.itemId)
      .eq('invoice_id', params.id)
      .select()
      .single()

    if (error) throw error

    // Recalculate pricing fields (include markup tiers for sell_price auto-calc)
    const [{ data: gems }, { data: tiers }] = await Promise.all([
      db.from('item_gem_details').select('*').eq('invoice_item_id', params.itemId),
      db.from('mk_store_markup').select('value_from, value_to, markups').order('sort_order'),
    ])
    const rate = (invoice as any).daily_metal_rates
    const rule = (invoice as any).pricing_rules
    if (rate && rule) {
      const recalc = recalcItem(item, gems ?? [], rate, rule, tiers ?? [])
      await db.from('invoice_items').update(recalc).eq('id', params.itemId)
    }

    writeAuditLog({ invoiceId: params.id, userId: ctx.userId, action: 'item_updated', metadata: { line_no: item.line_no, sku: item.sku_jwmold } })

    // Re-fetch the item WITH recalculated values + gems for client-side local state update
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

// DELETE /api/invoices/[id]/items/[itemId]
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireRole('user')
    const db  = createServiceClient()

    const { data: invoice } = await db
      .from('invoice_headers')
      .select('is_locked, status, created_by_user_id')
      .eq('id', params.id)
      .single()

    if (!invoice) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 })
    const editErrorDel = checkEditPermission({ isLocked: invoice.is_locked, status: invoice.status, role: ctx.role, createdBy: (invoice as any).created_by_user_id, userId: ctx.userId })
    if (editErrorDel) return NextResponse.json({ success: false, message: editErrorDel }, { status: 403 })

    const { data: item } = await db.from('invoice_items').select('line_no, sku_jwmold').eq('id', params.itemId).single()
    const { error } = await db.from('invoice_items').delete().eq('id', params.itemId).eq('invoice_id', params.id)
    if (error) throw error

    writeAuditLog({ invoiceId: params.id, userId: ctx.userId, action: 'item_deleted', metadata: { line_no: item?.line_no, sku: item?.sku_jwmold } })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
