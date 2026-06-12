import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'
import { writeAuditLog } from '@/lib/audit/log'
import { recalcItem, recalcDiamond, nvlFromInvoice, InvoiceTemplate } from '@/lib/formulas/pricing'
import { checkEditPermission } from '@/lib/auth/editGuard'

type Params = { params: { id: string; itemId: string } }

// PATCH /api/invoices/[id]/items/[itemId]
export async function PATCH(req: NextRequest, { params }: Params) {
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

    const EDITABLE = [
      'description', 'store', 'location', 'so_mo',
      'qt_pcs', 'wt_gr', 't_pham_co_nvl_da', 'loai_vang',
      'class', 'sub_class', 'gia_cong', 'duc', 'thiet_ke',
      'resin', 'phi_phu_kien', 'nini_adm',
      'ngay_gui', 'tracking_no', 'hoa_don', 'kich_thuoc',
      'image_url', 'bao_hiem', 'vendor_model',
      'po_number', 'sku_ag', 'chi_tiet_tap',
      'erp_bom_cost',
      'tag_price', 'fb_price',
    ]
    const updates: Record<string, unknown> = {}
    for (const k of EDITABLE) {
      if (k in body) updates[k] = body[k]
    }
    // Keep wt_gr and t_pham_co_nvl_da in sync
    if ('wt_gr' in updates && !('t_pham_co_nvl_da' in updates)) {
      updates.t_pham_co_nvl_da = updates.wt_gr
    }

    const { data: item, error } = await db
      .from('invoice_products')
      .update(updates)
      .eq('id', params.itemId)
      .eq('invoice_id', params.id)
      .select()
      .single()

    if (error) throw error

    // Recalculate: first update diamond derived fields, then recalc item
    const { data: diamonds } = await db.from('invoice_diamonds').select('*').eq('product_id', params.itemId)
    const gemList = diamonds ?? []
    if (gemList.length) {
      await Promise.all(gemList.map(d =>
        db.from('invoice_diamonds').update(recalcDiamond(d, template)).eq('id', d.id)
      ))
    }
    const updatedGems = gemList.map(d => ({ ...d, ...recalcDiamond(d, template) }))

    const nvl      = nvlFromInvoice(invoice)
    const template = ((invoice as any).template_type ?? 'CH1') as InvoiceTemplate
    const recalc   = recalcItem(item, updatedGems as any, nvl, template)
    await db.from('invoice_products').update(recalc).eq('id', params.itemId)

    writeAuditLog({ invoiceId: params.id, userId: ctx.userId, action: 'item_updated', metadata: { seq: item.seq, sku: item.sku } })

    const { data: updatedItem } = await db
      .from('invoice_products')
      .select('*, invoice_diamonds(*)')
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
      .from('invoices')
      .select('status, created_by')
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

    const { data: item } = await db.from('invoice_products').select('seq, sku').eq('id', params.itemId).single()
    const { error } = await db.from('invoice_products').delete().eq('id', params.itemId).eq('invoice_id', params.id)
    if (error) throw error

    writeAuditLog({ invoiceId: params.id, userId: ctx.userId, action: 'item_deleted', metadata: { seq: item?.seq, sku: item?.sku } })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
