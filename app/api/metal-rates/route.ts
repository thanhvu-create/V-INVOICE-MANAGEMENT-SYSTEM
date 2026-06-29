import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'

// GET /api/metal-rates — returns nvl_prices rows (replaces daily_metal_rates)
export async function GET() {
  try {
    await requireRole('viewer')
    const db = createServiceClient()
    const { data, error } = await db
      .from('nvl_prices')
      .select('*')
      .order('updated_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: err?.message ?? String(err) }, { status: 500 })
  }
}

// POST /api/metal-rates — manager+ can insert new nvl_prices row
export async function POST(req: NextRequest) {
  try {
    await requireRole('manager')
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message ?? 'Unauthorized' }, { status: err.status ?? 401 })
  }

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('nvl_prices')
    .insert({
      gold_24k:        body.gold_24k        ?? null,
      pt_price:        body.pt_price        ?? null,
      ag_price:        body.ag_price        ?? null,
      pd_price:        body.pd_price        ?? null,
      loss_gold:       body.loss_gold       ?? 0.06,
      loss_pt:         body.loss_pt         ?? 0.17,
      tag_multiplier:  body.tag_multiplier  ?? null,
      fr_multiplier:   body.fr_multiplier   ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 })
  return NextResponse.json({ success: true, data })
}
