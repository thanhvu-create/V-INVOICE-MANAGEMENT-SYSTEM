import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole, AuthContext } from '@/lib/auth/getRole'
import { triggerItemRecalc } from '@/lib/formulas/recalc-helpers'
import { checkEditPermission } from '@/lib/auth/editGuard'

type Params = { params: { id: string; itemId: string } }

const INV_SELECT = 'status, created_by, template_type, nvl_gold_24k, nvl_pt_price, nvl_ag_price, nvl_pd_price, nvl_loss_gold, nvl_loss_pt, nvl_cif_rate, nvl_tag_multiplier, nvl_fr_multiplier'

async function guardAndCheck(db: ReturnType<typeof createServiceClient>, invoiceId: string, ctx: AuthContext) {
  const { data } = await db.from('invoices').select(INV_SELECT).eq('id', invoiceId).single()
  if (!data) throw { status: 404, message: 'Not found' }
  const editError = checkEditPermission({
    isLocked:  data.status === 'finalized',
    status:    data.status,
    role:      ctx.role,
    createdBy: data.created_by,
    userId:    ctx.userId,
  })
  if (editError) throw { status: 403, message: editError }
  return data
}

// GET /api/invoices/[id]/items/[itemId]/metals
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireRole('user')
    const db = createServiceClient()
    const { data, error } = await db.from('invoice_item_metals').select('*').eq('product_id', params.itemId).order('seq')
    if (error) throw error
    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}

// POST /api/invoices/[id]/items/[itemId]/metals
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx  = await requireRole('user')
    const body = await req.json()
    const db   = createServiceClient()

    const inv = await guardAndCheck(db, params.id, ctx)

    const { data: maxRow } = await db
      .from('invoice_item_metals')
      .select('seq')
      .eq('product_id', params.itemId)
      .order('seq', { ascending: false })
      .limit(1)
      .single()
    const seq = (maxRow?.seq ?? 0) + 1

    const { error } = await db.from('invoice_item_metals').insert({
      product_id: params.itemId,
      seq,
      loai_vang:  body.loai_vang ?? '',
      weight_gr:  body.weight_gr ?? 0,
    })
    if (error) throw error

    // triggerItemRecalc fills each metal's tien_vang and recomputes item totals.
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
