import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'

type Params = { params: { id: string } }

// Old columns guaranteed to exist (migration.sql)
const OLD_COLS = ['rate_date', 'gold_24k', 'gold_18kw', 'gold_18ky', 'gold_14ky', 'platinum', 'silver', 'palladium']
// New columns from add_metal_rate_spot.sql (may not exist yet)
const NEW_COLS = ['spot_24k_oz', 'spot_pt_oz', 'spot_ag_oz', 'spot_pd_oz', 'oz_per_gram', 'loss_gold_pct', 'loss_pt_pct', 'karat_prices']

const isMigrationError = (msg?: string) =>
  !!msg && (msg.includes('schema cache') || msg.includes('Could not find') || msg.includes('does not exist'))

function buildUpdates(body: any, cols: string[]) {
  const u: Record<string, unknown> = {}
  for (const k of cols) { if (k in body) u[k] = body[k] }
  return u
}

// PATCH /api/metal-rates/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireRole('admin')
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message ?? 'Unauthorized' }, { status: err.status ?? 401 })
  }

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 })
  }

  const db = createServiceClient()

  // Try full update (new + old columns); if schema cache error, fallback to old-only
  let data: any = null
  let error: any = null

  try {
    const r = await db
      .from('daily_metal_rates')
      .update(buildUpdates(body, [...OLD_COLS, ...NEW_COLS]))
      .eq('id', params.id)
      .select()
      .single()
    data = r.data
    error = r.error
  } catch (e: any) {
    // Supabase throws for schema cache errors in some versions
    error = { message: e?.message ?? String(e) }
  }

  // Fallback: migration not applied yet — update old columns only
  if (error && isMigrationError(error.message)) {
    try {
      const r2 = await db
        .from('daily_metal_rates')
        .update(buildUpdates(body, OLD_COLS))
        .eq('id', params.id)
        .select()
        .single()
      data = r2.data
      error = r2.error
    } catch (e: any) {
      error = { message: e?.message ?? String(e) }
    }
  }

  if (error) {
    if (error.code === '23505') return NextResponse.json({ success: false, message: 'A rate for that date already exists' }, { status: 409 })
    return NextResponse.json({ success: false, message: error.message }, { status: 400 })
  }
  return NextResponse.json({ success: true, data })
}

// DELETE /api/metal-rates/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requireRole('admin')
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message ?? 'Unauthorized' }, { status: err.status ?? 401 })
  }

  const db = createServiceClient()

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
}
