import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'

type Params = { params: { id: string } }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireRole('admin')
    const body = await req.json()
    const db   = createServiceClient()

    const EDITABLE = ['description', 'class', 'sub_class', 'metal_type', 'labor_fee', 'casting_fee', 'design_fee', 'resin_fee', 'misc_fee', 'is_active']
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const k of EDITABLE) { if (k in body) updates[k] = body[k] }

    const { data, error } = await db
      .from('bom_products')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requireRole('admin')
    const db = createServiceClient()

    // Guard: used by any invoice_items
    const { count } = await db
      .from('invoice_items')
      .select('*', { count: 'exact', head: true })
      .eq('sku_jwmold', (await db.from('bom_products').select('sku_jwmold').eq('id', params.id).single()).data?.sku_jwmold ?? '')

    if (count && count > 0) {
      return NextResponse.json(
        { success: false, message: `Cannot delete — SKU is used by ${count} invoice item${count > 1 ? 's' : ''}. Deactivate it instead.` },
        { status: 409 }
      )
    }

    const { error } = await db.from('bom_products').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
