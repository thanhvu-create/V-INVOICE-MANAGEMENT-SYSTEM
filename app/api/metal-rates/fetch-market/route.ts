import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/getRole'
import { fetchMetalPrices, computeKaratPrices } from '@/lib/gold-fetch'

// GET /api/metal-rates/fetch-market
// Fetch today's spot prices từ Yahoo Finance → return computed karat rates
// KHÔNG tự động save — user xem trước rồi mới save
export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(ctx.role))
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })

  try {
    const spot = await fetchMetalPrices()
    const karat = computeKaratPrices(
      spot.spot_24k_oz,
      spot.spot_pt_oz,
      spot.spot_ag_oz,
      spot.spot_pd_oz,
    )
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
    return NextResponse.json({ success: true, data: { ...spot, karat_prices: karat, date: today } })
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e.message }, { status: 502 })
  }
}
