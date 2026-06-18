import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext, requireRole } from '@/lib/auth/getRole'
import { writeAuditLog } from '@/lib/audit/log'
import { checkEditPermission } from '@/lib/auth/editGuard'
import { recalcItem, recalcDiamond, nvlFromInvoice, InvoiceTemplate } from '@/lib/formulas/pricing'

type Params = { params: { id: string } }

// GET /api/invoices/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

    const db = createServiceClient()

    const [headerRes, itemsRes] = await Promise.all([
      db.from('invoices')
        .select('*')
        .eq('id', params.id)
        .single(),
      db.from('invoice_products')
        .select('*, invoice_diamonds(*)')
        .eq('invoice_id', params.id)
        .order('seq', { ascending: true }),
    ])

    if (headerRes.error || !headerRes.data) {
      return NextResponse.json({ success: false, message: 'Invoice not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: {
        header: headerRes.data,
        items:  itemsRes.data ?? [],
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}

// PATCH /api/invoices/[id] — edit header fields
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireRole('user')
    const db  = createServiceClient()

    const { data: inv } = await db
      .from('invoices')
      .select('status, created_by')
      .eq('id', params.id)
      .single()
    if (!inv) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 })
    const editError = checkEditPermission({
      isLocked:  inv.status === 'finalized',
      status:    inv.status,
      role:      ctx.role,
      createdBy: inv.created_by,
      userId:    ctx.userId,
    })
    if (editError) return NextResponse.json({ success: false, message: editError }, { status: 403 })

    const body = await req.json()
    const allowed = [
      'invoice_code', 'template_type',
      'nvl_gold_24k', 'nvl_pt_price', 'nvl_ag_price', 'nvl_pd_price',
      'nvl_loss_gold', 'nvl_loss_pt', 'nvl_cif_rate',
      'nvl_tag_multiplier', 'nvl_fr_multiplier',
    ]
    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }

    const { data, error } = await db
      .from('invoices')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single()

    if (error) throw error

    writeAuditLog({ invoiceId: params.id, userId: ctx.userId, action: 'updated', metadata: { fields: Object.keys(updates) } })

    // Bulk recalc all products when NVL snapshot or template changes
    const nvlChanged = [
      'nvl_gold_24k', 'nvl_pt_price', 'nvl_ag_price', 'nvl_pd_price',
      'nvl_loss_gold', 'nvl_loss_pt', 'nvl_cif_rate', 'template_type',
      'nvl_tag_multiplier', 'nvl_fr_multiplier',
    ].some(k => k in updates)

    if (nvlChanged) {
      const [{ data: newHeader }, { data: products }] = await Promise.all([
        db.from('invoices').select('*').eq('id', params.id).single(),
        db.from('invoice_products').select('id').eq('invoice_id', params.id),
      ])
      if (newHeader && products?.length) {
        const nvl      = nvlFromInvoice(newHeader)
        const template = ((newHeader as any).template_type ?? 'CH1') as InvoiceTemplate
        await Promise.all(products.map(async (prod) => {
          const [{ data: fullProd }, { data: diamonds }] = await Promise.all([
            db.from('invoice_products').select('*').eq('id', prod.id).single(),
            db.from('invoice_diamonds').select('*').eq('product_id', prod.id),
          ])
          if (fullProd) {
            // Recalc each diamond's derived fields first
            if (diamonds?.length) {
              await Promise.all(diamonds.map(d =>
                db.from('invoice_diamonds').update(recalcDiamond(d, template)).eq('id', d.id)
              ))
            }
            const updatedDiamonds = diamonds ? diamonds.map(d => ({ ...d, ...recalcDiamond(d, template) })) : []
            const recalc = recalcItem(fullProd, updatedDiamonds as any, nvl, template)
            await db.from('invoice_products').update(recalc).eq('id', prod.id)
          }
        }))
      }
    }

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}

// DELETE /api/invoices/[id] — admin only, must not be finalized
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requireRole('admin')
    const db = createServiceClient()

    const { data: inv } = await db.from('invoices').select('status').eq('id', params.id).single()
    if (!inv) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 })
    if (inv.status === 'finalized') {
      return NextResponse.json({ success: false, message: 'Invoice is finalized and cannot be deleted' }, { status: 403 })
    }

    const { error } = await db.from('invoices').delete().eq('id', params.id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
