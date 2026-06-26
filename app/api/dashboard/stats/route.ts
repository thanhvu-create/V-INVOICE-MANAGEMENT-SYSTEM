import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

    const db = createServiceClient()
    const canSeePrice = ctx.role === 'admin' || ctx.role === 'manager'

    // Parse ?month=YYYY-MM, default to current month
    const monthParam = req.nextUrl.searchParams.get('month')
    const { start, end } = parseMonthRange(monthParam)

    const [statusRes, itemsRes, monthInvRes, monthCifRes, templateRes] = await Promise.all([
      // Invoices created in selected month — count by status
      db.from('invoices')
        .select('status')
        .gte('created_at', start)
        .lt('created_at', end),

      // Items belonging to invoices in selected month
      db.from('invoice_products')
        .select('id', { count: 'exact', head: true })
        .gte('invoices.created_at', start)
        .lt('invoices.created_at', end),

      // Invoice count for selected month
      db.from('invoices')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', start)
        .lt('created_at', end),

      // CIF sum for selected month
      canSeePrice
        ? db.from('invoice_products')
            .select('cif_price, invoices!inner(created_at)')
            .gte('invoices.created_at', start)
            .lt('invoices.created_at', end)
        : Promise.resolve({ data: null, error: null }),

      // Template breakdown for selected month
      db.from('invoices')
        .select('template_type')
        .gte('created_at', start)
        .lt('created_at', end),
    ])

    // by_status
    const by_status: Record<string, number> = {}
    for (const row of statusRes.data ?? []) {
      by_status[row.status] = (by_status[row.status] ?? 0) + 1
    }

    // by_template
    const by_template: Record<string, number> = {}
    for (const row of templateRes.data ?? []) {
      const t = row.template_type ?? 'MANUAL'
      by_template[t] = (by_template[t] ?? 0) + 1
    }

    // CIF sum — items join invoices via Supabase embedded select
    let month_cif = 0
    if (canSeePrice && monthCifRes.data) {
      month_cif = (monthCifRes.data as any[]).reduce((s: number, r: any) => s + (r.cif_price ?? 0), 0)
    }

    // total_items for month: simpler fallback — count all products in month's invoices
    const monthInvoiceCount = monthInvRes.count ?? 0
    let total_items = 0
    if (monthInvoiceCount > 0) {
      const { count } = await db
        .from('invoice_products')
        .select('id', { count: 'exact', head: true })
        .in('invoice_id',
          (statusRes.data ?? []).length > 0
            ? (await db.from('invoices').select('id').gte('created_at', start).lt('created_at', end)).data?.map(r => r.id) ?? []
            : []
        )
      total_items = count ?? 0
    }

    return NextResponse.json({
      success: true,
      data: {
        by_status,
        by_template,
        total_items,
        month_invoice_count: monthInvoiceCount,
        ...(canSeePrice ? { month_cif } : {}),
      },
    })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}

function parseMonthRange(monthParam: string | null): { start: string; end: string } {
  let year: number, month: number
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    ;[year, month] = monthParam.split('-').map(Number)
  } else {
    const now = new Date()
    year  = now.getFullYear()
    month = now.getMonth() + 1
  }
  const start = new Date(year, month - 1, 1).toISOString()
  const end   = new Date(year, month,     1).toISOString()  // first day of NEXT month
  return { start, end }
}
