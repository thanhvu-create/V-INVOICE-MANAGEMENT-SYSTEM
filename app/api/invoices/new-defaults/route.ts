import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'

export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

    const db = createServiceClient()

    const { data: latestNVL } = await db
      .from('nvl_prices')
      .select('*')
      .order('id', { ascending: false })
      .limit(1)
      .single()

    return NextResponse.json({
      success: true,
      data: {
        latestNVL: latestNVL ?? null,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
