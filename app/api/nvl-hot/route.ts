import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'

// GET /api/nvl-hot?range=RD1+0.7+-+2.0   → lookup single row by size_range (legacy)
// GET /api/nvl-hot?type=RD&size=2.3       → lookup by numeric size within range
// GET /api/nvl-hot?type=RD                → list by stone_type
// GET /api/nvl-hot                         → list all rows
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

  const db    = createServiceClient()
  const range = req.nextUrl.searchParams.get('range')
  const type  = req.nextUrl.searchParams.get('type')
  const size  = req.nextUrl.searchParams.get('size')

  const COLS = 'id, stone_type, grade, size_range, size_min, size_max, size_unit, mk_price'

  if (type && size) {
    const sizeNum = parseFloat(size)
    if (isNaN(sizeNum))
      return NextResponse.json({ success: false, message: 'Invalid size value' }, { status: 400 })
    const { data, error } = await db
      .from('nvl_hot')
      .select(COLS)
      .eq('stone_type', type.trim().toUpperCase())
      .eq('is_active', true)
      .lte('size_min', sizeNum)
      .gte('size_max', sizeNum)
      .limit(1)
      .single()
    if (error || !data)
      return NextResponse.json({ success: false, message: `No price range found for ${type} size ${size}` }, { status: 404 })
    return NextResponse.json({ success: true, data })
  }

  if (range) {
    const { data, error } = await db
      .from('nvl_hot')
      .select(COLS)
      .eq('size_range', range.trim())
      .single()
    if (error || !data)
      return NextResponse.json({ success: false, message: `Size range "${range}" not found in NVL Hột` }, { status: 404 })
    return NextResponse.json({ success: true, data })
  }

  let q = db.from('nvl_hot').select(COLS).order('stone_type').order('size_min', { ascending: true, nullsFirst: false })
  if (type) q = q.eq('stone_type', type.trim().toUpperCase())

  const { data, error } = await q
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [] })
}
