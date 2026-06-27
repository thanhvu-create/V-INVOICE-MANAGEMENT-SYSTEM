import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'
import { writeAuditLog } from '@/lib/audit/log'
import { recalcItem, recalcDiamond, nvlFromInvoice, InvoiceTemplate } from '@/lib/formulas/pricing'

const PRICE_FIELDS = new Set([
  'qt_pcs', 'wt_gr', 't_pham_co_nvl_da', 'loai_vang',
  'gia_cong', 'duc', 'thiet_ke', 'resin', 'phi_phu_kien', 'sub_class',
])
import { resolvePhiPhuKien } from '@/lib/formulas/assembly-pricing'
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
      .select('status, created_by, template_type, nvl_gold_24k, nvl_pt_price, nvl_ag_price, nvl_pd_price, nvl_loss_gold, nvl_loss_pt, nvl_cif_rate, nvl_tag_multiplier, nvl_fr_multiplier')
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
      'resin', 'phi_phu_kien', 'nini_adm', 'customer_name',
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

    // When sub_class changes, auto-fill assembly fees from DB rules (CH1/CH2/ADM).
    // phi_phu_kien also depends on loai_vang: PT=$50, AG/SV=$10, others=table value.
    const hasFees = ['CH1', 'CH2', 'ADM'].includes((invoice as any).template_type ?? 'CH1')
    if ('sub_class' in updates && hasFees) {
      const { data: asmRules } = await db
        .from('assembly_pricing_rules')
        .select('sub_class, gia_cong, duc, thiet_ke, resin, phi_phu_kien')
      const rule = (asmRules ?? []).find(
        r => r.sub_class.toUpperCase() === String(updates.sub_class ?? '').toUpperCase()
      )
      if (rule) {
        // Resolve loai_vang: use value from this request if being patched, else fetch existing
        let loaiVang: string | null = (updates.loai_vang as string) ?? null
        if (!loaiVang) {
          const { data: existing } = await db.from('invoice_products').select('loai_vang').eq('id', params.itemId).single()
          loaiVang = existing?.loai_vang ?? null
        }
        updates.gia_cong     = rule.gia_cong
        updates.duc          = rule.duc
        updates.thiet_ke     = rule.thiet_ke
        updates.resin        = rule.resin
        updates.phi_phu_kien = resolvePhiPhuKien(rule.phi_phu_kien, loaiVang, String(updates.sub_class ?? ''))
      }
    }

    // When loai_vang changes (without sub_class) and phi_phu_kien not explicitly set,
    // re-resolve phi_phu_kien based on existing sub_class + new metal type.
    if ('loai_vang' in updates && !('sub_class' in updates) && !('phi_phu_kien' in updates) && hasFees) {
      const { data: existing } = await db.from('invoice_products').select('sub_class, phi_phu_kien').eq('id', params.itemId).single()
      const subClass = existing?.sub_class ?? null
      if (subClass) {
        const { data: asmRules } = await db.from('assembly_pricing_rules').select('sub_class, phi_phu_kien').eq('sub_class', subClass).single()
        const base = asmRules?.phi_phu_kien ?? existing?.phi_phu_kien ?? 30
        updates.phi_phu_kien = resolvePhiPhuKien(base, String(updates.loai_vang ?? ''), subClass)
      }
    }

    // AG3 templates have no gems and no fabrication fees — always zero them out
    if (['CH1_AG3', 'VNSI_AG3'].includes((invoice as any).template_type ?? '')) {
      updates.gia_cong = 0; updates.duc = 0; updates.thiet_ke = 0
      updates.resin    = 0; updates.phi_phu_kien = 0
    }

    const { data: item, error } = await db
      .from('invoice_products')
      .update(updates)
      .eq('id', params.itemId)
      .eq('invoice_id', params.id)
      .select()
      .single()

    if (error) throw error

    writeAuditLog({ invoiceId: params.id, userId: ctx.userId, action: 'item_updated', metadata: { seq: item.seq, sku: item.sku } })

    const needsRecalc = Object.keys(updates).some(k => PRICE_FIELDS.has(k))
    if (needsRecalc) {
      const nvl      = nvlFromInvoice(invoice)
      const template = ((invoice as any).template_type ?? 'CH1') as InvoiceTemplate
      const { data: diamonds } = await db.from('invoice_diamonds').select('*').eq('product_id', params.itemId)
      const gemList = diamonds ?? []

      const recalcedGems = gemList.map(d => {
        const derived = recalcDiamond(d, template)
        return { ...d, ...derived, _update: derived }
      })
      if (recalcedGems.length) {
        await Promise.all(recalcedGems.map(g =>
          db.from('invoice_diamonds').update(g._update).eq('id', g.id)
        ))
      }
      const cleanGems = recalcedGems.map(({ _update, ...rest }) => rest)
      const recalc = recalcItem(item, cleanGems as any, nvl, template)
      await db.from('invoice_products').update(recalc).eq('id', params.itemId)
    }

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
