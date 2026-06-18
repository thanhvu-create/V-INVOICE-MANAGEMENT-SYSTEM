import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'
import { recalcItem, recalcDiamond, nvlFromInvoice, InvoiceTemplate } from '@/lib/formulas/pricing'
import { checkEditPermission } from '@/lib/auth/editGuard'

type Params = { params: { id: string; itemId: string; gemId: string } }

async function triggerRecalc(db: ReturnType<typeof createServiceClient>, itemId: string, invoiceId: string) {
  const [{ data: item }, { data: diamonds }, { data: invoice }] = await Promise.all([
    db.from('invoice_products').select('*').eq('id', itemId).single(),
    db.from('invoice_diamonds').select('*').eq('product_id', itemId),
    db.from('invoices').select('template_type, nvl_gold_24k, nvl_pt_price, nvl_ag_price, nvl_pd_price, nvl_loss_gold, nvl_loss_pt, nvl_cif_rate, nvl_tag_multiplier, nvl_fr_multiplier').eq('id', invoiceId).single(),
  ])
  if (item && invoice) {
    const gemList = diamonds ?? []
    const template = ((invoice as any).template_type ?? 'CH1') as InvoiceTemplate
    if (gemList.length) {
      await Promise.all(gemList.map(d =>
        db.from('invoice_diamonds').update(recalcDiamond(d, template)).eq('id', d.id)
      ))
    }
    const updatedGems = gemList.map(d => ({ ...d, ...recalcDiamond(d, template) }))
    const nvl     = nvlFromInvoice(invoice)
    const updates = recalcItem(item, updatedGems as any, nvl, template)
    await db.from('invoice_products').update(updates).eq('id', itemId)
  }
}

// PATCH /api/invoices/[id]/items/[itemId]/gems/[gemId]
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx  = await requireRole('user')
    const body = await req.json()
    const db   = createServiceClient()

    const { data: inv } = await db.from('invoices').select('status, created_by, template_type').eq('id', params.id).single()
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

    // Immediately compute derived fields from the updated values
    const { data: existing } = await db.from('invoice_diamonds').select('*').eq('id', params.gemId).single()
    if (existing) {
      const merged = { ...existing, ...updates }
      const derived = recalcDiamond(merged as any, template)
      Object.assign(updates, derived)
    }

    const { error } = await db.from('invoice_diamonds').update(updates).eq('id', params.gemId)
    if (error) throw error

    await triggerRecalc(db, params.itemId, params.id)

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

// DELETE /api/invoices/[id]/items/[itemId]/gems/[gemId]
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireRole('user')
    const db  = createServiceClient()

    const { data: inv } = await db.from('invoices').select('status, created_by').eq('id', params.id).single()
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

    await triggerRecalc(db, params.itemId, params.id)

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
