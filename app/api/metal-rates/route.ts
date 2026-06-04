import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'

const OLD_COLS = ['rate_date', 'gold_24k', 'gold_18kw', 'gold_18ky', 'gold_14ky', 'platinum', 'silver', 'palladium', 'created_by']
const NEW_COLS = ['spot_24k_oz', 'spot_pt_oz', 'spot_ag_oz', 'spot_pd_oz', 'oz_per_gram', 'loss_gold_pct', 'loss_pt_pct', 'karat_prices']

const isMigrationError = (msg?: string) =>
  !!msg && (msg.includes('schema cache') || msg.includes('Could not find') || msg.includes('does not exist'))

function pick(body: any, cols: string[]) {
  const u: Record<string, unknown> = {}
  for (const k of cols) { if (k in body) u[k] = body[k] }
  return u
}

// GET /api/metal-rates?page=1
export async function GET(req: NextRequest) {
  try {
    await requireRole('user')
    const sp       = req.nextUrl.searchParams
    const page     = Math.max(1, parseInt(sp.get('page') ?? '1'))
    const pageSize = 20
    const offset   = (page - 1) * pageSize

    const db = createServiceClient()
    const { data, count, error } = await db
      .from('daily_metal_rates')
      .select('*', { count: 'exact' })
      .order('rate_date', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (error) throw error
    return NextResponse.json({
      success: true,
      data: data ?? [],
      pagination: { page, pageSize, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) },
    })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: err?.message ?? String(err) }, { status: 500 })
  }
}

// POST /api/metal-rates — admin only
export async function POST(req: NextRequest) {
  try {
    await requireRole('admin')
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message ?? 'Unauthorized' }, { status: err.status ?? 401 })
  }

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.rate_date) return NextResponse.json({ success: false, message: 'rate_date is required' }, { status: 400 })

  const db = createServiceClient()

  // Try insert with all columns; fallback to old-only if migration not applied
  let data: any = null
  let error: any = null

  try {
    const r = await db
      .from('daily_metal_rates')
      .insert(pick(body, [...OLD_COLS, ...NEW_COLS]))
      .select()
      .single()
    data = r.data
    error = r.error
  } catch (e: any) {
    error = { message: e?.message ?? String(e) }
  }

  if (error && isMigrationError(error.message)) {
    try {
      const r2 = await db
        .from('daily_metal_rates')
        .insert(pick(body, OLD_COLS))
        .select()
        .single()
      data = r2.data
      error = r2.error
    } catch (e: any) {
      error = { message: e?.message ?? String(e) }
    }
  }

  if (error) {
    if (error.code === '23505') return NextResponse.json({ success: false, message: `Rate for ${body.rate_date} already exists` }, { status: 409 })
    return NextResponse.json({ success: false, message: error.message }, { status: 400 })
  }
  return NextResponse.json({ success: true, data })
}
