import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'
import { writeAuditLog } from '@/lib/audit/log'
import { recalcItem, nvlFromInvoice, InvoiceTemplate } from '@/lib/formulas/pricing'
import { extractVendorModel, extractKichThuoc, buildChiTietCap } from '@/lib/formulas/description-parse'
import { resolvePhiPhuKien } from '@/lib/formulas/assembly-pricing'
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
    const isAG3    = template === 'CH1_AG3' || template === 'VNSI_AG3'

    // Load class/sub_class rules for auto-detection from description prefix
    const { data: classRulesData } = await db
      .from('class_subclass_rules')
      .select('description_prefix, class, sub_class')
    const classRules = classRulesData ?? []

    // Load assembly pricing rules (for CH1/CH2 fee auto-fill)
    const hasFees = template === 'CH1' || template === 'CH2'
    type AssemblyRule = { sub_class: string; gia_cong: number; duc: number; thiet_ke: number; resin: number; phi_phu_kien: number }
    let assemblyRules: AssemblyRule[] = []
    if (hasFees) {
      const { data: asmData } = await db
        .from('assembly_pricing_rules')
        .select('sub_class, gia_cong, duc, thiet_ke, resin, phi_phu_kien')
      assemblyRules = asmData ?? []
    }

    const detectClass = (description: string | null | undefined) => {
      if (!description?.trim() || !classRules.length) return null
      const upper = description.trim().toUpperCase()
      const sorted = [...classRules].sort((a, b) => b.description_prefix.length - a.description_prefix.length)
      return sorted.find(r => upper.startsWith(r.description_prefix)) ?? null
    }

    const getAssemblyFees = (subClass: string | null | undefined, loaiVang: string | null | undefined) => {
      if (!subClass?.trim() || !assemblyRules.length) return null
      const rule = assemblyRules.find(r => r.sub_class.toUpperCase() === subClass.trim().toUpperCase())
      if (!rule) return null
      return { ...rule, phi_phu_kien: resolvePhiPhuKien(rule.phi_phu_kien, loaiVang, subClass) }
    }

    const itemsToInsert = rows.map((row, idx) => {
      const detected      = (!row.class && !row.subClass) ? detectClass(row.description) : null
      const detectedModel = extractVendorModel(row.description)
      const subClass      = row.subClass || detected?.sub_class || null
      const fees          = hasFees ? getAssemblyFees(subClass, row.loaiVang) : null
      const qty           = Math.max(1, row.qty ?? 1)
      const wtPerUnit     = isAG3 && row.weightTotal ? row.weightTotal / qty : null
      return {
        invoice_id:        invoiceId,
        seq:               startSeq + idx,
        sku:               row.sku               || null,
        store:             row.store             || null,
        location:          row.location          || null,
        so_mo:             isAG3 ? null : (row.soMo || null),
        po_number:         isAG3 ? (row.soMo ? (row.soMo.match(/^SO(.*?)(?:-MO|$)/)?.[1] ?? row.soMo) : null) : null,
        description:       row.description       || null,
        vendor_model:      detectedModel         || null,
        class:             row.class             || detected?.class || null,
        sub_class:         subClass,
        loai_vang:         row.loaiVang          || null,
        qt_pcs:            row.qty,
        wt_gr:             row.weightTotal,
        t_pham_co_nvl_da:  row.weightTotal,
        customer_name:     row.niniAdm              || null,
        image_url:         row.imageUrl             || null,
        kich_thuoc:        extractKichThuoc(row.description) || null,
        chi_tiet_tap:      isAG3 ? buildChiTietCap(row.description, wtPerUnit) : null,
        gia_cong:          fees?.gia_cong     ?? 0,
        duc:               fees?.duc          ?? 0,
        thiet_ke:          fees?.thiet_ke     ?? 0,
        resin:             fees?.resin        ?? 0,
        phi_phu_kien:      fees?.phi_phu_kien ?? 0,
      }
    })

    const itemsWithCalc = itemsToInsert.map(row => ({
      ...row,
      ...recalcItem(row, [], nvl, template),
    }))

    const { error: insertErr } = await db
      .from('invoice_products')
      .insert(itemsWithCalc)

    if (insertErr) throw insertErr

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
