import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'

function fmt2(n: unknown): string {
  if (n == null || n === '') return ''
  const v = parseFloat(String(n))
  return isNaN(v) ? '' : `$${v.toFixed(2)}`
}
function fmt4(n: unknown): string {
  if (n == null || n === '') return ''
  const v = parseFloat(String(n))
  return isNaN(v) ? '' : v.toFixed(4)
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/invoices/[id]/export
// Produces a single-sheet XLSX with Master rows (invoice items) merged across
// Detail sub-rows (gem details), matching the on-screen Master-Detail layout.
// ──────────────────────────────────────────────────────────────────────────────
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

    // ── Sheet 1: Master-Detail Invoice ───────────────────────────────────────
    //
    // Column layout:
    //   MASTER (A–L always, M–Q if canSeePrice) | blank (R) | DETAIL gems (S–AE)
    //
    // When an item has N gems → N rows, master columns MERGED vertically for N rows.
    // When an item has 0 gems → 1 row, no merge, gem columns empty.

    const masterHeaders = [
      'No.',         // A
      'SKU JWMold',  // B
      'SO/MO',       // C
      'Description', // D
      'Class',       // E
      'Sub Class',   // F
      'Size',        // G
      'Metal',       // H
      'Qty (pcs)',   // I
      'Total Wt (g)',// J
      'Gold Wt (g)', // K
      'No-Gem Wt (g)',// L
      ...(canSeePrice
        ? ['Gold Value', 'HPUSA', 'CIF', 'Tag', 'FR'] // M–Q
        : []),
    ]
    const masterCount = masterHeaders.length // 12 or 17

    const gemHeaders = [
      '',              // separator col R
      'Gem Type',      // S
      'Quality',       // T  ← P.chất (VVS1, VS1, LG…)
      'Shape',         // U
      'Size (mm)',     // V
      'Qty',           // W
      'Wt After (ct)', // X
      'Wt (g)',        // Y  ← GENERATED
      '$/ct',          // Z
      'T.Giá Xoàn',   // AA ← GENERATED total_price
      'Setting',       // AB
      'Fee/pc',        // AC
      'Total Fee',     // AD ← GENERATED total_setting_fee
    ]

    const wsData: (string | number)[][] = []
    const merges: XLSX.Range[] = []

    // Header row (row 0)
    wsData.push([...masterHeaders, ...gemHeaders])

    let rowIdx = 1 // 0-based; row 0 = header

    for (const item of items ?? []) {
      const gems    = (item.item_gem_details ?? []) as any[]
      const numRows = Math.max(gems.length, 1)

      for (let g = 0; g < numRows; g++) {
        const gem       = gems[g]
        const isFirst   = g === 0

        // Master columns — only populate on first sub-row; blank on subsequent
        const masterData: (string | number)[] = isFirst ? [
          item.line_no,
          item.sku_jwmold         ?? '',
          item.so_mo_code         ?? '',
          item.description        ?? '',
          item.class              ?? '',
          item.sub_class          ?? '',
          item.size               ?? '',
          item.metal_type         ?? '',
          item.qty_pcs            ?? 0,
          fmt4(item.weight_total_gr),
          fmt4(item.weight_gold_actual_gr),
          fmt4(item.weight_no_gem_gr),
          ...(canSeePrice ? [
            fmt2(item.gold_value_usd),
            fmt2(item.hpusa),
            fmt2(item.cif_price),
            fmt2(item.tag_price),
            fmt2(item.fr_price),
          ] : []),
        ] : Array(masterCount).fill('')

        // Gem columns — blank when no gem for this row
        const gemData: (string | number)[] = gem ? [
          '',                                      // separator
          gem.gem_type              ?? '',
          gem.quality               ?? '',          // P.chất
          gem.shape                 ?? '',
          gem.size_mm               ?? '',
          gem.qty_pcs               ?? '',
          fmt4(gem.weight_ct_after),               // Wt After (ct)
          fmt4(gem.weight_gr),                     // Wt (g) GENERATED
          fmt2(gem.unit_price_per_ct),             // $/ct
          fmt2(gem.total_price),                   // T.Giá Xoàn GENERATED
          gem.setting_type          ?? '',
          fmt2(gem.setting_fee_per_pcs),           // Fee/pc
          fmt2(gem.total_setting_fee),             // Total Fee GENERATED
        ] : Array(gemHeaders.length).fill('')

        wsData.push([...masterData, ...gemData])
      }

      // Merge master columns vertically when item has multiple gem rows
      if (numRows > 1) {
        for (let c = 0; c < masterCount; c++) {
          merges.push({
            s: { r: rowIdx,              c },
            e: { r: rowIdx + numRows - 1, c },
          })
        }
      }

      rowIdx += numRows
    }

    const ws            = XLSX.utils.aoa_to_sheet(wsData)
    ws['!merges']       = merges

    // Column widths
    const masterWidths = [
      { wch: 5  }, // No.
      { wch: 14 }, // SKU
      { wch: 18 }, // SO/MO
      { wch: 28 }, // Description
      { wch: 10 }, // Class
      { wch: 10 }, // Sub Class
      { wch: 8  }, // Size
      { wch: 8  }, // Metal
      { wch: 7  }, // Qty
      { wch: 12 }, // Total Wt
      { wch: 12 }, // Gold Wt
      { wch: 12 }, // No-Gem Wt
      ...(canSeePrice
        ? [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]
        : []),
    ]
    const gemWidths = [
      { wch: 2  }, // separator
      { wch: 10 }, // Gem Type
      { wch: 8  }, // Quality
      { wch: 10 }, // Shape
      { wch: 10 }, // Size mm
      { wch: 6  }, // Qty
      { wch: 12 }, // Wt After ct
      { wch: 10 }, // Wt g
      { wch: 10 }, // $/ct
      { wch: 12 }, // T.Giá Xoàn
      { wch: 10 }, // Setting
      { wch: 10 }, // Fee/pc
      { wch: 12 }, // Total Fee
    ]
    ws['!cols'] = [...masterWidths, ...gemWidths]

    XLSX.utils.book_append_sheet(wb, ws, 'Invoice')

    // ── Sheet 2: Info ────────────────────────────────────────────────────────
    const rate = (invoice as any).daily_metal_rates
    const rule = (invoice as any).pricing_rules
    const infoData: Record<string, unknown> = {
      'PO Number':    invoice.po_number,
      'MR Number':    invoice.mr_number       ?? '',
      'Customer':     invoice.customer_name   ?? '',
      'Invoice Date': invoice.invoice_date    ?? invoice.created_at?.slice(0, 10) ?? '',
      'Status':       invoice.status,
      'Rate Date':    rate?.rate_date         ?? '',
      'Pricing Rule': rule?.name              ?? '',
    }
    if (canSeePrice) {
      infoData['CIF Multiplier'] = rule?.cif_multiplier ?? ''
      infoData['Tag Multiplier'] = rule?.tag_multiplier ?? ''
      infoData['FR Multiplier']  = rule?.fr_multiplier  ?? ''
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([infoData]), 'Info')

    // ── Response ─────────────────────────────────────────────────────────────
    const buffer   = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const filename = `invoice-${invoice.po_number ?? params.id}.xlsx`

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
