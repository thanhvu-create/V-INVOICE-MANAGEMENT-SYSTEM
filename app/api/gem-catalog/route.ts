import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/session'

// GET /api/gem-catalog?code=RD+B1  → lookup single gem by code
// GET /api/gem-catalog?type=RD     → list by type
// GET /api/gem-catalog              → list all active
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

  const db   = createServiceClient()
  const code = req.nextUrl.searchParams.get('code')
  const type = req.nextUrl.searchParams.get('type')

  if (code) {
    const { data, error } = await db
      .from('gem_price_catalog')
      .select('id, gem_code, gem_type, size_range, mk_price, price_unit')
      .eq('gem_code', code.trim().toUpperCase())
      .eq('is_active', true)
      .single()
    if (error || !data)
      return NextResponse.json({ success: false, message: `Gem code "${code}" not found` }, { status: 404 })
    return NextResponse.json({ success: true, data })
  }

  let q = db
    .from('gem_price_catalog')
    .select('id, gem_code, gem_type, size_range, mk_price, price_unit')
    .eq('is_active', true)
    .order('gem_type')
    .order('gem_code')
  if (type) q = q.eq('gem_type', type.toUpperCase())

  const { data, error } = await q
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}
