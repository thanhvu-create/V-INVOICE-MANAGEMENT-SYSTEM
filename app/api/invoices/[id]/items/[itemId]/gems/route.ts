import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole, AuthContext } from '@/lib/auth/getRole'
import { recalcItem, recalcDiamond, nvlFromInvoice, InvoiceTemplate } from '@/lib/formulas/pricing'
import { checkEditPermission } from '@/lib/auth/editGuard'

type Params = { params: { id: string; itemId: string } }

async function guardAndCheck(db: ReturnType<typeof createServiceClient>, invoiceId: string, ctx: AuthContext) {
  const { data } = await db
    .from('invoices')
    .select('status, created_by')
    .eq('id', invoiceId)
    .single()
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

async function triggerRecalc(db: ReturnType<typeof createServiceClient>, itemId: string, invoiceId: string) {
  const [{ data: item }, { data: diamonds }, { data: invoice }] = await Promise.all([
    db.from('invoice_products').select('*').eq('id', itemId).single(),
    db.from('invoice_diamonds').select('*').eq('product_id', itemId),
    db.from('invoices').select('template_type, nvl_gold_24k, nvl_pt_price, nvl_ag_price, nvl_pd_price, nvl_loss_gold, nvl_loss_pt, nvl_tag_multiplier, nvl_fr_multiplier').eq('id', invoiceId).single(),
  ])
  if (item && invoice) {
    const gemList = diamonds ?? []
    if (gemList.length) {
      await Promise.all(gemList.map(d =>
        db.from('invoice_diamonds').update(recalcDiamond(d)).eq('id', d.id)
      ))
    }
    const updatedGems = gemList.map(d => ({ ...d, ...recalcDiamond(d) }))
    const nvl      = nvlFromInvoice(invoice)
    const template = ((invoice as any).template_type ?? 'CH1') as InvoiceTemplate
    const updates  = recalcItem(item, updatedGems as any, nvl, template)
    await db.from('invoice_products').update(updates).eq('id', itemId)
  }
}

// GET /api/invoices/[id]/items/[itemId]/gems
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireRole('user')
    const db = createServiceClient()
    const { data, error } = await db.from('invoice_diamonds').select('*').eq('product_id', params.itemId).order('seq')
    if (error) throw error
    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}

// POST /api/invoices/[id]/items/[itemId]/gems
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx  = await requireRole('user')
    const body = await req.json()
    const db   = createServiceClient()

    await guardAndCheck(db, params.id, ctx)

    // Get next seq
    const { data: maxRow } = await db
      .from('invoice_diamonds')
      .select('seq')
      .eq('product_id', params.itemId)
      .order('seq', { ascending: false })
      .limit(1)
      .single()

    const seq = (maxRow?.seq ?? 0) + 1

    const tl_truoc = body.tl_truoc_xu_ly_ct ?? null
    const don_gia  = body.don_gia           ?? 0
    const sl_hot   = body.sl_hot            ?? 1

    const { error } = await db
      .from('invoice_diamonds')
      .insert({
        product_id:          params.itemId,
        seq,
        ma_xoan:             body.ma_xoan             ?? null,
        p_chat:              body.p_chat              ?? 'VVS1',
        size_xoan_range:     body.size_xoan_range     ?? null,
        sl_hot,
        tl_truoc_xu_ly_ct:   tl_truoc,
        tl_sau_xu_ly_ct:     body.tl_sau_xu_ly_ct    ?? null,
        don_gia,
        don_gia_phi:         1,
        // Computed immediately on insert
        tl_xoan_gr:          tl_truoc != null ? tl_truoc / 5 : null,
        t_gia_xoan:          tl_truoc != null ? tl_truoc * don_gia : null,
        t_phi:               sl_hot * 1,
      })

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
