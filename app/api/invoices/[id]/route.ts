import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext, requireRole } from '@/lib/auth/getRole'
import { writeAuditLog } from '@/lib/audit/log'

type Params = { params: { id: string } }

// GET /api/invoices/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

    const db = createServiceClient()

    const [headerRes, itemsRes] = await Promise.all([
      db.from('invoice_headers')
        .select('*, daily_metal_rates(*), pricing_rules(*)')
        .eq('id', params.id)
        .single(),
      db.from('invoice_items')
        .select('*, item_gem_details(*)')
        .eq('invoice_id', params.id)
        .order('line_no', { ascending: true }),
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

    // Lock guard
    const { data: inv } = await db.from('invoice_headers').select('is_locked, status').eq('id', params.id).single()
    if (!inv) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 })
    if (inv.is_locked) return NextResponse.json({ success: false, message: 'Invoice is locked' }, { status: 403 })

    const body = await req.json()
    const allowed = ['po_number', 'mr_number', 'store', 'notes', 'metal_rate_id', 'pricing_rule_id']
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }

    const { data, error } = await db
      .from('invoice_headers')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single()

    if (error) throw error

    writeAuditLog({ invoiceId: params.id, userId: ctx.userId, action: 'updated', metadata: { fields: Object.keys(updates).filter(k => k !== 'updated_at') } })

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}

// DELETE /api/invoices/[id] — admin only, must not be locked
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requireRole('admin')
    const db = createServiceClient()

    const { data: inv } = await db.from('invoice_headers').select('is_locked, status').eq('id', params.id).single()
    if (!inv) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 })
    if (inv.is_locked) return NextResponse.json({ success: false, message: 'Invoice is locked and cannot be deleted' }, { status: 403 })

    const { error } = await db.from('invoice_headers').delete().eq('id', params.id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
