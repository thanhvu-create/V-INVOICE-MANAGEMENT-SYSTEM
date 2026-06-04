import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'

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
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}

// POST /api/metal-rates — admin only
export async function POST(req: NextRequest) {
  try {
    await requireRole('admin')
    const body = await req.json()
    const {
      rate_date, gold_24k, gold_18kw, gold_18ky, gold_14ky, platinum, silver, palladium,
      spot_24k_oz, spot_pt_oz, spot_ag_oz, spot_pd_oz,
      oz_per_gram, loss_gold_pct, loss_pt_pct, karat_prices,
    } = body

    if (!rate_date) return NextResponse.json({ success: false, message: 'rate_date is required' }, { status: 400 })

    const db = createServiceClient()
    const { data, error } = await db
      .from('daily_metal_rates')
      .insert({
        rate_date, gold_24k, gold_18kw, gold_18ky, gold_14ky, platinum, silver, palladium,
        spot_24k_oz, spot_pt_oz, spot_ag_oz, spot_pd_oz,
        oz_per_gram, loss_gold_pct, loss_pt_pct, karat_prices,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') return NextResponse.json({ success: false, message: `Rate for ${rate_date} already exists` }, { status: 409 })
      return NextResponse.json({ success: false, message: error.message }, { status: 400 })
    }
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    const msg = err?.message ?? (typeof err === 'object' ? JSON.stringify(err) : String(err))
    return NextResponse.json({ success: false, message: msg }, { status: 500 })
  }
}
