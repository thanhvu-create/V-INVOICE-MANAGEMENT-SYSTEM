import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext, requireRole } from '@/lib/auth/getRole'
import { writeAuditLog } from '@/lib/audit/log'
import { checkEditPermission } from '@/lib/auth/editGuard'
import { recalcItem } from '@/lib/formulas/pricing'

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

    const { data: inv } = await db
      .from('invoice_headers')
      .select('is_locked, status, created_by_user_id')
      .eq('id', params.id)
      .single()
    if (!inv) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 })
    const editError = checkEditPermission({ isLocked: inv.is_locked, status: inv.status, role: ctx.role, createdBy: inv.created_by_user_id, userId: ctx.userId })
    if (editError) return NextResponse.json({ success: false, message: editError }, { status: 403 })

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

    // Bulk recalc all items when rate or rule changes — prices would be stale otherwise
    const rateChanged = 'metal_rate_id' in updates || 'pricing_rule_id' in updates
    if (rateChanged) {
      const [{ data: newHeader }, { data: items }] = await Promise.all([
        db.from('invoice_headers').select('daily_metal_rates(*), pricing_rules(*)').eq('id', params.id).single(),
        db.from('invoice_items').select('id').eq('invoice_id', params.id),
      ])
      const rate = (newHeader as any)?.daily_metal_rates
      const rule = (newHeader as any)?.pricing_rules
      if (rate && rule && items?.length) {
        await Promise.all(items.map(async (item) => {
          const [{ data: fullItem }, { data: gems }] = await Promise.all([
            db.from('invoice_items').select('*').eq('id', item.id).single(),
            db.from('item_gem_details').select('*').eq('invoice_item_id', item.id),
          ])
          if (fullItem) {
            const recalc = recalcItem(fullItem, gems ?? [], rate, rule)
            await db.from('invoice_items').update(recalc).eq('id', item.id)
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
