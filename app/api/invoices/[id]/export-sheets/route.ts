import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'
import { getGoogleAccessToken } from '@/lib/google/getAccessToken'

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

async function sheetsPost(accessToken: string, path: string, body: unknown) {
  const url = path ? `${SHEETS_BASE}/${path}` : SHEETS_BASE
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message ?? `Sheets API ${res.status}`)
  return data
}

async function sheetsPut(accessToken: string, path: string, body: unknown) {
  const res = await fetch(`${SHEETS_BASE}/${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message ?? `Sheets PUT ${res.status}`)
  return data
}

function n(v: unknown): number | string {
  if (v == null || v === '') return ''
  const f = parseFloat(String(v))
  return isNaN(f) ? '' : f
}

function buildJMFormRows(invoice: any, items: any[], canSeePrice: boolean) {
  const rows: (string | number)[][] = []

  // Row 1 — title
  rows.push([invoice.invoice_code ?? '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])

  // Row 2 — column headers
  rows.push([
    'No.', 'Store', 'Location in Store', 'Vendor model#', 'SO# & MO#',
    'SKU# new', 'Class', 'Sub class', 'Description', 'Qt.(pcs)', 'Wt.(gr)',
    ...(canSeePrice
      ? ['HP for Purchase price', 'HP for CIF price', 'ERP for Bom cost ($)', 'Chênh lệch', 'HP for Tag price', 'HP for FB price']
      : []),
    'Ghi chú',
  ])

  // Row 3 — sub-header (template has a 2nd header row; keep blank here)
  rows.push(Array(canSeePrice ? 18 : 12).fill(''))

  // Data rows
  for (const item of items ?? []) {
    const purchase = n(item.von_san_xuat ?? item.purchase_price)
    const erp      = n(item.erp_bom_cost)
    const chenh    = (typeof purchase === 'number' && purchase > 0 && typeof erp === 'number')
      ? ((purchase - erp) / purchase)
      : ''

    rows.push([
      n(item.seq),
      item.store       ?? '',
      item.location    ?? '',
      item.vendor_model ?? item.sku ?? '',
      item.so_mo       ?? '',
      item.sku         ?? '',
      item.class       ?? '',
      item.sub_class   ?? '',
      item.description ?? '',
      n(item.qt_pcs),
      n(item.wt_gr ?? item.t_pham_co_nvl_da),
      ...(canSeePrice
        ? [
            typeof purchase === 'number' ? purchase : '',
            n(item.cif_price),
            typeof erp === 'number' ? erp : '',
            typeof chenh === 'number' ? chenh : '',
            n(item.tag_price),
            n(item.fb_price),
          ]
        : []),
      item.nini_adm ?? '',
    ])
  }

  return rows
}

function buildSummaryRows(invoice: any, items: any[]) {
  const rows: (string | number)[][] = []

  // NVL Giá vàng block (rows 1-13 in Excel)
  rows.push(['NVL - Giá vàng', '', '', '', ''])
  rows.push(['Giá 24K ($/oz)', '', '', '', n(invoice.nvl_gold_24k ?? '')])
  rows.push(['Giá PT ($/oz)', '', '', '', n(invoice.nvl_pt_price ?? '')])
  rows.push(['Giá AG ($/oz)', '', '', '', n(invoice.nvl_ag_price ?? '')])
  rows.push(['Giá PD ($/oz)', '', '', '', n(invoice.nvl_pd_price ?? '')])
  rows.push(['Loss vàng', '', '', '', n(invoice.nvl_loss_gold ?? 0.06)])
  rows.push(['Loss PT', '', '', '', n(invoice.nvl_loss_pt ?? 0.17)])
  rows.push(['CIF rate', '', '', '', n(invoice.nvl_cif_rate ?? 0.05)])
  rows.push(['Tag multiplier', '', '', '', n(invoice.nvl_tag_multiplier ?? '')])
  rows.push(['FB multiplier', '', '', '', n(invoice.nvl_fr_multiplier ?? '')])
  rows.push(['', '', '', '', ''])
  rows.push(['', '', '', '', ''])
  rows.push(['', '', '', '', ''])
  rows.push(['', '', '', '', ''])

  // Blank separator row
  rows.push(Array(14).fill(''))

  // SUMMARY headers (rows 15-16 in Excel)
  rows.push([
    'STT', 'SO/MO', 'Kích Thước', 'Số lượng', 'Mã số mẫu', 'Loại vàng',
    'Tiền vàng ($)', 'T.Phẩm (có NVL đá)', 'T.Phẩm (trừ NVL đá)', 'T.Phẩm (vàng TT)',
    'Mã Xoàn', 'P. chất', 'Size Xoàn', 'SL hột',
    'TL trước xử lý (ct.)', 'TL sau xử lý (ct.)', 'TL Xoàn (gr)', 'Đơn giá ($)', 'T.GIÁ XOÀN',
    'Đơn giá phí', 'T.Phí',
    'Gia công / 1 SP', 'Đúc / 1sp', 'Thiết Kế / 1sp', 'Resin / 1sp', 'Phí phụ kiện',
    'Vốn sản xuất',
    'Bảo hiểm', 'Ngày gửi', 'Tracking#', 'Hóa Đơn (V-INVOICE)',
  ])
  rows.push(Array(31).fill(''))

  // Data: 1 main row + gem sub-rows per product
  for (const item of items ?? []) {
    const gems    = (item.invoice_diamonds ?? []) as any[]
    const numRows = Math.max(gems.length, 1)

    for (let g = 0; g < numRows; g++) {
      const gem     = gems[g] as any
      const isFirst = g === 0
      if (isFirst) {
        rows.push([
          n(item.seq),
          item.so_mo       ?? '',
          item.kich_thuoc  ?? '',
          n(item.qt_pcs),
          item.vendor_model ?? '',
          item.loai_vang   ?? '',
          n(item.tien_vang),
          n(item.t_pham_co_nvl_da),
          n(item.t_pham_tru_nvl_da),
          n(item.t_pham_vang_thuc_te ?? item.t_pham_tru_nvl_da),
          gem?.ma_xoan          ?? '',
          gem?.p_chat           ?? '',
          gem?.size_xoan_range  ?? '',
          n(gem?.sl_hot),
          n(gem?.tl_truoc_xu_ly_ct),
          n(gem?.tl_sau_xu_ly_ct),
          n(gem?.tl_xoan_gr),
          n(gem?.don_gia),
          n(gem?.t_gia_xoan),
          n(gem?.don_gia_phi),
          n(gem?.t_phi),
          n(item.gia_cong),
          n(item.duc),
          n(item.thiet_ke),
          n(item.resin),
          n(item.phi_phu_kien),
          n(item.von_san_xuat),
          n(item.bao_hiem),
          item.ngay_gui    ?? '',
          item.tracking_no ?? '',
          item.hoa_don     ?? '',
        ])
      } else {
        // gem-only sub-row
        const emptyMain = Array(10).fill('')
        rows.push([
          ...emptyMain,
          gem?.ma_xoan         ?? '',
          gem?.p_chat          ?? '',
          gem?.size_xoan_range ?? '',
          n(gem?.sl_hot),
          n(gem?.tl_truoc_xu_ly_ct),
          n(gem?.tl_sau_xu_ly_ct),
          n(gem?.tl_xoan_gr),
          n(gem?.don_gia),
          n(gem?.t_gia_xoan),
          n(gem?.don_gia_phi),
          n(gem?.t_phi),
          ...Array(10).fill(''),
        ])
      }
    }
  }

  return rows
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

    const accessToken = await getGoogleAccessToken(ctx.userId)
    if (!accessToken) {
      return NextResponse.json({
        success: false,
        message: 'Tài khoản chưa kết nối Google Drive. Vào trang cài đặt để kết nối lại với quyền Google Sheets.',
      }, { status: 403 })
    }

    const db           = createServiceClient()
    const canSeePrice  = ctx.role === 'admin' || ctx.role === 'manager'

    const [{ data: invoice }, { data: items }] = await Promise.all([
      db.from('invoices').select('*').eq('id', params.id).single(),
      db.from('invoice_products')
        .select('*, invoice_diamonds(*)')
        .eq('invoice_id', params.id)
        .order('seq', { ascending: true }),
    ])

    if (!invoice) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 })

    const title = `V-Invoice ${invoice.invoice_code ?? params.id} (${invoice.template_type ?? ''})`

    // 1. Create spreadsheet with two sheets
    const created = await sheetsPost(accessToken, '', {
      properties: { title },
      sheets: [
        { properties: { title: 'JM FORM',  sheetId: 0, index: 0 } },
        { properties: { title: 'SUMMARY',  sheetId: 1, index: 1 } },
      ],
    })

    const spreadsheetId  = created.spreadsheetId
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`

    // 2. Write JM FORM data
    const jmRows = buildJMFormRows(invoice, items ?? [], canSeePrice)
    await sheetsPut(
      accessToken,
      `${spreadsheetId}/values/${encodeURIComponent('JM FORM!A1')}?valueInputOption=USER_ENTERED`,
      { values: jmRows },
    )

    // 3. Write SUMMARY data
    const summaryRows = buildSummaryRows(invoice, items ?? [])
    await sheetsPut(
      accessToken,
      `${spreadsheetId}/values/${encodeURIComponent('SUMMARY!A1')}?valueInputOption=USER_ENTERED`,
      { values: summaryRows },
    )

    // 4. Basic formatting: bold headers, freeze rows
    await sheetsPost(accessToken, `${spreadsheetId}:batchUpdate`, {
      requests: [
        // Bold row 2 of JM FORM (col headers)
        {
          repeatCell: {
            range:  { sheetId: 0, startRowIndex: 1, endRowIndex: 2 },
            cell:   { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.98, green: 0.95, blue: 0.80 } } },
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
          },
        },
        // Freeze first 3 rows + first col of JM FORM
        {
          updateSheetProperties: {
            properties: { sheetId: 0, gridProperties: { frozenRowCount: 3, frozenColumnCount: 1 } },
            fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount',
          },
        },
        // Bold SUMMARY headers row (row 16, index 15)
        {
          repeatCell: {
            range:  { sheetId: 1, startRowIndex: 15, endRowIndex: 16 },
            cell:   { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.88, green: 0.93, blue: 0.99 } } },
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
          },
        },
        // Freeze first 16 rows of SUMMARY (NVL + headers)
        {
          updateSheetProperties: {
            properties: { sheetId: 1, gridProperties: { frozenRowCount: 16 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
      ],
    })

    return NextResponse.json({ success: true, spreadsheetUrl })
  } catch (err: any) {
    const msg = String(err?.message ?? err)
    // Detect scope/permission errors
    if (msg.includes('insufficientPermissions') || msg.includes('Request had insufficient authentication scopes')) {
      return NextResponse.json({
        success: false,
        message: 'Token Google chưa có quyền ghi Sheets. Vào trang cài đặt → ngắt kết nối Google Drive → kết nối lại.',
      }, { status: 403 })
    }
    return NextResponse.json({ success: false, message: msg }, { status: 500 })
  }
}
