import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

    const db = createServiceClient()

    const { data, error } = await db
      .from('audit_logs')
      .select(`
        id, action, from_status, to_status, note, metadata, created_at,
        app_users!user_id ( id, full_name, email, role )
      `)
      .eq('invoice_id', params.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (err) {
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
