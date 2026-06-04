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

    // Old columns always exist (from migration.sql)
    const OLD_COLS = ['rate_date', 'gold_24k', 'gold_18kw', 'gold_18ky', 'gold_14ky', 'platinum', 'silver', 'palladium']
    // New columns added by add_metal_rate_spot.sql (may not exist if migration not run)
    const NEW_COLS = ['spot_24k_oz', 'spot_pt_oz', 'spot_ag_oz', 'spot_pd_oz', 'oz_per_gram', 'loss_gold_pct', 'loss_pt_pct', 'karat_prices']

    const buildUpdates = (cols: string[]) => {
      const u: Record<string, unknown> = {}
      for (const k of cols) { if (k in body) u[k] = body[k] }
      return u
    }

    // Try full update (all columns)
    let result = await db
      .from('daily_metal_rates')
      .update(buildUpdates([...OLD_COLS, ...NEW_COLS]))
      .eq('id', params.id)
      .select()
      .single()

    // If new columns don't exist yet (migration not applied), fallback to old columns only
    if (result.error?.message?.includes('does not exist') || result.error?.message?.includes('column')) {
      result = await db
        .from('daily_metal_rates')
        .update(buildUpdates(OLD_COLS))
        .eq('id', params.id)
        .select()
        .single()
    }

    const { data, error } = result
    if (error) {
      if (error.code === '23505') return NextResponse.json({ success: false, message: 'A rate for that date already exists' }, { status: 409 })
      return NextResponse.json({ success: false, message: error.message }, { status: 400 })
    }
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    const msg = err?.message ?? (typeof err === 'object' ? JSON.stringify(err) : String(err))
    return NextResponse.json({ success: false, message: msg }, { status: 500 })
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
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    const msg = err?.message ?? (typeof err === 'object' ? JSON.stringify(err) : String(err))
    return NextResponse.json({ success: false, message: msg }, { status: 500 })
  }
}
