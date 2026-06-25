import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'

// GET — public list for client-side lookup (any authenticated user)
export async function GET() {
  try {
    await requireRole('user')
    const db = createServiceClient()
    const { data, error } = await db
      .from('assembly_pricing_rules')
      .select('sub_class, gia_cong, duc, thiet_ke, resin')
      .order('sub_class')
    if (error) throw error
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
