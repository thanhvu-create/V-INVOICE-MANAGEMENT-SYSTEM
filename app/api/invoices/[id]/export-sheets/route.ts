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
  const template   = (invoice.template_type ?? 'CH1') as string
  const isCH2      = template === 'CH2'
  const isADM      = template === 'ADM'
  const isCH1_AG3  = template === 'CH1_AG3'
  const isVNSI_AG3 = template === 'VNSI_AG3'
  const isAG3      = isCH1_AG3 || isVNSI_AG3

  // Which optional price columns appear per template:
  // CH1:       Purchase, CIF, ERP BOM, Chênh lệch, Tag, FB
  // CH2:       Purchase, Tag, FB  (no CIF, no ERP/Chênh)
  // ADM:       Purchase, CIF  (no ERP/Chênh, no Tag/FB)
  // CH1_AG3:   Purchase, CIF, Tag, FB  (no ERP/Chênh)
  // VNSI_AG3:  Purchase, CIF, Tag, FB  (no ERP/Chênh)
  const hasCIF  = !isCH2
  const hasERP  = template === 'CH1'
  const hasTagFB = !isADM

  const rows: (string | number)[][] = []

  // Row 1 — invoice title (span across all cols)
  rows.push([invoice.invoice_code ?? ''])

  // Row 2 — column headers (dynamic per template)
  const header: string[] = [
    'No.', 'Store', 'Location in Store', 'Vendor model#',
    isAG3 ? 'PO#' : 'SO# & MO#',
  ]
  if (isCH1_AG3) { header.push('SKU# AG', 'SKU# new (USA)') }
  else            { header.push('SKU# new') }
  header.push('Class', 'Sub class', 'Description', 'Qt.(pcs)', 'Wt.(gr)')
  if (canSeePrice) {
    header.push('HP for Purchase price')
    if (hasCIF)   header.push('HP for CIF price')
    if (hasERP)   header.push('ERP for Bom cost ($)', 'Chênh lệch')
    if (hasTagFB) header.push('HP for Tag price', 'HP for FB price')
    if (isAG3)    header.push('Qt/1sp', 'Wt/1sp (gr)', 'HP Purchase/1sp', 'HP Tag/1sp')
    if (isADM)    header.push('Ngày gửi', 'Hóa đơn (V-INV)')
  }
  header.push(isAG3 ? 'Chi tiết/1sp' : 'Ghi chú (NINI)')
  if (isAG3) header.push('', '', '')  // V=empty spacer, W=hoa_don (unlabeled in Excel), X=ngay_gui (unlabeled)
  rows.push(header)

  // Row 3 — blank sub-header row
  rows.push(Array(header.length).fill(''))

  // Data rows
  for (const item of items ?? []) {
    const purchase = n(item.von_san_xuat ?? item.purchase_price)
    const erp      = n(item.erp_bom_cost)
    const chenh    = (typeof purchase === 'number' && purchase > 0 && typeof erp === 'number')
      ? ((purchase - erp) / purchase)
      : ''

    const row: (string | number)[] = [
      n(item.seq),
      item.store        ?? '',
      item.location     ?? '',
      item.vendor_model ?? item.sku ?? '',
      isAG3 ? (item.po_number ?? '') : (item.so_mo ?? ''),
    ]
    if (isCH1_AG3) { row.push(item.sku_ag ?? '', item.sku ?? '') }
    else            { row.push(item.sku ?? '') }
    row.push(
      item.class       ?? '',
      item.sub_class   ?? '',
      item.description ?? '',
      n(item.qt_pcs),
      n(item.wt_gr ?? item.t_pham_co_nvl_da),
    )
    if (canSeePrice) {
      row.push(typeof purchase === 'number' ? purchase : '')
      if (hasCIF)   row.push(n(item.cif_price))
      if (hasERP)   row.push(typeof erp === 'number' ? erp : '', typeof chenh === 'number' ? chenh : '')
      if (hasTagFB) row.push(n(item.tag_price), n(item.fb_price))
      if (isADM) row.push(item.ngay_gui ?? '', item.hoa_don ?? '')
      // AG3 per-unit pricing section (Giá/1sp group: Qt/1sp, Wt/1sp, Purchase/1sp, Tag/1sp)
      if (isAG3) {
        const qty = (typeof n(item.qt_pcs) === 'number' && (n(item.qt_pcs) as number) > 0)
          ? (n(item.qt_pcs) as number) : 1
        const wtPerUnit  = typeof n(item.wt_gr ?? item.t_pham_co_nvl_da) === 'number'
          ? (n(item.wt_gr ?? item.t_pham_co_nvl_da) as number) / qty : ''
        const purPerUnit = typeof purchase === 'number' ? purchase / qty : ''
        const tagPerUnit = typeof n(item.tag_price) === 'number'
          ? (n(item.tag_price) as number) / qty : ''
        row.push(1, wtPerUnit, purPerUnit, tagPerUnit)
      }
    }
    row.push(isAG3 ? (item.chi_tiet_tap ?? '') : (item.nini_adm ?? ''))
    if (isAG3) row.push('', item.hoa_don ?? '', item.ngay_gui ?? '')  // V=empty, W=hoa_don, X=ngay_gui

    rows.push(row)
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
const SUMMARY_COLS_AG3 = 10

// AG3 templates (CH1_AG3, VNSI_AG3) have a simplified SUMMARY: only 10 cols, no gem/fabrication section.
// Structure mirrors actual Excel: STT, IMG, vendor_model, Kích Thước, Qty, Mã mẫu, Loại vàng, Tiền vàng, TL T.Phẩm, Trị giá
// Block = 3 rows/product (data row + empty row + spacer row)
function buildSummaryRowsAG3(items: any[]) {
  const C = SUMMARY_COLS_AG3
  const rows: (string | number)[][] = []

  // Row 1 — group headers
  const r1 = Array(C).fill('')
  r1[0] = 'STT';   r1[1] = 'HÌNH ẢNH'; r1[2] = 'THÔNG TIN SẢN PHẨM'
  r1[7] = 'Tiền vàng ($)'; r1[8] = 'TL T.Phẩm (gr)'; r1[9] = 'Trị giá ($)'
  rows.push(r1)

  // Row 2 — sub-headers
  const r2 = Array(C).fill('')
  r2[2] = 'SO/MO'; r2[3] = 'Kích Thước'; r2[4] = 'Số lượng'
  r2[5] = 'Mã số mẫu'; r2[6] = 'Loại vàng'
  rows.push(r2)

  // Row 3 — Chinese
  const r3 = Array(C).fill('')
  r3[0]='编号'; r3[1]='图片'; r3[2]='产品编号'; r3[3]='尺寸'; r3[4]='数量'
  r3[5]='型号'; r3[6]='金属类型'; r3[7]='金价'; r3[9]='总计'
  rows.push(r3)

  // Data rows — 4 rows per product (data + channel-sub-row + spacer + totals)
  for (const item of items ?? []) {
    const row = Array(C).fill('')
    row[0] = n(item.seq)
    // Col C (SO/MO) = vendor_model for AG3 (SUMMARY formula = 'JM FORM'!D = vendor model#)
    row[2] = item.vendor_model ?? item.so_mo ?? ''
    row[3] = item.kich_thuoc   ?? ''
    row[4] = n(item.qt_pcs)
    row[5] = item.vendor_model ?? ''
    row[6] = item.loai_vang    ?? ''
    row[7] = n(item.tien_vang)
    row[8] = n(item.t_pham_co_nvl_da)
    row[9] = n(item.von_san_xuat)  // Trị giá = von_san_xuat = tien_vang for AG3
    rows.push(row)
    rows.push(Array(C).fill(''))                                    // channel sub-row (CH1-SR etc — blank, users fill manually)
    rows.push(Array(C).fill('').map((v, i) => i === 7 ? ' ' : v))  // spacer (space in Tiền vàng col to match Excel)
    // Totals row — aggregates qty + financial values (mirrors Excel R7 pattern)
    const totals = Array(C).fill('')
    totals[4] = n(item.qt_pcs)
    totals[7] = n(item.tien_vang)
    totals[8] = n(item.t_pham_co_nvl_da)
    totals[9] = n(item.von_san_xuat)
    rows.push(totals)
  }

  return rows
}

// ADM SUMMARY: 24 cols (A–X). W=HPUSA, X=CIF 10% (SUMMARY internal).
// No fabrication fee columns. nini_adm appears in sub-row g=1 col C.
// U col (don_gia_phi) = 0 for ADM — fee per pcs is waived.
function buildSummaryRowsADM(items: any[]) {
  const C = 24
  const rows: (string | number)[][] = []

  // Row 1 — group headers
  const r1 = Array(C).fill('')
  r1[0]='STT'; r1[1]='HÌNH ẢNH'; r1[2]='THÔNG TIN SẢN PHẨM'
  r1[7]='Tiền vàng ($)'; r1[8]='TL SẢN PHẨM (gr)'
  r1[11]='THÔNG TIN XOÀN'; r1[18]='GIÁ XOÀN'; r1[20]='Phí nhận hột'
  r1[22]='HPUSA'; r1[23]='CIF 10% ($)'
  rows.push(r1)

  // Row 2 — sub-headers
  const r2 = Array(C).fill('')
  r2[2]='SO/MO'; r2[3]='Kích Thước'; r2[4]='Số lượng'; r2[5]='Mã số mẫu'; r2[6]='Loại vàng'
  r2[8]='T.Phẩm (có NVL đá)'; r2[9]='T.Phẩm (trừ NVL đá)'; r2[10]='T.Phẩm (vàng TT)'
  r2[11]='Mã Xoàn'; r2[12]='P.Chất'; r2[13]='Size (mm)'; r2[14]='SL'
  r2[15]='TL (ct.) trước xử lý'; r2[16]='TL (ct.) sau xử lý'; r2[17]='TL Xoàn (gr)'
  r2[18]='Đơn giá'; r2[19]='Tổng giá'; r2[20]='Đơn giá phí'; r2[21]='T.Phí'
  r2[22]='Vốn sản xuất'
  rows.push(r2)

  // Row 3 — Chinese
  const r3 = Array(C).fill('')
  r3[0]='编号'; r3[1]='图片'; r3[2]='产品编号'; r3[3]='尺寸'; r3[4]='数量'; r3[5]='型号'; r3[6]='金属类型'
  r3[7]='金价'; r3[10]='净金重'
  r3[11]='石编号'; r3[12]='石头质量'; r3[13]='大小'; r3[14]='石数'; r3[15]='车前石重'
  r3[17]='石重/克'; r3[18]='石单价'; r3[19]='石总价'; r3[20]='镶单价'; r3[21]='镶工总价'
  r3[22]='总计'; r3[23]='到岸价'
  rows.push(r3)

  for (const item of items ?? []) {
    const gems    = (item.invoice_diamonds ?? []) as any[]
    // Always at least 2 rows: main + nini_adm sub-row
    const numRows = Math.max(gems.length, item.nini_adm ? 2 : 1)
    const vonSX   = typeof n(item.von_san_xuat) === 'number' ? (n(item.von_san_xuat) as number) : 0

    for (let g = 0; g < numRows; g++) {
      const gem = gems[g] as any | undefined
      const row = Array(C).fill('')

      if (g === 0) {
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
        row[22] = vonSX > 0 ? vonSX : ''
        row[23] = vonSX > 0 ? vonSX * 1.10 : ''
      }
      // nini_adm goes in sub-row g=1, col C (matches Excel C5 pattern)
      if (g === 1 && item.nini_adm) row[2] = item.nini_adm

      if (gem) {
        row[11] = gem.ma_xoan         ?? ''
        row[12] = gem.p_chat          ?? ''
        row[13] = gem.size_xoan_range ?? ''
        row[14] = n(gem.sl_hot)
        row[15] = n(gem.tl_truoc_xu_ly_ct)
        row[16] = n(gem.tl_sau_xu_ly_ct)
        row[17] = n(gem.tl_xoan_gr)
        row[18] = n(gem.don_gia)
        row[19] = n(gem.t_gia_xoan)
        row[20] = 0   // don_gia_phi = 0 for ADM
        row[21] = 0   // t_phi = 0 for ADM
      }

      rows.push(row)
    }
  }

  return rows
}

function buildSummaryRows(invoice: any, items: any[]) {
  const template = invoice.template_type ?? 'CH1'
  const isAG3 = template === 'CH1_AG3' || template === 'VNSI_AG3'
  if (isAG3) return buildSummaryRowsAG3(items)
  if (template === 'ADM') return buildSummaryRowsADM(items)

  const isCH2 = template === 'CH2'
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
  r1[27] = 'HPUSA'
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

    // 5. Comprehensive formatting
    const template2    = (invoice.template_type ?? 'CH1') as string
    const isAG3f       = template2 === 'CH1_AG3' || template2 === 'VNSI_AG3'
    const isADMf       = template2 === 'ADM'
    const isCH1f       = template2 === 'CH1'
    const jmColCount   = (jmRows[1] ?? jmRows[0])?.length ?? 20
    const summaryNCols = summaryRows[0]?.length ?? 32

    // Helper — thin border object
    const thin = { style: 'SOLID', width: 1, color: { red: 0.75, green: 0.75, blue: 0.75 } }
    const thinLight = { style: 'SOLID', width: 1, color: { red: 0.88, green: 0.88, blue: 0.88 } }

    // ── SUMMARY group-header merges ──────────────────────────────────────────
    // Cells that have sub-headers in row 1 are NOT vertically merged (they keep their group label in row 0 only).
    // Cells with NO sub-header in row 1 are vertically merged rows 0-1 so they look like a single tall header.
    // Multi-column group labels get a horizontal merge within row 0.
    const summaryMerges: any[] = []
    if (isAG3f) {
      // AG3: 10 cols — THÔNG TIN SẢN PHẨM spans cols 2-6
      summaryMerges.push(
        { mergeCells: { range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 2, endColumnIndex: 7 }, mergeType: 'MERGE_ALL' } },
      )
      // Single-col group headers with no row-1 sub-header → vertical merge rows 0-1
      for (const c of [0, 1, 7, 8, 9]) {
        summaryMerges.push({ mergeCells: { range: { sheetId: 1, startRowIndex: 0, endRowIndex: 2, startColumnIndex: c, endColumnIndex: c + 1 }, mergeType: 'MERGE_ALL' } })
      }
    } else if (isADMf) {
      // ADM: 24 cols
      summaryMerges.push(
        { mergeCells: { range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 2,  endColumnIndex: 7  }, mergeType: 'MERGE_ALL' } }, // THÔNG TIN SP
        { mergeCells: { range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 8,  endColumnIndex: 11 }, mergeType: 'MERGE_ALL' } }, // TL SẢN PHẨM
        { mergeCells: { range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 11, endColumnIndex: 18 }, mergeType: 'MERGE_ALL' } }, // THÔNG TIN XOÀN
        { mergeCells: { range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 18, endColumnIndex: 20 }, mergeType: 'MERGE_ALL' } }, // GIÁ XOÀN
        { mergeCells: { range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 20, endColumnIndex: 22 }, mergeType: 'MERGE_ALL' } }, // Phí nhận hột
      )
      for (const c of [0, 1, 7, 23]) {
        summaryMerges.push({ mergeCells: { range: { sheetId: 1, startRowIndex: 0, endRowIndex: 2, startColumnIndex: c, endColumnIndex: c + 1 }, mergeType: 'MERGE_ALL' } })
      }
    } else {
      // CH1 / CH2: 32 cols
      summaryMerges.push(
        { mergeCells: { range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 2,  endColumnIndex: 7  }, mergeType: 'MERGE_ALL' } }, // THÔNG TIN SP
        { mergeCells: { range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 8,  endColumnIndex: 11 }, mergeType: 'MERGE_ALL' } }, // TRỌNG Lượng
        { mergeCells: { range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 11, endColumnIndex: 20 }, mergeType: 'MERGE_ALL' } }, // THÔNG TIN XOÀN
        { mergeCells: { range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 20, endColumnIndex: 22 }, mergeType: 'MERGE_ALL' } }, // Phí nhận hột
      )
      // Fabrication single cols 22-26 + shipping cols 29-31 have no sub-header in row 1
      for (const c of [0, 1, 7, 22, 23, 24, 25, 26, 29, 30, 31]) {
        summaryMerges.push({ mergeCells: { range: { sheetId: 1, startRowIndex: 0, endRowIndex: 2, startColumnIndex: c, endColumnIndex: c + 1 }, mergeType: 'MERGE_ALL' } })
      }
    }

    // ── SUMMARY column widths (pixel) ────────────────────────────────────────
    const summaryColWidths: any[] = []
    const scw = (s: number, e: number, px: number) => summaryColWidths.push({
      updateDimensionProperties: { range: { sheetId: 1, dimension: 'COLUMNS', startIndex: s, endIndex: e }, properties: { pixelSize: px }, fields: 'pixelSize' },
    })
    if (isAG3f) {
      scw(0,1,45); scw(1,2,95); scw(2,3,140); scw(3,4,70); scw(4,5,55)
      scw(5,6,90); scw(6,7,70); scw(7,8,85); scw(8,9,90); scw(9,10,85)
    } else if (isADMf) {
      scw(0,1,45); scw(1,2,95); scw(2,3,140); scw(3,4,70); scw(4,5,55)
      scw(5,6,90); scw(6,7,70); scw(7,8,85); scw(8,9,95); scw(9,10,95); scw(10,11,95)
      scw(11,12,110); scw(12,13,65); scw(13,14,80); scw(14,15,50); scw(15,16,85)
      scw(16,17,85); scw(17,18,80); scw(18,19,80); scw(19,20,80); scw(20,21,80); scw(21,22,70)
      scw(22,23,85); scw(23,24,85)
    } else {
      scw(0,1,45); scw(1,2,100); scw(2,3,140); scw(3,4,70); scw(4,5,55)
      scw(5,6,90); scw(6,7,70); scw(7,8,85); scw(8,9,95); scw(9,10,95); scw(10,11,95)
      scw(11,12,110); scw(12,13,65); scw(13,14,80); scw(14,15,50); scw(15,16,85)
      scw(16,17,85); scw(17,18,80); scw(18,19,80); scw(19,20,80); scw(20,21,80); scw(21,22,70)
      scw(22,23,72); scw(23,24,68); scw(24,25,72); scw(25,26,68); scw(26,27,72)
      scw(27,28,85); scw(28,29,80); scw(29,30,100); scw(30,31,120); scw(31,32,100)
    }

    // ── SUMMARY number formats (data rows start at row 3) ────────────────────
    const summaryNumFmt: any[] = []
    const sfmt = (s: number, e: number, pattern: string, type = 'CURRENCY') => summaryNumFmt.push({
      repeatCell: {
        range: { sheetId: 1, startRowIndex: 3, startColumnIndex: s, endColumnIndex: e },
        cell: { userEnteredFormat: { numberFormat: { type, pattern }, horizontalAlignment: 'RIGHT' } },
        fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
      },
    })
    if (isAG3f) {
      sfmt(7, 8,  '#,##0.00')           // Tiền vàng
      sfmt(8, 9,  '0.####', 'NUMBER')   // TL T.Phẩm
      sfmt(9, 10, '#,##0.00')           // Trị giá
    } else if (isADMf) {
      sfmt(7, 8,  '#,##0.00')           // Tiền vàng
      sfmt(8, 11, '0.####', 'NUMBER')   // T.Phẩm weights
      sfmt(15,18, '0.####', 'NUMBER')   // TL trước/sau/xoàn
      sfmt(18,20, '#,##0.00')           // GIÁ XOÀN
      sfmt(20,22, '#,##0.00')           // Phí nhận hột
      sfmt(22,24, '#,##0.00')           // HPUSA, CIF
    } else {
      sfmt(7, 8,  '#,##0.00')           // Tiền vàng
      sfmt(8, 11, '0.####', 'NUMBER')   // T.Phẩm weights
      sfmt(15,18, '0.####', 'NUMBER')   // TL trước/sau/xoàn gr
      sfmt(18,22, '#,##0.00')           // Đơn giá, T.GIÁ, Phí nhận hột cols
      sfmt(22,28, '#,##0.00')           // Gia công–HPUSA
    }

    // ── JM FORM column widths ────────────────────────────────────────────────
    const jmColWidths: any[] = []
    const jcw = (s: number, e: number, px: number) => jmColWidths.push({
      updateDimensionProperties: { range: { sheetId: 0, dimension: 'COLUMNS', startIndex: s, endIndex: e }, properties: { pixelSize: px }, fields: 'pixelSize' },
    })
    // Base cols common to all templates
    jcw(0,1,40); jcw(1,2,62); jcw(2,3,85); jcw(3,4,90); jcw(4,5,175)
    if (template2 === 'CH1_AG3') {
      jcw(5,7,85)                // SKU AG + SKU USA
      jcw(7,8,68); jcw(8,9,68); jcw(9,10,200); jcw(10,12,58) // Class, SubClass, Desc, Qt+Wt
      jcw(12,jmColCount,95)      // price cols
    } else {
      jcw(5,6,85)                // SKU
      jcw(6,7,68); jcw(7,8,68); jcw(8,9,200); jcw(9,11,58)   // Class, SubClass, Desc, Qt+Wt
      jcw(11,jmColCount,95)      // price cols
    }

    // ── JM FORM number formats (data rows start at row 3) ────────────────────
    const jmNumFmt: any[] = []
    if (canSeePrice) {
      // Price cols start after the base cols
      const priceStart = template2 === 'CH1_AG3' ? 12 : 11
      jmNumFmt.push({
        repeatCell: {
          range: { sheetId: 0, startRowIndex: 3, startColumnIndex: priceStart, endColumnIndex: jmColCount - 1 },
          cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '#,##0.00' }, horizontalAlignment: 'RIGHT' } },
          fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
        },
      })
      // Chênh lệch col is percentage (CH1 only: priceStart+3)
      if (isCH1f) {
        jmNumFmt.push({
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 3, startColumnIndex: priceStart + 3, endColumnIndex: priceStart + 4 },
            cell: { userEnteredFormat: { numberFormat: { type: 'PERCENT', pattern: '0.00%' } } },
            fields: 'userEnteredFormat.numberFormat',
          },
        })
      }
    }

    await sheetsPost(accessToken, `${spreadsheetId}:batchUpdate`, {
      requests: [
        // ═══════════════════════ JM FORM (sheetId 0) ═══════════════════════
        // Title row (row 0): merge all cols + blue/white bold
        { mergeCells: { range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: jmColCount }, mergeType: 'MERGE_ALL' } },
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: {
              textFormat: { bold: true, fontSize: 12, foregroundColor: { red: 1, green: 1, blue: 1 } },
              backgroundColor: { red: 0.17, green: 0.36, blue: 0.60 },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
            }},
            fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment,verticalAlignment)',
          },
        },
        // Column header row (row 1): amber bg, bold, center, wrap
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 1, endRowIndex: 2 },
            cell: { userEnteredFormat: {
              textFormat: { bold: true, fontSize: 9 },
              backgroundColor: { red: 0.98, green: 0.95, blue: 0.80 },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
              wrapStrategy: 'WRAP',
            }},
            fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment,verticalAlignment,wrapStrategy)',
          },
        },
        // Sub-header row (row 2): same amber, bold, center, wrap
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 2, endRowIndex: 3 },
            cell: { userEnteredFormat: {
              textFormat: { bold: true, fontSize: 9 },
              backgroundColor: { red: 0.98, green: 0.95, blue: 0.80 },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
              wrapStrategy: 'WRAP',
            }},
            fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment,verticalAlignment,wrapStrategy)',
          },
        },
        // Freeze first 3 rows (no col freeze — conflicts with full-width title row merge)
        { updateSheetProperties: { properties: { sheetId: 0, gridProperties: { frozenRowCount: 3, frozenColumnCount: 0 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } },
        // Row heights: title 30px, header rows 42px
        { updateDimensionProperties: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 30 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 1, endIndex: 3 }, properties: { pixelSize: 42 }, fields: 'pixelSize' } },
        // Right-align numeric data cols (Qt, Wt, prices)
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 3, startColumnIndex: template2 === 'CH1_AG3' ? 10 : 9, endColumnIndex: jmColCount },
            cell: { userEnteredFormat: { horizontalAlignment: 'RIGHT', verticalAlignment: 'MIDDLE' } },
            fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)',
          },
        },
        // Left-align + middle-valign text data cols
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 3, startColumnIndex: 0, endColumnIndex: template2 === 'CH1_AG3' ? 10 : 9 },
            cell: { userEnteredFormat: { horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE' } },
            fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)',
          },
        },
        // Borders: header area (rows 1-2)
        { updateBorders: { range: { sheetId: 0, startRowIndex: 1, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: jmColCount }, top: thin, bottom: thin, left: thin, right: thin, innerHorizontal: thinLight, innerVertical: thinLight } },
        // Borders: data area (rows 3-150)
        { updateBorders: { range: { sheetId: 0, startRowIndex: 3, endRowIndex: 150, startColumnIndex: 0, endColumnIndex: jmColCount }, top: thinLight, bottom: thinLight, left: thinLight, right: thinLight, innerHorizontal: thinLight, innerVertical: thinLight } },
        // Column widths
        ...jmColWidths,
        // Number formats
        ...jmNumFmt,

        // ═══════════════════════ SUMMARY (sheetId 1) ══════════════════════
        // Row 0 — group headers: amber/gold bg, bold, center, wrap
        {
          repeatCell: {
            range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: {
              textFormat: { bold: true, fontSize: 9 },
              backgroundColor: { red: 0.98, green: 0.92, blue: 0.60 },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
              wrapStrategy: 'WRAP',
            }},
            fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment,verticalAlignment,wrapStrategy)',
          },
        },
        // Row 1 — sub-headers: light blue, bold, center, wrap
        {
          repeatCell: {
            range: { sheetId: 1, startRowIndex: 1, endRowIndex: 2 },
            cell: { userEnteredFormat: {
              textFormat: { bold: true, fontSize: 9 },
              backgroundColor: { red: 0.88, green: 0.93, blue: 0.99 },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
              wrapStrategy: 'WRAP',
            }},
            fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment,verticalAlignment,wrapStrategy)',
          },
        },
        // Row 2 — Chinese: gray italic, small font, center
        {
          repeatCell: {
            range: { sheetId: 1, startRowIndex: 2, endRowIndex: 3 },
            cell: { userEnteredFormat: {
              textFormat: { italic: true, fontSize: 8, foregroundColor: { red: 0.4, green: 0.4, blue: 0.4 } },
              backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
            }},
            fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment,verticalAlignment)',
          },
        },
        // Freeze 3 header rows
        { updateSheetProperties: { properties: { sheetId: 1, gridProperties: { frozenRowCount: 3 } }, fields: 'gridProperties.frozenRowCount' } },
        // Row heights: header rows 42px, Chinese row 20px
        { updateDimensionProperties: { range: { sheetId: 1, dimension: 'ROWS', startIndex: 0, endIndex: 2 }, properties: { pixelSize: 42 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: 1, dimension: 'ROWS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 20 }, fields: 'pixelSize' } },
        // Borders: header rows
        { updateBorders: { range: { sheetId: 1, startRowIndex: 0, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: summaryNCols }, top: thin, bottom: thin, left: thin, right: thin, innerHorizontal: thinLight, innerVertical: thinLight } },
        // Borders: data area
        { updateBorders: { range: { sheetId: 1, startRowIndex: 3, endRowIndex: 200, startColumnIndex: 0, endColumnIndex: summaryNCols }, top: thinLight, bottom: thinLight, left: thinLight, right: thinLight, innerHorizontal: thinLight, innerVertical: thinLight } },
        // Center-align all data cells in SUMMARY
        { repeatCell: { range: { sheetId: 1, startRowIndex: 3, startColumnIndex: 0, endColumnIndex: summaryNCols }, cell: { userEnteredFormat: { verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat.verticalAlignment' } },
        // Group-header merges
        ...summaryMerges,
        // Column widths
        ...summaryColWidths,
        // Number formats
        ...summaryNumFmt,

        // ═══════════════════════ NVL (sheetId 2) ══════════════════════════
        {
          repeatCell: {
            range: { sheetId: 2, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: {
              textFormat: { bold: true, fontSize: 11 },
              backgroundColor: { red: 0.87, green: 0.95, blue: 0.85 },
            }},
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
          },
        },
        // Header row of NVL table
        {
          repeatCell: {
            range: { sheetId: 2, startRowIndex: 2, endRowIndex: 3 },
            cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.88, green: 0.93, blue: 0.99 } } },
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
          },
        },
        // NVL value col: currency/number format
        {
          repeatCell: {
            range: { sheetId: 2, startRowIndex: 3, endRowIndex: 20, startColumnIndex: 1, endColumnIndex: 2 },
            cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0.00####' }, horizontalAlignment: 'RIGHT' } },
            fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
          },
        },
        // NVL col widths
        { updateDimensionProperties: { range: { sheetId: 2, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 165 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: 2, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } },
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
