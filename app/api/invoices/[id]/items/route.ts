import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'
import { writeAuditLog } from '@/lib/audit/log'
import { recalcItem, nvlFromInvoice, InvoiceTemplate } from '@/lib/formulas/pricing'
import { checkEditPermission } from '@/lib/auth/editGuard'

type Params = { params: { id: string } }

// POST /api/invoices/[id]/items — add single item
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx  = await requireRole('user')
    const body = await req.json()
    const db   = createServiceClient()

    const { data: invoice } = await db
      .from('invoices')
      .select('status, created_by, template_type, nvl_gold_24k, nvl_pt_price, nvl_ag_price, nvl_pd_price, nvl_loss_gold, nvl_loss_pt, nvl_tag_multiplier, nvl_fr_multiplier')
      .eq('id', params.id)
      .single()

    if (!invoice) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 })
    const editError = checkEditPermission({
      isLocked:  invoice.status === 'finalized',
      status:    invoice.status,
      role:      ctx.role,
      createdBy: invoice.created_by,
      userId:    ctx.userId,
    })
    if (editError) return NextResponse.json({ success: false, message: editError }, { status: 403 })

    // Get next seq
    const { data: maxRow } = await db
      .from('invoice_products')
      .select('seq')
      .eq('invoice_id', params.id)
      .order('seq', { ascending: false })
      .limit(1)
      .single()

    const seq = (maxRow?.seq ?? 0) + 1

    const { data: item, error } = await db
      .from('invoice_products')
      .insert({
        invoice_id:        params.id,
        seq,
        sku:               body.sku               ?? null,
        description:       body.description       ?? null,
        store:             body.store             ?? null,
        location:          body.location          ?? null,
        so_mo:             body.so_mo             ?? null,
        qt_pcs:            body.qt_pcs            ?? 1,
        wt_gr:             body.wt_gr             ?? 0,
        t_pham_co_nvl_da:  body.t_pham_co_nvl_da  ?? body.wt_gr ?? 0,
        loai_vang:         body.loai_vang         ?? null,
        class:             body.class             ?? null,
        sub_class:         body.sub_class         ?? null,
        kich_thuoc:        body.kich_thuoc        ?? null,
        gia_cong:          body.gia_cong          ?? 0,
        duc:               body.duc               ?? 0,
        thiet_ke:          body.thiet_ke          ?? 0,
        resin:             body.resin             ?? 0,
        phi_phu_kien:      body.phi_phu_kien      ?? 0,
        bao_hiem:          body.bao_hiem          ?? null,
        nini_adm:          body.nini_adm          ?? null,
        ngay_gui:          body.ngay_gui          ?? null,
        tracking_no:       body.tracking_no       ?? null,
        hoa_don:           body.hoa_don           ?? null,
        vendor_model:      body.vendor_model      ?? null,
        po_number:         body.po_number         ?? null,
        sku_ag:            body.sku_ag            ?? null,
        chi_tiet_tap:      body.chi_tiet_tap      ?? null,
        erp_bom_cost:      body.erp_bom_cost      ?? null,
        image_url:         body.image_url         ?? null,
      })
      .select()
      .single()

    if (error) throw error

    const nvl      = nvlFromInvoice(invoice)
    const template = ((invoice as any).template_type ?? 'CH1') as InvoiceTemplate
    const updates  = recalcItem(item, [], nvl, template)
    await db.from('invoice_products').update(updates).eq('id', item.id)

    writeAuditLog({ invoiceId: params.id, userId: ctx.userId, action: 'item_added', metadata: { seq, sku: body.sku } })

    const { data: updatedItem } = await db
      .from('invoice_products')
      .select('*, invoice_diamonds(*)')
      .eq('id', item.id)
      .single()

    return NextResponse.json({ success: true, data: updatedItem ?? item })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
