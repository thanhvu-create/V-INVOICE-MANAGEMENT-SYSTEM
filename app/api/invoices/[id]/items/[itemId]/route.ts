import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'
import { writeAuditLog } from '@/lib/audit/log'
import { recalcItem } from '@/lib/formulas/pricing'

type Params = { params: { id: string; itemId: string } }

// PATCH /api/invoices/[id]/items/[itemId]
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx  = await requireRole('user')
    const body = await req.json()
    const db   = createServiceClient()

    const { data: invoice } = await db
      .from('invoice_headers')
      .select('is_locked, daily_metal_rates(*), pricing_rules(*)')
      .eq('id', params.id)
      .single()

    if (!invoice) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 })
    if (invoice.is_locked) return NextResponse.json({ success: false, message: 'Invoice is locked' }, { status: 403 })

    const EDITABLE = [
      'description', 'store', 'location_store', 'so_mo_code', 'vendor_model',
      'qty_pcs', 'weight_total_gr', 'weight_gold_actual_gr', 'metal_type',
      'class', 'sub_class', 'labor_fee', 'casting_fee', 'design_fee',
      'resin_fee', 'misc_fee', 'sell_price', 'after_discount_price',
    ]
    const updates: Record<string, unknown> = {}
    for (const k of EDITABLE) { if (k in body) updates[k] = body[k] }

    const { data: item, error } = await db
      .from('invoice_items')
      .update(updates)
      .eq('id', params.itemId)
      .eq('invoice_id', params.id)
      .select()
      .single()

    if (error) throw error

    // Refetch gems for recalc
    const { data: gems } = await db.from('item_gem_details').select('*').eq('invoice_item_id', params.itemId)
    const rate = (invoice as any).daily_metal_rates
    const rule = (invoice as any).pricing_rules
    if (rate && rule) {
      const recalc = recalcItem(item, gems ?? [], rate, rule)
      await db.from('invoice_items').update(recalc).eq('id', params.itemId)
    }

    writeAuditLog({ invoiceId: params.id, userId: ctx.userId, action: 'item_updated', metadata: { line_no: item.line_no, sku: item.sku_jwmold } })

    return NextResponse.json({ success: true, data: item })
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
      .select('is_locked')
      .eq('id', params.id)
      .single()

    if (!invoice) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 })
    if (invoice.is_locked) return NextResponse.json({ success: false, message: 'Invoice is locked' }, { status: 403 })

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
