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
      .from('invoices')
      .select(`
        id, invoice_code, channel, template_type, status, created_by, created_at, finalized_at,
        invoice_products ( id, seq )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (status)   query = query.eq('status', status)
    if (dateFrom) query = query.gte('created_at', dateFrom)
    if (dateTo)   query = query.lte('created_at', dateTo + 'T23:59:59')
    if (search) {
      query = query.or(`invoice_code.ilike.%${search}%,channel.ilike.%${search}%`)
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
    const { invoice_code, channel, template_type } = body

    if (!invoice_code?.trim()) {
      return NextResponse.json({ success: false, message: 'Invoice code is required' }, { status: 400 })
    }
    if (!template_type) {
      return NextResponse.json({ success: false, message: 'Template type is required' }, { status: 400 })
    }

    const db = createServiceClient()

    // Unique invoice_code check
    const { count } = await db
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('invoice_code', invoice_code.trim())

    if (count && count > 0) {
      return NextResponse.json({ success: false, message: `Invoice code "${invoice_code}" already exists` }, { status: 409 })
    }

    // Copy NVL snapshot from latest nvl_prices row
    const { data: latestNVL } = await db
      .from('nvl_prices')
      .select('gold_24k, pt_price, ag_price, pd_price, loss_gold, loss_pt, tag_multiplier, fr_multiplier')
      .order('id', { ascending: false })
      .limit(1)
      .single()

    // AG3 templates (Lầu 3) dùng loss_gold = 11%, khác Lầu 2 (6%)
    // Ref: JM-FORM §8.2 — CH1_AG3/VNSI_AG3 SUMMARY G3 = 0.11
    const isAG3 = ['CH1_AG3', 'VNSI_AG3'].includes(template_type)

    const nvlSnapshot = latestNVL ? {
      nvl_gold_24k:        latestNVL.gold_24k,
      nvl_pt_price:        latestNVL.pt_price,
      nvl_ag_price:        latestNVL.ag_price,
      nvl_pd_price:        latestNVL.pd_price,
      nvl_loss_gold:       isAG3 ? 0.11 : latestNVL.loss_gold,
      nvl_loss_pt:         latestNVL.loss_pt,
      nvl_cif_rate:        template_type === 'VNSI_AG3' ? 0.10 : 0.05,
      nvl_tag_multiplier:  latestNVL.tag_multiplier ?? 0,
      nvl_fr_multiplier:   latestNVL.fr_multiplier  ?? 0,
    } : {}

    const { data, error } = await db
      .from('invoices')
      .insert({
        invoice_code:  invoice_code.trim(),
        channel:       channel?.trim() || null,
        template_type,
        status:        'draft',
        created_by:    ctx.userId,
        ...nvlSnapshot,
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
