import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'
import { writeAuditLog } from '@/lib/audit/log'
import { recalcItem, nvlFromInvoice, InvoiceTemplate } from '@/lib/formulas/pricing'
import { extractVendorModel } from '@/lib/formulas/description-parse'
import { checkEditPermission } from '@/lib/auth/editGuard'
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

    const { data: invoice } = await db
      .from('invoices')
      .select('id, status, created_by, template_type, nvl_gold_24k, nvl_pt_price, nvl_ag_price, nvl_pd_price, nvl_loss_gold, nvl_loss_pt, nvl_tag_multiplier, nvl_fr_multiplier')
      .eq('id', invoiceId)
      .single()

    if (!invoice) return NextResponse.json({ success: false, message: 'Invoice not found' }, { status: 404 })
    const editError = checkEditPermission({
      isLocked:  invoice.status === 'finalized',
      status:    invoice.status,
      role:      ctx.role,
      createdBy: invoice.created_by,
      userId:    ctx.userId,
    })
    if (editError) return NextResponse.json({ success: false, message: editError }, { status: 403 })

    // Get max existing seq
    const { data: maxRow } = await db
      .from('invoice_products')
      .select('seq')
      .eq('invoice_id', invoiceId)
      .order('seq', { ascending: false })
      .limit(1)
      .single()

    const startSeq = (maxRow?.seq ?? 0) + 1

    const nvl      = nvlFromInvoice(invoice)
    const template = ((invoice as any).template_type ?? 'CH1') as InvoiceTemplate

    // Load class/sub_class rules for auto-detection from description prefix
    const { data: classRules = [] } = await db
      .from('class_subclass_rules')
      .select('description_prefix, class, sub_class')

    function detectClass(description: string | null | undefined) {
      if (!description?.trim() || !classRules.length) return null
      const upper = description.trim().toUpperCase()
      const sorted = [...classRules].sort((a, b) => b.description_prefix.length - a.description_prefix.length)
      return sorted.find(r => upper.startsWith(r.description_prefix)) ?? null
    }

    const itemsToInsert = rows.map((row, idx) => {
      const detected      = (!row.class && !row.subClass) ? detectClass(row.description) : null
      const detectedModel = extractVendorModel(row.description)
      return {
        invoice_id:        invoiceId,
        seq:               startSeq + idx,
        sku:               row.sku               || null,
        store:             row.store             || null,
        location:          row.location          || null,
        so_mo:             row.soMo              || null,
        description:       row.description       || null,
        vendor_model:      detectedModel         || null,
        class:             row.class             || detected?.class     || null,
        sub_class:         row.subClass          || detected?.sub_class || null,
        loai_vang:         row.loaiVang          || null,
        qt_pcs:            row.qty,
        wt_gr:             row.weightTotal,
        t_pham_co_nvl_da:  row.weightTotal,
        customer_name:     row.niniAdm           || null,
        image_url:         row.imageUrl           || null,
      }
    })

    const { data: inserted, error: insertErr } = await db
      .from('invoice_products')
      .insert(itemsToInsert)
      .select()

    if (insertErr) throw insertErr

    if (inserted) {
      for (const item of inserted) {
        const updates = recalcItem(item, [], nvl, template)
        await db.from('invoice_products').update(updates).eq('id', item.id)
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
