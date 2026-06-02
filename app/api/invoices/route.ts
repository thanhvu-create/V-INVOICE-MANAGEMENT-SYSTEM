import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext, requireRole } from '@/lib/auth/getRole'
import { writeAuditLog } from '@/lib/audit/log'

// GET /api/invoices?page=1&limit=20&status=&search=&dateFrom=&dateTo=
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

    const sp       = req.nextUrl.searchParams
    const page     = Math.max(1, parseInt(sp.get('page')   ?? '1'))
    const pageSize = Math.min(100, parseInt(sp.get('limit') ?? '20'))
    const offset   = (page - 1) * pageSize
    const status   = sp.get('status')   || null
    const search   = sp.get('search')   || null
    const dateFrom = sp.get('dateFrom') || null
    const dateTo   = sp.get('dateTo')   || null

    const db = createServiceClient()

    let query = db
      .from('invoice_headers')
      .select(`
        id, po_number, mr_number, status, is_locked, store, created_by, created_at,
        daily_metal_rates ( rate_date ),
        pricing_rules ( name )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (status)   query = query.eq('status', status)
    if (dateFrom) query = query.gte('created_at', dateFrom)
    if (dateTo)   query = query.lte('created_at', dateTo + 'T23:59:59')
    if (search) {
      query = query.or(`po_number.ilike.%${search}%,mr_number.ilike.%${search}%,store.ilike.%${search}%`)
    }

    const { data, count, error } = await query
    if (error) throw error

    return NextResponse.json({
      success: true,
      data: data ?? [],
      pagination: {
        page,
        pageSize,
        total:      count ?? 0,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}

// POST /api/invoices — create new invoice (draft)
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole('user')
    const body = await req.json()
    const { po_number, mr_number, metal_rate_id, pricing_rule_id, store, notes } = body

    if (!po_number?.trim()) {
      return NextResponse.json({ success: false, message: 'PO number is required' }, { status: 400 })
    }
    if (!metal_rate_id) {
      return NextResponse.json({ success: false, message: 'Metal rate is required' }, { status: 400 })
    }

    const db = createServiceClient()

    // Unique PO check
    const { count } = await db
      .from('invoice_headers')
      .select('*', { count: 'exact', head: true })
      .eq('po_number', po_number.trim())

    if (count && count > 0) {
      return NextResponse.json({ success: false, message: `PO number "${po_number}" already exists` }, { status: 409 })
    }

    const { data, error } = await db
      .from('invoice_headers')
      .insert({
        po_number:          po_number.trim(),
        mr_number:          mr_number?.trim() || null,
        metal_rate_id,
        pricing_rule_id:    pricing_rule_id || null,
        store:              store?.trim() || null,
        notes:              notes?.trim() || null,
        created_by:         ctx.fullName,       // denormalized display name
        created_by_user_id: ctx.userId,         // UUID FK for editGuard ownership check
        status:             'draft',
        is_locked:          false,
      })
      .select()
      .single()

    if (error) throw error

    writeAuditLog({ invoiceId: data.id, userId: ctx.userId, action: 'created', toStatus: 'draft' })

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
