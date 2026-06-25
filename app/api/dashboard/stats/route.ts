import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'

export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

    const db = createServiceClient()
    const canSeePrice = ctx.role === 'admin' || ctx.role === 'manager'

    // Run all queries in parallel
    const [statusRes, itemsRes, monthInvRes, monthCifRes, templateRes] = await Promise.all([
      // Count invoices by status
      db.from('invoices').select('status'),

      // Total invoice_products count
      db.from('invoice_products').select('id', { count: 'exact', head: true }),

      // Invoices created this month
      db.from('invoices')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', startOfMonthISO()),

      // CIF sum this month (only for price-visible roles)
      canSeePrice
        ? db.from('invoice_products')
            .select('cif_price, invoices!inner(created_at)')
            .gte('invoices.created_at', startOfMonthISO())
        : Promise.resolve({ data: null, error: null }),

      // Count by template
      db.from('invoices').select('template_type'),
    ])

    // Build by_status map
    const by_status: Record<string, number> = {}
    for (const row of statusRes.data ?? []) {
      by_status[row.status] = (by_status[row.status] ?? 0) + 1
    }

    // Build by_template map
    const by_template: Record<string, number> = {}
    for (const row of templateRes.data ?? []) {
      const t = row.template_type ?? 'MANUAL'
      by_template[t] = (by_template[t] ?? 0) + 1
    }

    // CIF sum
    let month_cif = 0
    if (canSeePrice && monthCifRes.data) {
      month_cif = (monthCifRes.data as any[]).reduce((s: number, r: any) => s + (r.cif_price ?? 0), 0)
    }

    return NextResponse.json({
      success: true,
      data: {
        by_status,
        by_template,
        total_items:         itemsRes.count ?? 0,
        month_invoice_count: monthInvRes.count ?? 0,
        ...(canSeePrice ? { month_cif } : {}),
      },
    })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}

function startOfMonthISO(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}
