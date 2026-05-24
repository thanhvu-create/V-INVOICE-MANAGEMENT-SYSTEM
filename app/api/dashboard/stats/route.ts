import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'

export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

    const db = createServiceClient()
    const canSeePrice = ctx.role === 'admin' || ctx.role === 'manager'

    const { data, error } = await db.rpc('get_dashboard_stats')
    if (error) throw error

    const stats = data as {
      by_status:           Record<string, number>
      total_items:         number
      month_cif:           number
      month_invoice_count: number
    }

    return NextResponse.json({
      success: true,
      data: {
        by_status:   stats.by_status ?? {},
        total_items: stats.total_items,
        ...(canSeePrice ? {
          month_cif:           stats.month_cif,
          month_invoice_count: stats.month_invoice_count,
        } : {}),
      },
    })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
