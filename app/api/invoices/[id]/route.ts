import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext, requireRole } from '@/lib/auth/getRole'
import { writeAuditLog } from '@/lib/audit/log'
import { checkEditPermission } from '@/lib/auth/editGuard'
import { bulkRecalcInvoice } from '@/lib/formulas/recalc-helpers'

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
        .select('*, invoice_diamonds(*), invoice_item_metals(*)')
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
      'invoice_date', 'template_type',
      'nvl_gold_24k', 'nvl_pt_price', 'nvl_ag_price', 'nvl_pd_price',
      'nvl_loss_gold', 'nvl_loss_pt', 'nvl_cif_rate',
      'nvl_tag_multiplier', 'nvl_fr_multiplier',
    ]
    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }

    // invoice_code is normally built by trg_invoices_auto_code. Editing it by hand pins it
    // (invoice_code_manual = true) so the triggers stop overwriting; clearing it hands the
    // name back to the trigger. On revert we must not write invoice_code itself — for a legacy
    // invoice (seq_no NULL) the trigger skips, and an empty string would wipe its hand-typed code.
    if ('invoice_code' in body) {
      const code = String(body.invoice_code ?? '').trim()
      if (code) {
        updates.invoice_code        = code
        updates.invoice_code_manual = true
      } else {
        updates.invoice_code_manual = false
      }
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
      const { data: newHeader } = await db.from('invoices').select('*').eq('id', params.id).single()
      if (newHeader) await bulkRecalcInvoice(db, params.id, newHeader)
    }

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}

// DELETE /api/invoices/[id] — manager+ only, must not be finalized
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requireRole('manager')
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
