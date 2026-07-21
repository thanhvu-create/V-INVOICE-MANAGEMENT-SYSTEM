import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'

function fmt2(n: unknown): string {
  if (n == null || n === '') return ''
  const v = parseFloat(String(n))
  return isNaN(v) ? '' : `$${Math.round(v)}`
}
function fmt4(n: unknown): string {
  if (n == null || n === '') return ''
  const v = parseFloat(String(n))
  return isNaN(v) ? '' : v.toFixed(2)
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

    const db          = createServiceClient()
    const canSeePrice = ctx.role === 'admin' || ctx.role === 'manager'

    const [{ data: invoice }, { data: items }] = await Promise.all([
      db.from('invoices')
        .select('*')
        .eq('id', params.id)
        .single(),
      db.from('invoice_products')
        .select('*, invoice_diamonds(*), invoice_item_metals(*)')
        .eq('invoice_id', params.id)
        .order('seq', { ascending: true }),
    ])

    if (!invoice) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 })

    const wb = XLSX.utils.book_new()

    // Master column headers
    const masterHeaders = [
      'No.',         // A - seq
      'SKU',         // B
      'SO-MO',       // C
      'Description', // D
      'Class',       // E
      'Sub Class',   // F
      'Kích thước',  // G
      'Loại vàng',   // H
      'Qty (pcs)',   // I
      'T.Phẩm NVL đá (g)', // J
      'T.Phẩm vàng TT (g)', // K
      ...(canSeePrice
        ? [
            'Tiền vàng ($)',        // L
            'Gia công / 1 SP ($)',  // M
            'Đúc / 1sp ($)',        // N
            'Thiết Kế / 1sp ($)',   // O
            'Resin / 1sp ($)',      // P
            'Phí phụ kiện ($)',     // Q
            'Vốn SX / HPUSA ($)',   // R
            'CIF / SP ($)',         // S
          ]
        : []),
      'Notes',       // last
    ]
    const masterCount = masterHeaders.length

    const gemHeaders = [
      '',             // separator
      'Mã Xoàn',
      'P.Chất',
      'Size Range',
      'SL Hột',
      'TL Trước XL (ct)',
      'TL Sau XL (ct)',
      'TL Xoàn (gr)',
      'Đơn Giá ($/ct)',
      'T.Giá Xoàn ($)',
      'Đơn Giá Phí',
      'T.Phí ($)',
    ]

    const wsData: (string | number)[][] = []
    const merges: XLSX.Range[]          = []

    wsData.push([...masterHeaders, ...gemHeaders])

    let rowIdx = 1
    for (const item of items ?? []) {
      const gems    = (item.invoice_diamonds ?? []) as any[]
      const numRows = Math.max(gems.length, 1)

      for (let g = 0; g < numRows; g++) {
        const gem     = gems[g]
        const isFirst = g === 0

        const masterData: (string | number)[] = isFirst ? [
          item.seq              ?? '',
          item.sku              ?? '',
          item.so_mo            ?? '',
          item.description      ?? '',
          item.class            ?? '',
          item.sub_class        ?? '',
          item.kich_thuoc       ?? '',
          item.loai_vang        ?? '',
          item.qt_pcs           ?? 0,
          fmt4(item.t_pham_co_nvl_da),
          fmt4(item.t_pham_tru_nvl_da),
          ...(canSeePrice ? [
            fmt2(item.tien_vang),
            fmt2(item.gia_cong),
            fmt2(item.duc),
            fmt2(item.thiet_ke),
            fmt2(item.resin),
            fmt2(item.phi_phu_kien),
            fmt2(item.von_san_xuat),
            fmt2(item.cif_price),
          ] : []),
          item.nini_adm ?? '',
        ] : Array(masterCount).fill('')

        const gemData: (string | number)[] = gem ? [
          '',
          gem.ma_xoan           ?? '',
          gem.p_chat            ?? '',
          gem.size_xoan_range   ?? '',
          gem.sl_hot            ?? '',
          fmt4(gem.tl_truoc_xu_ly_ct),
          fmt4(gem.tl_sau_xu_ly_ct),
          fmt4(gem.tl_xoan_gr),
          fmt2(gem.don_gia),
          fmt2(gem.t_gia_xoan),
          fmt2(gem.don_gia_phi),
          fmt2(gem.t_phi),
        ] : Array(gemHeaders.length).fill('')

        wsData.push([...masterData, ...gemData])
      }

      if (numRows > 1) {
        for (let c = 0; c < masterCount; c++) {
          merges.push({ s: { r: rowIdx, c }, e: { r: rowIdx + numRows - 1, c } })
        }
      }
      rowIdx += numRows
    }

    const ws        = XLSX.utils.aoa_to_sheet(wsData)
    ws['!merges']   = merges
    ws['!cols']     = [
      { wch: 5 }, { wch: 14 }, { wch: 20 }, { wch: 28 }, { wch: 10 }, { wch: 10 },
      { wch: 10 }, { wch: 10 }, { wch: 7  }, { wch: 14 }, { wch: 14 },
      ...(canSeePrice ? [
        { wch: 13 }, // Tiền vàng
        { wch: 15 }, // Gia công
        { wch: 12 }, // Đúc
        { wch: 14 }, // Thiết Kế
        { wch: 12 }, // Resin
        { wch: 14 }, // Phí phụ kiện
        { wch: 14 }, // Vốn SX
        { wch: 12 }, // CIF
      ] : []),
      { wch: 16 },
      // gem cols
      { wch: 2 }, { wch: 12 }, { wch: 8 }, { wch: 18 }, { wch: 8 },
      { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'Invoice')

    // Info sheet
    const infoData = {
      'Invoice Code':  invoice.invoice_code,
      'Template Type': invoice.template_type ?? '',
      'Status':        invoice.status,
      'Created At':    invoice.created_at?.slice(0, 10) ?? '',
      'Finalized At':  invoice.finalized_at?.slice(0, 10) ?? '',
    }
    if (canSeePrice) {
      Object.assign(infoData, {
        'Gold 24K ($/oz)': invoice.nvl_gold_24k   ?? '',
        'PT ($/oz)':       invoice.nvl_pt_price   ?? '',
        'AG ($/oz)':       invoice.nvl_ag_price   ?? '',
        'Loss Gold':       invoice.nvl_loss_gold  ?? '',
      })
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([infoData]), 'Info')

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    // invoice_code is built by trg_invoices_auto_code (supabase/add_invoice_auto_name.sql), so the
    // sheet title and this filename always agree. ':' is legal on Drive but not in a filename.
    const filename = `${(invoice.invoice_code ?? params.id).replace(/:/g, '_')}.xlsx`

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
