import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'

export async function GET(_req: NextRequest) {
  try {
    await requireRole('user')
    const db = createServiceClient()
    const { data, error } = await db
      .from('pricing_rules')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('admin')
    const { name, cif_multiplier, tag_multiplier, fr_multiplier, casting_loss_pct } = await req.json()
    if (!name?.trim()) return NextResponse.json({ success: false, message: 'Name is required' }, { status: 400 })

    const db = createServiceClient()
    const { data, error } = await db
      .from('pricing_rules')
      .insert({
        name:             name.trim(),
        cif_multiplier:   cif_multiplier   ?? 1.0,
        tag_multiplier:   tag_multiplier   ?? 1.0,
        fr_multiplier:    fr_multiplier    ?? 1.0,
        casting_loss_pct: casting_loss_pct ?? 5.0,
        is_active:        false,
      })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
