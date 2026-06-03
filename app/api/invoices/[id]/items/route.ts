import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'
import { writeAuditLog } from '@/lib/audit/log'
import { recalcItem } from '@/lib/formulas/pricing'
import { checkEditPermission } from '@/lib/auth/editGuard'

type Params = { params: { id: string } }

// POST /api/invoices/[id]/items — add single item
export async function POST(req: NextRequest, { params }: Params) {
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
    const editError = checkEditPermission({ isLocked: invoice.is_locked, status: invoice.status, role: ctx.role, createdBy: (invoice as any).created_by_user_id, userId: ctx.userId })
    if (editError) return NextResponse.json({ success: false, message: editError }, { status: 403 })

    // Get next line_no
    const { data: maxRow } = await db
      .from('invoice_items')
      .select('line_no')
      .eq('invoice_id', params.id)
      .order('line_no', { ascending: false })
      .limit(1)
      .single()

    const lineNo = (maxRow?.line_no ?? 0) + 1

    // Fetch product defaults if SKU provided
    let productDefaults: Record<string, unknown> = {}
    if (body.sku_jwmold) {
      const { data: prod } = await db
        .from('bom_products')
        .select('description, class, sub_class, metal_type, labor_fee, casting_fee, design_fee, resin_fee, misc_fee, image_url')
        .eq('sku_jwmold', body.sku_jwmold)
        .eq('is_active', true)
        .single()
      if (prod) productDefaults = prod
    }

    const { data: item, error } = await db
      .from('invoice_items')
      .insert({
        invoice_id:            params.id,
        line_no:               lineNo,
        sku_jwmold:            body.sku_jwmold,
        description:           body.description           ?? productDefaults.description   ?? null,
        store:                 body.store                 ?? null,
        location_store:        body.location_store        ?? null,
        so_mo_code:            body.so_mo_code            ?? null,
        vendor_model:          body.vendor_model          ?? null,
        qty_pcs:               body.qty_pcs               ?? 1,
        weight_total_gr:       body.weight_total_gr       ?? 0,
        weight_gold_actual_gr: body.weight_gold_actual_gr ?? 0,
        metal_type:            body.metal_type            ?? productDefaults.metal_type   ?? null,
        class:                 body.class                 ?? productDefaults.class        ?? null,
        sub_class:             body.sub_class             ?? productDefaults.sub_class    ?? null,
        labor_fee:             body.labor_fee             ?? productDefaults.labor_fee    ?? 0,
        casting_fee:           body.casting_fee           ?? productDefaults.casting_fee  ?? 0,
        design_fee:            body.design_fee            ?? productDefaults.design_fee   ?? 0,
        resin_fee:             body.resin_fee             ?? productDefaults.resin_fee    ?? 0,
        misc_fee:              body.misc_fee              ?? productDefaults.misc_fee     ?? 0,
        image_url:             body.image_url             ?? (productDefaults as any).image_url ?? null,
      })
      .select()
      .single()

    if (error) throw error

    // Recalculate then return updated item (not stale insert result)
    const [{ data: tiers }] = await Promise.all([
      db.from('mk_store_markup').select('value_from, value_to, markups').order('sort_order'),
    ])
    const rate = (invoice as any).daily_metal_rates
    const rule = (invoice as any).pricing_rules
    if (rate && rule) {
      const updates = recalcItem(item, [], rate, rule, tiers ?? [])
      await db.from('invoice_items').update(updates).eq('id', item.id)
    }

    writeAuditLog({ invoiceId: params.id, userId: ctx.userId, action: 'item_added', metadata: { line_no: lineNo, sku: body.sku_jwmold } })

    const { data: updatedItem } = await db
      .from('invoice_items')
      .select('*, item_gem_details(*)')
      .eq('id', item.id)
      .single()

    return NextResponse.json({ success: true, data: updatedItem ?? item })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
