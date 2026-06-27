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

    // Convert ISO start/end to DATE strings (YYYY-MM-DD) for invoice_date column
    const dateStart = start.slice(0, 10)
    const dateEnd   = end.slice(0, 10)   // exclusive upper bound

    const [invoiceRes, cifRes] = await Promise.all([
      db.from('invoices')
        .select('id, status, template_type')
        .gte('invoice_date', dateStart)
        .lt('invoice_date', dateEnd),

      canSeePrice
        ? db.from('invoice_products')
            .select('cif_price, invoices!inner(invoice_date)')
            .gte('invoices.invoice_date', dateStart)
            .lt('invoices.invoice_date', dateEnd)
        : Promise.resolve({ data: null, error: null }),
    ])

    const invoices = invoiceRes.data ?? []
    const invoiceIds = invoices.map(r => r.id)

    const by_status: Record<string, number> = {}
    const by_template: Record<string, number> = {}
    for (const row of invoices) {
      by_status[row.status] = (by_status[row.status] ?? 0) + 1
      const t = row.template_type ?? 'MANUAL'
      by_template[t] = (by_template[t] ?? 0) + 1
    }

    let month_cif = 0
    if (canSeePrice && cifRes.data) {
      for (const r of cifRes.data as any[]) month_cif += (r.cif_price ?? 0)
    }

    let total_items = 0
    if (invoiceIds.length > 0) {
      const BATCH = 500
      const counts = await Promise.all(
        Array.from({ length: Math.ceil(invoiceIds.length / BATCH) }, (_, i) =>
          db.from('invoice_products')
            .select('id', { count: 'exact', head: true })
            .in('invoice_id', invoiceIds.slice(i * BATCH, (i + 1) * BATCH))
        )
      )
      total_items = counts.reduce((s, r) => s + (r.count ?? 0), 0)
    }

    return NextResponse.json({
      success: true,
      data: {
        by_status,
        by_template,
        total_items,
        month_invoice_count: invoices.length,
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
