import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'
import { writeAuditLog } from '@/lib/audit/log'
import { recalcItem, recalcDiamond, nvlFromInvoice, InvoiceTemplate } from '@/lib/formulas/pricing'
import { resolvePhiPhuKien, hasGemsInDescription } from '@/lib/formulas/assembly-pricing'
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

    // ── Assembly fee auto-fill (CH1/CH2 only) ──
    // Logic: description contains "cts" → has gems → lookup assembly rules by sub_class
    //        no "cts" → no gems → all fees = 0
    const hasFees = ['CH1', 'CH2', 'ADM'].includes((invoice as any).template_type ?? 'CH1')
    if (hasFees) {
      let effectiveDesc = ('description' in updates) ? (updates.description as string) : null
      if (effectiveDesc === null) {
        const { data: cur } = await db.from('invoice_products').select('description').eq('id', params.itemId).single()
        effectiveDesc = cur?.description ?? null
      }
      const itemHasGems = hasGemsInDescription(effectiveDesc)

      if (!itemHasGems) {
        updates.gia_cong = 0; updates.duc = 0; updates.thiet_ke = 0
        updates.resin    = 0; updates.phi_phu_kien = 0
      } else {
        // sub_class changes → lookup assembly rules, fill fees not explicitly sent
        if ('sub_class' in updates) {
          const { data: asmRules } = await db
            .from('assembly_pricing_rules')
            .select('sub_class, gia_cong, duc, thiet_ke, resin, phi_phu_kien')
          const rule = (asmRules ?? []).find(
            r => r.sub_class.toUpperCase() === String(updates.sub_class ?? '').toUpperCase()
          )
          if (rule) {
            let loaiVang: string | null = (updates.loai_vang as string) ?? null
            if (!loaiVang) {
              const { data: existing } = await db.from('invoice_products').select('loai_vang').eq('id', params.itemId).single()
              loaiVang = existing?.loai_vang ?? null
            }
            if (!('gia_cong' in body))     updates.gia_cong     = rule.gia_cong
            if (!('duc' in body))          updates.duc          = rule.duc
            if (!('thiet_ke' in body))     updates.thiet_ke     = rule.thiet_ke
            if (!('resin' in body))        updates.resin        = rule.resin
            if (!('phi_phu_kien' in body)) updates.phi_phu_kien = resolvePhiPhuKien(rule.phi_phu_kien, loaiVang, String(updates.sub_class ?? ''))
          }
        }

        // Backfill: sub_class not changed but all fees are 0 (stale import or description just gained "cts")
        if (!('sub_class' in updates)) {
          const feeKeys = ['gia_cong', 'duc', 'thiet_ke', 'resin', 'phi_phu_kien']
          const { data: cur } = await db.from('invoice_products').select('sub_class, loai_vang, gia_cong, duc, thiet_ke, resin, phi_phu_kien').eq('id', params.itemId).single()
          if (cur) {
            const allZero = feeKeys.every(k => !(k in updates) && ((cur as any)[k] ?? 0) === 0)
            const subClass = String(cur.sub_class ?? '').trim()
            if (allZero && subClass) {
              const { data: asmRules } = await db.from('assembly_pricing_rules').select('sub_class, gia_cong, duc, thiet_ke, resin, phi_phu_kien')
              const rule = (asmRules ?? []).find(r => r.sub_class.toUpperCase() === subClass.toUpperCase())
              if (rule) {
                const loaiVang = (updates.loai_vang as string) ?? cur.loai_vang ?? null
                updates.gia_cong     = rule.gia_cong
                updates.duc          = rule.duc
                updates.thiet_ke     = rule.thiet_ke
                updates.resin        = rule.resin
                updates.phi_phu_kien = resolvePhiPhuKien(rule.phi_phu_kien, loaiVang, subClass)
              }
            }
          }
        }

        // loai_vang changes → re-resolve phi_phu_kien for existing sub_class
        if ('loai_vang' in updates && !('sub_class' in updates) && !('phi_phu_kien' in updates)) {
          const { data: existing } = await db.from('invoice_products').select('sub_class, phi_phu_kien').eq('id', params.itemId).single()
          const subClass = existing?.sub_class ?? null
          if (subClass) {
            const { data: asmRules } = await db.from('assembly_pricing_rules').select('sub_class, phi_phu_kien').eq('sub_class', subClass).single()
            const base = asmRules?.phi_phu_kien ?? existing?.phi_phu_kien ?? 30
            updates.phi_phu_kien = resolvePhiPhuKien(base, String(updates.loai_vang ?? ''), subClass)
          }
        }
      }
    }

    // AG3 templates: no fabrication fees
    if (['CH1_AG3', 'VNSI_AG3'].includes((invoice as any).template_type ?? '')) {
      updates.gia_cong = 0; updates.duc = 0; updates.thiet_ke = 0
      updates.resin    = 0; updates.phi_phu_kien = 0
    }

    let item: any
    if (Object.keys(updates).length > 0) {
      const { data, error } = await db
        .from('invoice_products')
        .update(updates)
        .eq('id', params.itemId)
        .eq('invoice_id', params.id)
        .select()
        .single()
      if (error) throw error
      item = data
      writeAuditLog({ invoiceId: params.id, userId: ctx.userId, action: 'item_updated', metadata: { seq: item.seq, sku: item.sku } })
    } else {
      const { data } = await db.from('invoice_products').select('*').eq('id', params.itemId).single()
      item = data
    }

    {
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
