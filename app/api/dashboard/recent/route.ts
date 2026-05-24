import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'

export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

    const db = createServiceClient()

    const { data, error } = await db
      .from('invoice_headers')
      .select(`
        id, po_number, store, created_at, status, is_locked,
        item_count:invoice_items(count)
      `)
      .order('created_at', { ascending: false })
      .limit(5)

    if (error) throw error

    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
