import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'
import { writeAuditLog } from '@/lib/audit/log'

// New workflow: draft ↔ finalized (manager/admin only)
const ALLOWED_TRANSITIONS: Record<string, Record<string, string[]>> = {
  manager: { draft: ['finalized'] },
  admin:   { draft: ['finalized'], finalized: ['draft'] },
}

function canTransition(role: string, from: string, to: string): boolean {
  return ALLOWED_TRANSITIONS[role]?.[from]?.includes(to) ?? false
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireRole('manager')
    const { to_status, note } = await req.json()

    if (!to_status) {
      return NextResponse.json({ success: false, message: 'to_status is required' }, { status: 400 })
    }

    const db = createServiceClient()
    const { data: invoice } = await db
      .from('invoices')
      .select('status')
      .eq('id', params.id)
      .single()

    if (!invoice) return NextResponse.json({ success: false, message: 'Invoice not found' }, { status: 404 })

    if (!canTransition(ctx.role, invoice.status, to_status)) {
      return NextResponse.json(
        { success: false, message: `Cannot transition from "${invoice.status}" to "${to_status}" as ${ctx.role}` },
        { status: 403 }
      )
    }

    const updateData: Record<string, unknown> = { status: to_status }
    if (to_status === 'finalized') updateData.finalized_at = new Date().toISOString()
    if (to_status === 'draft')     updateData.finalized_at = null

    const { error } = await db
      .from('invoices')
      .update(updateData)
      .eq('id', params.id)

    if (error) throw error

    writeAuditLog({
      invoiceId:  params.id,
      userId:     ctx.userId,
      action:     to_status === 'finalized' ? 'finalized' : 'updated',
      fromStatus: invoice.status,
      toStatus:   to_status,
      note:       note || undefined,
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    const msg = err?.message || String(err)
    const status = err?.status || 500
    return NextResponse.json({ success: false, message: msg }, { status })
  }
}
