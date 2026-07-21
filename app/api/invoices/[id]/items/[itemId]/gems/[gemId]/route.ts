import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'
import { recalcDiamond } from '@/lib/formulas/pricing'
import type { InvoiceTemplate } from '@/lib/formulas/pricing'
import { triggerItemRecalc } from '@/lib/formulas/recalc-helpers'
import { checkEditPermission } from '@/lib/auth/editGuard'

type Params = { params: { id: string; itemId: string; gemId: string } }

// PATCH /api/invoices/[id]/items/[itemId]/gems/[gemId]
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx  = await requireRole('user')
    const body = await req.json()
    const db   = createServiceClient()

    const { data: inv } = await db.from('invoices')
      .select('status, created_by, template_type, nvl_gold_24k, nvl_pt_price, nvl_ag_price, nvl_pd_price, nvl_loss_gold, nvl_loss_pt, nvl_cif_rate, nvl_tag_multiplier, nvl_fr_multiplier')
      .eq('id', params.id).single()
    if (!inv) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 })
    const editError = checkEditPermission({
      isLocked:  inv.status === 'finalized',
      status:    inv.status,
      role:      ctx.role,
      createdBy: inv.created_by,
      userId:    ctx.userId,
    })
    if (editError) return NextResponse.json({ success: false, message: editError }, { status: 403 })

    const template = ((inv as any).template_type ?? 'CH1') as InvoiceTemplate

    const EDITABLE = [
      'ma_xoan', 'p_chat', 'size_xoan_range',
      'sl_hot', 'tl_truoc_xu_ly_ct', 'tl_sau_xu_ly_ct',
      'don_gia', 'don_gia_phi', 'seq',
    ]
    const updates: Record<string, unknown> = {}
    for (const k of EDITABLE) { if (k in body) updates[k] = body[k] }

    const { data: existing } = await db.from('invoice_diamonds').select('*').eq('id', params.gemId).single()
    if (existing) {
      const merged = { ...existing, ...updates }
      Object.assign(updates, recalcDiamond(merged as any, template))
    }

    const { error } = await db.from('invoice_diamonds').update(updates).eq('id', params.gemId)
    if (error) throw error

    await triggerItemRecalc(db, params.itemId, inv)

    const { data: updatedItem } = await db
      .from('invoice_products')
      .select('*, invoice_diamonds(*), invoice_item_metals(*)')
      .eq('id', params.itemId)
      .single()

    return NextResponse.json({ success: true, data: updatedItem })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}

// DELETE /api/invoices/[id]/items/[itemId]/gems/[gemId]
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireRole('user')
    const db  = createServiceClient()

    const { data: inv } = await db.from('invoices')
      .select('status, created_by, template_type, nvl_gold_24k, nvl_pt_price, nvl_ag_price, nvl_pd_price, nvl_loss_gold, nvl_loss_pt, nvl_cif_rate, nvl_tag_multiplier, nvl_fr_multiplier')
      .eq('id', params.id).single()
    if (!inv) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 })
    const editError = checkEditPermission({
      isLocked:  inv.status === 'finalized',
      status:    inv.status,
      role:      ctx.role,
      createdBy: inv.created_by,
      userId:    ctx.userId,
    })
    if (editError) return NextResponse.json({ success: false, message: editError }, { status: 403 })

    const { error } = await db.from('invoice_diamonds').delete().eq('id', params.gemId)
    if (error) throw error

    await triggerItemRecalc(db, params.itemId, inv)

    const { data: updatedItem } = await db
      .from('invoice_products')
      .select('*, invoice_diamonds(*), invoice_item_metals(*)')
      .eq('id', params.itemId)
      .single()

    return NextResponse.json({ success: true, data: updatedItem })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
