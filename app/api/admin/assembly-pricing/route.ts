import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'

// GET — list all rules (all authenticated users can read)
export async function GET() {
  try {
    await requireRole('viewer')
    const db = createServiceClient()
    const { data, error } = await db
      .from('assembly_pricing_rules')
      .select('*')
      .order('sub_class')
    if (error) throw error
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}

// POST — create rule
export async function POST(req: NextRequest) {
  try {
    await requireRole('manager')
    const body = await req.json()
    const { sub_class, gia_cong, duc, thiet_ke, resin, phi_phu_kien } = body
    if (!sub_class?.trim()) return NextResponse.json({ success: false, message: 'sub_class is required' }, { status: 400 })
    const db = createServiceClient()
    const { data, error } = await db
      .from('assembly_pricing_rules')
      .insert({
        sub_class:    sub_class.trim().toUpperCase(),
        gia_cong:     Number(gia_cong)     || 0,
        duc:          Number(duc)          || 0,
        thiet_ke:     Number(thiet_ke)     || 0,
        resin:        Number(resin)        || 0,
        phi_phu_kien: Number(phi_phu_kien) || 0,
        updated_at:   new Date().toISOString(),
      })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    if (err?.code === '23505') return NextResponse.json({ success: false, message: 'Sub class này đã tồn tại' }, { status: 409 })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}

// PATCH — update rule by id
export async function PATCH(req: NextRequest) {
  try {
    await requireRole('manager')
    const body = await req.json()
    const { id, sub_class, gia_cong, duc, thiet_ke, resin, phi_phu_kien } = body
    if (!id) return NextResponse.json({ success: false, message: 'id is required' }, { status: 400 })
    const db = createServiceClient()
    const { data, error } = await db
      .from('assembly_pricing_rules')
      .update({
        sub_class:    sub_class?.trim().toUpperCase(),
        gia_cong:     Number(gia_cong)     || 0,
        duc:          Number(duc)          || 0,
        thiet_ke:     Number(thiet_ke)     || 0,
        resin:        Number(resin)        || 0,
        phi_phu_kien: Number(phi_phu_kien) || 0,
        updated_at:   new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}

// DELETE — delete rule by id
export async function DELETE(req: NextRequest) {
  try {
    await requireRole('manager')
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ success: false, message: 'id is required' }, { status: 400 })
    const db = createServiceClient()
    const { error } = await db.from('assembly_pricing_rules').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
