import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext, requireRole } from '@/lib/auth/getRole'

// GET /api/products?skus=SKU1,SKU2,SKU3   — batch lookup for import validation
// GET /api/products?page=1&search=         — paginated list for admin
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

    const sp   = req.nextUrl.searchParams
    const skus = sp.get('skus')
    const db   = createServiceClient()

    if (skus) {
      const skuList = skus.split(',').map(s => s.trim()).filter(Boolean)
      const { data } = await db
        .from('bom_products')
        .select('sku_jwmold, description, class, sub_class, metal_type, labor_fee, casting_fee, design_fee, resin_fee, misc_fee, image_url')
        .in('sku_jwmold', skuList)
        .eq('is_active', true)
      return NextResponse.json({ success: true, data: data ?? [] })
    }

    const page     = Math.max(1, parseInt(sp.get('page') ?? '1'))
    const pageSize = 50
    const offset   = (page - 1) * pageSize
    const search   = sp.get('search') || null

    let query = db
      .from('bom_products')
      .select('*', { count: 'exact' })
      .order('sku_jwmold', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (search) query = query.ilike('sku_jwmold', `%${search}%`)

    const { data, count, error } = await query
    if (error) throw error

    return NextResponse.json({
      success: true,
      data: data ?? [],
      pagination: { page, pageSize, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) },
    })
  } catch (err) {
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}

// POST /api/products — admin only
export async function POST(req: NextRequest) {
  try {
    await requireRole('admin')
    const body = await req.json()
    const { sku_jwmold, description, class: cls, sub_class, metal_type, labor_fee, casting_fee, design_fee, resin_fee, misc_fee } = body

    if (!sku_jwmold?.trim()) {
      return NextResponse.json({ success: false, message: 'sku_jwmold is required' }, { status: 400 })
    }

    const db = createServiceClient()
    const { data, error } = await db
      .from('bom_products')
      .insert({
        sku_jwmold:  sku_jwmold.trim().toUpperCase(),
        description: description?.trim() || null,
        class:       cls?.trim() || null,
        sub_class:   sub_class?.trim() || null,
        metal_type:  metal_type?.trim() || null,
        labor_fee:   labor_fee ?? null,
        casting_fee: casting_fee ?? null,
        design_fee:  design_fee ?? null,
        resin_fee:   resin_fee ?? null,
        misc_fee:    misc_fee ?? null,
        is_active:   true,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: false, message: `SKU "${sku_jwmold.trim().toUpperCase()}" already exists` }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
