import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'

// GET /api/gem-catalog?code=RD+B1  → lookup by grade from nvl_hot
// GET /api/gem-catalog?type=RD     → list by stone_type
// GET /api/gem-catalog              → list all rows
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

  const db   = createServiceClient()
  const code = req.nextUrl.searchParams.get('code')
  const type = req.nextUrl.searchParams.get('type')

  if (code) {
    const { data, error } = await db
      .from('nvl_hot')
      .select('id, stone_type, grade, size_range, size_min, size_max, size_unit, mk_price')
      .eq('grade', code.trim())
      .single()
    if (error || !data)
      return NextResponse.json({ success: false, message: `"${code}" not found` }, { status: 404 })
    return NextResponse.json({ success: true, data: { ...data, gem_type: data.stone_type, price_unit: 'per_ct' } })
  }

  let q = db.from('nvl_hot').select('id, stone_type, grade, size_range, size_min, size_max, size_unit, mk_price').order('stone_type').order('size_min', { ascending: true, nullsFirst: false })
  if (type) q = q.eq('stone_type', type.trim().toUpperCase())

  const { data, error } = await q
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [] })
}
