import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/getRole'
import { writeAuditLog } from '@/lib/audit/log'
import { bulkRecalcInvoice } from '@/lib/formulas/recalc-helpers'
import type { InvoiceTemplate } from '@/lib/formulas/pricing'
import { checkEditPermission } from '@/lib/auth/editGuard'

type Params = { params: { id: string } }

// POST /api/invoices/[id]/sync-nvl
// Cập nhật snapshot NVL của invoice từ bảng nvl_prices mới nhất,
// sau đó recalc toàn bộ items + gems.
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireRole('user')
    const db  = createServiceClient()

    const { data: invoice } = await db
      .from('invoices')
      .select('status, created_by, template_type')
      .eq('id', params.id)
      .single()

    if (!invoice) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 })

    const editError = checkEditPermission({
      isLocked:  invoice.status === 'finalized',
      status:    invoice.status,
      role:      ctx.role,
      createdBy: invoice.created_by,
      userId:    ctx.userId,
    })
    if (editError) return NextResponse.json({ success: false, message: editError }, { status: 403 })

    // Lấy NVL mới nhất
    const { data: latestNVL } = await db
      .from('nvl_prices')
      .select('gold_24k, pt_price, ag_price, pd_price, loss_gold, loss_pt, tag_multiplier, fr_multiplier')
      .order('id', { ascending: false })
      .limit(1)
      .single()

    if (!latestNVL) {
      return NextResponse.json({ success: false, message: 'Không tìm thấy dữ liệu NVL. Vui lòng thêm giá NVL trước.' }, { status: 422 })
    }

    const template = (invoice.template_type ?? 'CH1') as InvoiceTemplate
    const isAG3    = template === 'CH1_AG3' || template === 'VNSI_AG3'

    const nvlSnapshot = {
      nvl_gold_24k:       latestNVL.gold_24k,
      nvl_pt_price:       latestNVL.pt_price,
      nvl_ag_price:       latestNVL.ag_price,
      nvl_pd_price:       latestNVL.pd_price,
      nvl_loss_gold:      isAG3 ? 0.11 : latestNVL.loss_gold,
      nvl_loss_pt:        latestNVL.loss_pt,
      nvl_cif_rate:       template === 'VNSI_AG3' ? 0.10 : 0.05,
      nvl_tag_multiplier: latestNVL.tag_multiplier ?? 0,
      nvl_fr_multiplier:  latestNVL.fr_multiplier  ?? 0,
    }

    // Cập nhật snapshot vào invoice
    const { error: invErr } = await db
      .from('invoices')
      .update(nvlSnapshot)
      .eq('id', params.id)

    if (invErr) throw invErr

    await bulkRecalcInvoice(db, params.id, { ...nvlSnapshot, template_type: template })

    writeAuditLog({
      invoiceId: params.id,
      userId:    ctx.userId,
      action:    'nvl_synced',
      metadata:  { gold_24k: latestNVL.gold_24k, pt_price: latestNVL.pt_price, ag_price: latestNVL.ag_price },
    })

    return NextResponse.json({ success: true, message: 'Đã cập nhật giá NVL và tính lại toàn bộ sản phẩm.' })
  } catch (err: any) {
    if (err?.status) return NextResponse.json({ success: false, message: err.message }, { status: err.status })
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
