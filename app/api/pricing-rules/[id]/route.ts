import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'

type Params = { params: { id: string } }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireRole('admin')
    const body = await req.json()
    const db   = createServiceClient()

    // Activate action — atomic swap via two sequential UPDATEs
    if (body.action === 'activate') {
      await db.from('pricing_rules')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('is_active', true)
      const { data, error } = await db.from('pricing_rules')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', params.id)
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ success: true, data })
    }

    // Edit action
    const EDITABLE = ['name', 'cif_multiplier', 'tag_multiplier', 'fr_multiplier', 'casting_loss_pct']
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const k of EDITABLE) { if (k in body) updates[k] = body[k] }

    const { data, error } = await db
      .from('pricing_rules')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requireRole('admin')
    const db = createServiceClient()

    // Guard: cannot delete active rule
    const { data: rule } = await db.from('pricing_rules').select('is_active').eq('id', params.id).single()
    if (rule?.is_active) {
      return NextResponse.json({ success: false, message: 'Cannot delete the active pricing rule' }, { status: 409 })
    }
    // Guard: used by invoices
    const { count } = await db.from('invoice_headers').select('*', { count: 'exact', head: true }).eq('pricing_rule_id', params.id)
    if (count && count > 0) {
      return NextResponse.json({ success: false, message: `Cannot delete — used by ${count} invoice${count > 1 ? 's' : ''}` }, { status: 409 })
    }

    const { error } = await db.from('pricing_rules').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
