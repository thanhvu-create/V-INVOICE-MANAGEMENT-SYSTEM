import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'
import { writeAuditLog, type AuditAction } from '@/lib/audit/log'

const ALLOWED_TRANSITIONS: Record<string, Record<string, string[]>> = {
  user:    { draft: ['pending_approval'] },
  manager: { pending_approval: ['approved', 'draft'] },
  admin:   {
    draft:            ['pending_approval'],
    pending_approval: ['approved', 'draft'],
    approved:         ['invoiced', 'pending_approval'],
  },
}

function canTransition(role: string, from: string, to: string): boolean {
  return ALLOWED_TRANSITIONS[role]?.[from]?.includes(to) ?? false
}

function statusToAction(to: string, from: string): AuditAction {
  if (to === 'pending_approval') return 'submitted'
  if (to === 'approved')         return 'approved'
  if (to === 'invoiced')         return 'invoiced'
  if (to === 'draft')            return 'rejected'  // going back to draft = rejected
  return 'updated'
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireRole('user')
    const { to_status, note } = await req.json()

    if (!to_status) {
      return NextResponse.json({ success: false, message: 'to_status is required' }, { status: 400 })
    }

    const db = createServiceClient()
    const { data: invoice } = await db
      .from('invoice_headers')
      .select('status, is_locked')
      .eq('id', params.id)
      .single()

    if (!invoice) return NextResponse.json({ success: false, message: 'Invoice not found' }, { status: 404 })
    if (invoice.is_locked) return NextResponse.json({ success: false, message: 'Invoice is locked' }, { status: 403 })

    if (!canTransition(ctx.role, invoice.status, to_status)) {
      return NextResponse.json(
        { success: false, message: `Cannot transition from "${invoice.status}" to "${to_status}" as ${ctx.role}` },
        { status: 403 }
      )
    }

    const { error } = await db
      .from('invoice_headers')
      .update({ status: to_status, updated_at: new Date().toISOString() })
      .eq('id', params.id)

    if (error) throw error

    // DB trigger fires automatically when to_status = 'invoiced' (sets is_locked + snapshot_data)

    writeAuditLog({
      invoiceId:  params.id,
      userId:     ctx.userId,
      action:     statusToAction(to_status, invoice.status),
      fromStatus: invoice.status,
      toStatus:   to_status,
      note:       note || undefined,
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
