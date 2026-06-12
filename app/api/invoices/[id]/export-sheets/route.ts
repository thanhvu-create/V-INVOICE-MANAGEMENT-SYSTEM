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

function extractFolderId(url: string): string | null {
  const m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  return m ? m[1] : null
}

async function moveFileToDriveFolder(
  accessToken: string,
  fileId: string,
  folderId: string,
): Promise<void> {
  // First get current parents
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  const meta = await metaRes.json()
  const currentParents = ((meta.parents ?? []) as string[]).join(',')

  const moveRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}` +
    `?addParents=${folderId}&removeParents=${currentParents}&fields=id,parents`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: '{}',
    },
  )
  if (!moveRes.ok) {
    const err = await moveRes.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `Drive move ${moveRes.status}`)
  }
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

function buildNVLRows(invoice: any) {
  const rows: (string | number)[][] = []
  rows.push(['NVL - Giá Vàng (Snapshot tại thời điểm tạo invoice)'])
  rows.push([''])
  rows.push(['Loại', 'Giá trị'])
  rows.push(['Giá 24K ($/oz)',    n(invoice.nvl_gold_24k ?? '')])
  rows.push(['Giá PT ($/oz)',     n(invoice.nvl_pt_price ?? '')])
  rows.push(['Giá AG ($/oz)',     n(invoice.nvl_ag_price ?? '')])
  rows.push(['Giá PD ($/oz)',     n(invoice.nvl_pd_price ?? '')])
  rows.push([''])
  rows.push(['Loss vàng',         n(invoice.nvl_loss_gold ?? 0.06)])
  rows.push(['Loss PT',           n(invoice.nvl_loss_pt ?? 0.17)])
  rows.push(['CIF rate',          n(invoice.nvl_cif_rate ?? 0.05)])
  rows.push(['Tag multiplier',    n(invoice.nvl_tag_multiplier ?? '')])
  rows.push(['FB multiplier',     n(invoice.nvl_fr_multiplier ?? '')])
  return rows
}

const SUMMARY_COLS = 32

function buildSummaryRows(invoice: any, items: any[]) {
  const isCH2 = invoice.template_type === 'CH2'
  const rows: (string | number)[][] = []

  // Row 1 — group headers
  const r1: (string | number)[] = Array(SUMMARY_COLS).fill('')
  r1[0]  = 'STT';            r1[1]  = 'HÌNH ẢNH'
  r1[2]  = 'THÔNG TIN SẢN PHẨM'
  r1[7]  = 'Tiền vàng ($)'
  r1[8]  = 'TRỌNG Lượng (gr)'
  r1[11] = 'THÔNG TIN XOÀN'
  r1[20] = 'Phí nhận hột'
  r1[22] = 'Gia công / 1 SP'; r1[23] = 'Đúc / 1sp'
  r1[24] = 'Thiết Kế / 1sp'; r1[25] = 'Resin / 1sp'
  r1[26] = 'Phí phụ kiện (mua bên ngoài)'
  r1[27] = 'HPUSA';           r1[28] = 'NINI/ADM'
  r1[29] = 'Ngày gửi';        r1[30] = 'Tracking# gửi hàng USA'
  r1[31] = 'Hóa Đôn (V-INVOICE)'
  rows.push(r1)

  // Row 2 — sub-headers (col 15/16 differ for CH2: no TL trước, only TL sau)
  const r2: (string | number)[] = Array(SUMMARY_COLS).fill('')
  r2[2]  = 'SO/MO';           r2[3]  = 'Kích Thước'
  r2[4]  = 'Số lượng';        r2[5]  = 'Mã số mẫu';  r2[6]  = 'Loại vàng'
  r2[8]  = 'T.Phẩm (có NVL đá)'; r2[9] = 'T.Phẩm (trừ NVL đá)'; r2[10] = 'T.Phẩm (vàng TT)'
  r2[11] = 'Mã Xoàn';         r2[12] = 'P. chất';    r2[13] = 'Size Xoàn'
  r2[14] = 'SL hột'
  r2[15] = isCH2 ? 'TL (ct.) sau xử lý' : 'TL (ct.) trước xử lý'
  r2[16] = isCH2 ? '' : 'TL (ct.) sau xử lý'
  r2[17] = 'TL Xoàn (gr)';    r2[18] = 'Đơn giá ($)'; r2[19] = 'T.GIÁ XOÀN'
  r2[20] = 'Đơn giá phí';     r2[21] = 'T.Phí'
  r2[27] = 'Vốn sản xuất';    r2[28] = 'Bảo hiểm'
  rows.push(r2)

  // Row 3 — Chinese translations
  const r3: (string | number)[] = Array(SUMMARY_COLS).fill('')
  r3[0]='编号'; r3[1]='图片'; r3[2]='产品编号'; r3[3]='尺寸'; r3[4]='数量'; r3[5]='型号'; r3[6]='金属类型'
  r3[7]='金价'; r3[9]='产品重量'; r3[10]='净金重'
  r3[11]='石编号'; r3[12]='石头质量'; r3[13]='大小'; r3[14]='石数'; r3[15]='车前石重'
  r3[17]='石重/克'; r3[18]='石单价(连耗)'; r3[19]='石总价'; r3[20]='镶单价'; r3[21]='镶工总价'
  r3[22]='产品费'; r3[23]='倒膜费'; r3[24]='起版费'; r3[25]='蜡版费'; r3[26]='附件价'
  r3[27]='总计'; r3[28]='到岸价'
  rows.push(r3)

  // Data — dynamic rows: 1 main row + 1 row per gem (no fixed block limit)
  for (const item of items ?? []) {
    const gems = (item.invoice_diamonds ?? []) as any[]
    const numRows = Math.max(gems.length, 1)

    for (let g = 0; g < numRows; g++) {
      const gem = gems[g] as any | undefined
      const row: (string | number)[] = Array(SUMMARY_COLS).fill('')

      if (g === 0) {
        // Main row — product identity + fees + output
        row[0]  = n(item.seq)
        row[2]  = item.so_mo        ?? ''
        row[3]  = item.kich_thuoc   ?? ''
        row[4]  = n(item.qt_pcs)
        row[5]  = item.vendor_model ?? ''
        row[6]  = item.loai_vang    ?? ''
        row[7]  = n(item.tien_vang)
        row[8]  = n(item.t_pham_co_nvl_da)
        row[9]  = n(item.t_pham_tru_nvl_da)
        row[10] = n(item.t_pham_vang_thuc_te ?? item.t_pham_tru_nvl_da)
        row[22] = n(item.gia_cong);     row[23] = n(item.duc)
        row[24] = n(item.thiet_ke);     row[25] = n(item.resin)
        row[26] = n(item.phi_phu_kien)
        row[27] = n(item.von_san_xuat); row[28] = n(item.bao_hiem)
        row[29] = item.ngay_gui    ?? ''
        row[30] = item.tracking_no ?? ''
        row[31] = item.hoa_don     ?? ''
      }

      // Gem columns (11-21) — CH2 uses tl_sau as primary (no tl_truoc column)
      if (gem) {
        row[11] = gem.ma_xoan         ?? ''
        row[12] = gem.p_chat          ?? ''
        row[13] = gem.size_xoan_range ?? ''
        row[14] = n(gem.sl_hot)
        row[15] = isCH2 ? n(gem.tl_sau_xu_ly_ct) : n(gem.tl_truoc_xu_ly_ct)
        row[16] = isCH2 ? '' : n(gem.tl_sau_xu_ly_ct)
        row[17] = n(gem.tl_xoan_gr)
        row[18] = n(gem.don_gia)
        row[19] = n(gem.t_gia_xoan)
        row[20] = 1
        row[21] = n(gem.t_phi)
      }

      rows.push(row)
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

    const [{ data: invoice }, { data: items }, { data: folderSetting }] = await Promise.all([
      db.from('invoices').select('*').eq('id', params.id).single(),
      db.from('invoice_products')
        .select('*, invoice_diamonds(*)')
        .eq('invoice_id', params.id)
        .order('seq', { ascending: true }),
      db.from('app_settings').select('value').eq('key', 'export_drive_folder_url').maybeSingle(),
    ])

    const folderUrl = folderSetting?.value?.trim() ?? ''
    const folderId  = folderUrl ? extractFolderId(folderUrl) : null

    if (!invoice) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 })

    const title = `V-Invoice ${invoice.invoice_code ?? params.id} (${invoice.template_type ?? ''})`

    // 1. Create spreadsheet with three sheets
    const created = await sheetsPost(accessToken, '', {
      properties: { title },
      sheets: [
        { properties: { title: 'JM FORM',  sheetId: 0, index: 0 } },
        { properties: { title: 'SUMMARY',  sheetId: 1, index: 1 } },
        { properties: { title: 'NVL',      sheetId: 2, index: 2 } },
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

    // 3b. Write NVL data (3rd sheet)
    const nvlRows = buildNVLRows(invoice)
    await sheetsPut(
      accessToken,
      `${spreadsheetId}/values/${encodeURIComponent('NVL!A1')}?valueInputOption=USER_ENTERED`,
      { values: nvlRows },
    )

    // 4. Move to configured Drive folder (if set)
    let folderWarning: string | null = null
    if (folderId) {
      try {
        await moveFileToDriveFolder(accessToken, spreadsheetId, folderId)
      } catch (moveErr: any) {
        const msg = String(moveErr.message ?? '')
        if (msg.includes('insufficient') || msg.includes('scope')) {
          folderWarning = 'Token Google chưa có quyền "Drive files". Vào Settings → ngắt kết nối Google Drive → kết nối lại để cấp quyền mới. File đã tạo ở root Drive.'
        } else {
          folderWarning = `Không thể di chuyển vào folder (${msg}). Kiểm tra lại link folder và quyền truy cập. File đã tạo ở root Drive.`
        }
      }
    }

    // 5. Basic formatting: bold headers, freeze rows
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
        // SUMMARY row 1 — group headers (amber/yellow)
        {
          repeatCell: {
            range:  { sheetId: 1, startRowIndex: 0, endRowIndex: 1 },
            cell:   { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.98, green: 0.92, blue: 0.60 } } },
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
          },
        },
        // SUMMARY row 2 — sub-headers (blue)
        {
          repeatCell: {
            range:  { sheetId: 1, startRowIndex: 1, endRowIndex: 2 },
            cell:   { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.88, green: 0.93, blue: 0.99 } } },
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
          },
        },
        // SUMMARY row 3 — Chinese row (light gray, italic)
        {
          repeatCell: {
            range:  { sheetId: 1, startRowIndex: 2, endRowIndex: 3 },
            cell:   { userEnteredFormat: { textFormat: { italic: true }, backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 } } },
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
          },
        },
        // Freeze first 3 rows of SUMMARY (3 header rows)
        {
          updateSheetProperties: {
            properties: { sheetId: 1, gridProperties: { frozenRowCount: 3 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
        // NVL sheet — bold title row
        {
          repeatCell: {
            range:  { sheetId: 2, startRowIndex: 0, endRowIndex: 1 },
            cell:   { userEnteredFormat: { textFormat: { bold: true, fontSize: 11 } } },
            fields: 'userEnteredFormat(textFormat)',
          },
        },
      ],
    })

    return NextResponse.json({
      success: true,
      spreadsheetUrl,
      folderUrl: folderId ? folderUrl : null,
      warning: folderWarning,
    })
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
