import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'
import { triggerItemRecalc } from '@/lib/formulas/recalc-helpers'
import { checkEditPermission } from '@/lib/auth/editGuard'

type Params = { params: { id: string; itemId: string; metalId: string } }

const INV_SELECT = 'status, created_by, template_type, nvl_gold_24k, nvl_pt_price, nvl_ag_price, nvl_pd_price, nvl_loss_gold, nvl_loss_pt, nvl_cif_rate, nvl_tag_multiplier, nvl_fr_multiplier'

async function loadAndGuard(db: ReturnType<typeof createServiceClient>, invoiceId: string, ctx: { role: string; userId: string }) {
  const { data: inv } = await db.from('invoices').select(INV_SELECT).eq('id', invoiceId).single()
  if (!inv) throw { status: 404, message: 'Not found' }
  const editError = checkEditPermission({
    isLocked:  inv.status === 'finalized',
    status:    inv.status,
    role:      ctx.role,
    createdBy: inv.created_by,
    userId:    ctx.userId,
  })
  if (editError) throw { status: 403, message: editError }
  return inv
}

// PATCH /api/invoices/[id]/items/[itemId]/metals/[metalId]
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx  = await requireRole('user')
    const body = await req.json()
    const db   = createServiceClient()

    const inv = await loadAndGuard(db, params.id, ctx)

    const EDITABLE = ['loai_vang', 'weight_gr', 'seq']
    const updates: Record<string, unknown> = {}
    for (const k of EDITABLE) { if (k in body) updates[k] = body[k] }

    if (Object.keys(updates).length > 0) {
      const { error } = await db.from('invoice_item_metals').update(updates).eq('id', params.metalId)
      if (error) throw error
    }

    // triggerItemRecalc recomputes each metal's tien_vang and item totals.
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

// DELETE /api/invoices/[id]/items/[itemId]/metals/[metalId]
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireRole('user')
    const db  = createServiceClient()

    const inv = await loadAndGuard(db, params.id, ctx)

    const { error } = await db.from('invoice_item_metals').delete().eq('id', params.metalId)
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
