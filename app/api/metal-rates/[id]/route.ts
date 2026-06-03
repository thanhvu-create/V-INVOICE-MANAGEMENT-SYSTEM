import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'

type Params = { params: { id: string } }

// PATCH /api/metal-rates/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireRole('admin')
    const body = await req.json()
    const db   = createServiceClient()

    const EDITABLE = [
      'rate_date',
      // Old columns — backward compat with invoices that use individual columns
      'gold_24k', 'gold_18kw', 'gold_18ky', 'gold_14ky', 'platinum', 'silver', 'palladium',
      // New spot + derived karat fields (from add_metal_rate_spot.sql)
      'spot_24k_oz', 'spot_pt_oz', 'spot_ag_oz', 'spot_pd_oz',
      'oz_per_gram', 'loss_gold_pct', 'loss_pt_pct', 'karat_prices',
    ]
    const updates: Record<string, unknown> = {}
    for (const k of EDITABLE) { if (k in body) updates[k] = body[k] }

    const { data, error } = await db
      .from('daily_metal_rates')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') return NextResponse.json({ success: false, message: 'A rate for that date already exists' }, { status: 409 })
      throw error
    }
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}

// DELETE /api/metal-rates/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requireRole('admin')
    const db = createServiceClient()

    // Delete guard — cannot delete if used by any invoice
    const { count } = await db
      .from('invoice_headers')
      .select('*', { count: 'exact', head: true })
      .eq('metal_rate_id', params.id)

    if (count && count > 0) {
      return NextResponse.json(
        { success: false, message: `Cannot delete — used by ${count} invoice${count > 1 ? 's' : ''}` },
        { status: 409 }
      )
    }

    const { error } = await db.from('daily_metal_rates').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
