import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'

function fmt2(n: unknown): string {
  if (n == null || n === '') return ''
  const v = parseFloat(String(n))
  return isNaN(v) ? '' : v.toFixed(2)
}
function fmt4(n: unknown): string {
  if (n == null || n === '') return ''
  const v = parseFloat(String(n))
  return isNaN(v) ? '' : v.toFixed(4)
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

    const db          = createServiceClient()
    const canSeePrice = ctx.role === 'admin' || ctx.role === 'manager'

    const [{ data: invoice }, { data: items }] = await Promise.all([
      db.from('invoice_headers')
        .select('*, daily_metal_rates(rate_date), pricing_rules(name, cif_multiplier, tag_multiplier, fr_multiplier)')
        .eq('id', params.id)
        .single(),
      db.from('invoice_items')
        .select('*, item_gem_details(*)')
        .eq('invoice_id', params.id)
        .order('line_no', { ascending: true }),
    ])

    if (!invoice) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 })

    const wb = XLSX.utils.book_new()

    // Sheet 1: Items
    const itemRows = (items ?? []).map(item => {
      const base: Record<string, unknown> = {
        'No.':               item.line_no,
        'Store':             item.store             ?? '',
        'Location':          item.location_store    ?? '',
        'SKU':               item.sku_jwmold,
        'SO/MO':             item.so_mo_code        ?? '',
        'Vendor Model':      item.vendor_model      ?? '',
        'Description':       item.description       ?? '',
        'Class':             item.class             ?? '',
        'Sub Class':         item.sub_class         ?? '',
        'Metal Type':        item.metal_type        ?? '',
        'Qty':               item.qty_pcs,
        'Total Weight (g)':  fmt4(item.weight_total_gr),
        'Gold Weight (g)':   fmt4(item.weight_gold_actual_gr),
        'No-Gem Weight (g)': fmt4(item.weight_no_gem_gr),
        'Labor Fee':         fmt2(item.labor_fee),
        'Casting Fee':       fmt2(item.casting_fee),
        'Design Fee':        fmt2(item.design_fee),
        'Resin Fee':         fmt2(item.resin_fee),
        'Misc Fee':          fmt2(item.misc_fee),
        'Sell Price':        fmt2(item.sell_price),
        'After Discount':    fmt2(item.after_discount_price),
      }
      if (canSeePrice) {
        base['Gold Value (USD)'] = fmt2(item.gold_value_usd)
        base['HPUSA']            = fmt2(item.hpusa)
        base['CIF Price']        = fmt2(item.cif_price)
        base['Tag Price']        = fmt2(item.tag_price)
        base['FR Price']         = fmt2(item.fr_price)
      }
      return base
    })

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemRows), 'Items')

    // Sheet 2: Gems (only if any)
    const gemRows: Record<string, unknown>[] = []
    ;(items ?? []).forEach(item => {
      ;(item.item_gem_details ?? []).forEach((g: any) => {
        gemRows.push({
          'Line No':           item.line_no,
          'SKU':               item.sku_jwmold,
          'Gem Type':          g.gem_type            ?? '',
          'Shape':             g.shape               ?? '',
          'Size (mm)':         g.size_mm             ?? '',
          'Qty':               g.qty_pcs,
          'Weight (g)':        fmt4(g.weight_gr),
          'Price/Carat':       fmt2(g.price_per_carat),
          'Total Price':       fmt2(g.total_price),
          'Setting Type':      g.setting_type        ?? '',
          'Setting Fee/pcs':   fmt2(g.setting_fee_per_pcs),
          'Total Setting Fee': fmt2(g.total_setting_fee),
        })
      })
    })
    if (gemRows.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gemRows), 'Gems')

    // Sheet 3: Info
    const rate = (invoice as any).daily_metal_rates
    const rule = (invoice as any).pricing_rules
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
      'PO Number':      invoice.po_number,
      'MR Number':      invoice.mr_number    ?? '',
      'Customer':       invoice.store        ?? '',
      'Invoice Date':   invoice.created_at?.slice(0, 10) ?? '',
      'Status':         invoice.status,
      'Metal Rate Date':rate?.rate_date      ?? '',
      'Pricing Rule':   rule?.name           ?? '',
      'CIF Multiplier': canSeePrice ? (rule?.cif_multiplier ?? '') : '',
      'Tag Multiplier': canSeePrice ? (rule?.tag_multiplier ?? '') : '',
      'FR Multiplier':  canSeePrice ? (rule?.fr_multiplier  ?? '') : '',
    }]), 'Info')

    const buffer   = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const filename = `invoice-${invoice.po_number}.xlsx`

    return new NextResponse(buffer, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
