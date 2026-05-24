import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'
import { writeAuditLog } from '@/lib/audit/log'
import { recalcItem } from '@/lib/formulas/pricing'
import type { ImportRow } from '@/types'

// POST /api/import
// Body: { invoiceId: string, rows: ImportRow[] }
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole('user')
    const { invoiceId, rows } = await req.json() as { invoiceId: string; rows: ImportRow[] }

    if (!invoiceId) return NextResponse.json({ success: false, message: 'invoiceId is required' }, { status: 400 })
    if (!rows?.length) return NextResponse.json({ success: false, message: 'No rows to import' }, { status: 400 })

    const db = createServiceClient()

    // Lock guard + invoice existence
    const { data: invoice } = await db
      .from('invoice_headers')
      .select('id, is_locked, status, metal_rate_id, pricing_rule_id, daily_metal_rates(*), pricing_rules(*)')
      .eq('id', invoiceId)
      .single()

    if (!invoice) return NextResponse.json({ success: false, message: 'Invoice not found' }, { status: 404 })
    if (invoice.is_locked) return NextResponse.json({ success: false, message: 'Invoice is locked' }, { status: 403 })

    // Get max existing line_no
    const { data: maxRow } = await db
      .from('invoice_items')
      .select('line_no')
      .eq('invoice_id', invoiceId)
      .order('line_no', { ascending: false })
      .limit(1)
      .single()

    const startLineNo = (maxRow?.line_no ?? 0) + 1

    // Batch fetch product fees for all SKUs
    const skus = Array.from(new Set(rows.map(r => r.sku)))
    const { data: products } = await db
      .from('bom_products')
      .select('sku_jwmold, description, labor_fee, casting_fee, design_fee, resin_fee, misc_fee')
      .in('sku_jwmold', skus)

    const feeMap = Object.fromEntries((products ?? []).map(p => [p.sku_jwmold, p]))

    const rate = (invoice as any).daily_metal_rates
    const rule = (invoice as any).pricing_rules

    // Build insert rows
    const itemsToInsert = rows.map((row, idx) => {
      const fees = feeMap[row.sku] ?? {}
      return {
        invoice_id:            invoiceId,
        line_no:               startLineNo + idx,
        sku_jwmold:            row.sku,
        store:                 row.store || null,
        location_store:        row.location || null,
        so_mo_code:            row.soMo || null,
        vendor_model:          row.vendorModel || null,
        description:           row.description || fees.description || null,
        qty_pcs:               row.qty,
        weight_total_gr:       row.weightTotal,
        weight_gold_actual_gr: row.weightGold,
        metal_type:            row.metalType || null,
        class:                 row.class || null,
        sub_class:             row.subClass || null,
        labor_fee:             fees.labor_fee   ?? 0,
        casting_fee:           fees.casting_fee ?? 0,
        design_fee:            fees.design_fee  ?? 0,
        resin_fee:             fees.resin_fee   ?? 0,
        misc_fee:              fees.misc_fee    ?? 0,
      }
    })

    const { data: inserted, error: insertErr } = await db
      .from('invoice_items')
      .insert(itemsToInsert)
      .select()

    if (insertErr) throw insertErr

    // Recalculate pricing for each inserted item (if rate + rule exist)
    if (rate && rule && inserted) {
      for (const item of inserted) {
        const updates = recalcItem(item, [], rate, rule)
        await db.from('invoice_items').update(updates).eq('id', item.id)
      }
    }

    writeAuditLog({
      invoiceId,
      userId:   ctx.userId,
      action:   'items_imported',
      metadata: { count: rows.length },
    })

    return NextResponse.json({ success: true, data: { imported: rows.length } })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
