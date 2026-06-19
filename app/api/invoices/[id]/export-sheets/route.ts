import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'
import { getGoogleAccessToken } from '@/lib/google/getAccessToken'
import { templateLabel } from '@/lib/templates'

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

// Wrap a public URL in =IMAGE() formula
function driveImageFormula(publicUrl: string | null | undefined): string {
  if (!publicUrl?.trim()) return ''
  return `=IMAGE("${publicUrl}")`
}

function extractDriveFileId(url: string | null | undefined): string | null {
  if (!url?.trim()) return null
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]{10,})/,
    /[?&]id=([a-zA-Z0-9_-]{10,})/,
    /\/d\/([a-zA-Z0-9_-]{10,})/,
    /\/open\?id=([a-zA-Z0-9_-]{10,})/,
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) return m[1]
  }
  return null
}

// Fetch image bytes from Drive and upload to Supabase public Storage.
// =IMAGE() in Sheets needs a public URL — Drive files are private.
// drive.readonly scope is sufficient to read bytes; no permission change on Drive files needed.
async function fetchImageToSupabase(
  accessToken: string,
  fileId: string,
  db: any,
): Promise<string | null> {
  try {
    // Fetch raw bytes from Drive
    const imgRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!imgRes.ok) return null

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
    const ext = contentType.split('/')[1]?.split(';')[0]?.toLowerCase().replace('jpeg', 'jpg') || 'jpg'
    const bytes = new Uint8Array(await imgRes.arrayBuffer())

    // Create public bucket (no-op if already exists)
    await (db.storage as any).createBucket('export-images', { public: true }).catch(() => {})

    const path = `drive/${fileId}.${ext}`
    const { error } = await db.storage
      .from('export-images')
      .upload(path, bytes, { contentType, upsert: true })

    if (error) return null

    const { data } = db.storage.from('export-images').getPublicUrl(path)
    return data?.publicUrl ?? null
  } catch {
    return null
  }
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
  header.push('Tên khách')  // per-product customer
  header.push(isAG3 ? 'Chi tiết/1sp' : 'Ghi chú (NINI)')
  if (isAG3) header.push('', '', '')  // V=empty spacer, W=hoa_don (unlabeled in Excel), X=ngay_gui (unlabeled)
  rows.push(header)

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
    row.push(item.customer_name ?? '')  // per-product customer
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

const SUMMARY_COLS = 33  // includes "Tên khách" col (index 3, after SO/MO)
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
    row[1] = driveImageFormula(item.image_url)
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

// ADM SUMMARY: 25 cols (A–Y). Col D (index 3) = Tên khách. X=HPUSA, Y=CIF 10%.
// No fabrication fee columns. U col (don_gia_phi) = 0 for ADM — fee per pcs is waived.
function buildSummaryRowsADM(items: any[]) {
  const C = 25
  const rows: (string | number)[][] = []

  // Row 1 — group headers
  const r1 = Array(C).fill('')
  r1[0]='STT'; r1[1]='HÌNH ẢNH'; r1[2]='THÔNG TIN SẢN PHẨM'
  r1[8]='Tiền vàng ($)'; r1[9]='TL SẢN PHẨM (gr)'
  r1[12]='THÔNG TIN XOÀN'; r1[19]='GIÁ XOÀN'; r1[21]='Phí nhận hột'
  r1[23]='HPUSA'; r1[24]='CIF 10% ($)'
  rows.push(r1)

  // Row 2 — sub-headers
  const r2 = Array(C).fill('')
  r2[2]='SO/MO'; r2[3]='Tên khách'; r2[4]='Kích Thước'; r2[5]='Số lượng'; r2[6]='Mã số mẫu'; r2[7]='Loại vàng'
  r2[9]='T.Phẩm (có NVL đá)'; r2[10]='T.Phẩm (trừ NVL đá)'; r2[11]='T.Phẩm (vàng TT)'
  r2[12]='Mã Xoàn'; r2[13]='P.Chất'; r2[14]='Size (mm)'; r2[15]='SL'
  r2[16]='TL (ct.) trước xử lý'; r2[17]='TL (ct.) sau xử lý'; r2[18]='TL Xoàn (gr)'
  r2[19]='Đơn giá'; r2[20]='Tổng giá'; r2[21]='Đơn giá phí'; r2[22]='T.Phí'
  r2[23]='Vốn sản xuất'
  rows.push(r2)

  // Row 3 — Chinese
  const r3 = Array(C).fill('')
  r3[0]='编号'; r3[1]='图片'; r3[2]='产品编号'; r3[3]='客户'; r3[4]='尺寸'; r3[5]='数量'; r3[6]='型号'; r3[7]='金属类型'
  r3[8]='金价'; r3[11]='净金重'
  r3[12]='石编号'; r3[13]='石头质量'; r3[14]='大小'; r3[15]='石数'; r3[16]='车前石重'
  r3[18]='石重/克'; r3[19]='石单价'; r3[20]='石总价'; r3[21]='镶单价'; r3[22]='镶工总价'
  r3[23]='总计'; r3[24]='到岸价'
  rows.push(r3)

  for (const item of items ?? []) {
    const gems     = (item.invoice_diamonds ?? []) as any[]
    const custName = item.customer_name ?? item.nini_adm   // fallback to nini_adm for pre-migration data
    const numRows  = Math.max(gems.length, 1)
    const vonSX    = typeof n(item.von_san_xuat) === 'number' ? (n(item.von_san_xuat) as number) : 0

    for (let g = 0; g < numRows; g++) {
      const gem = gems[g] as any | undefined
      const row = Array(C).fill('')

      if (g === 0) {
        row[0]  = n(item.seq)
        row[1]  = driveImageFormula(item.image_url)
        row[2]  = item.so_mo        ?? ''
        row[3]  = custName          ?? ''
        row[4]  = item.kich_thuoc   ?? ''
        row[5]  = n(item.qt_pcs)
        row[6]  = item.vendor_model ?? ''
        row[7]  = item.loai_vang    ?? ''
        row[8]  = n(item.tien_vang)
        row[9]  = n(item.t_pham_co_nvl_da)
        row[10] = n(item.t_pham_tru_nvl_da)
        row[11] = n(item.t_pham_vang_thuc_te ?? item.t_pham_tru_nvl_da)
        row[23] = vonSX > 0 ? vonSX : ''
        row[24] = vonSX > 0 ? vonSX * 1.10 : ''
      }

      if (gem) {
        row[12] = gem.ma_xoan         ?? ''
        row[13] = gem.p_chat          ?? ''
        row[14] = gem.size_xoan_range ?? ''
        row[15] = n(gem.sl_hot)
        row[16] = n(gem.tl_truoc_xu_ly_ct)
        row[17] = n(gem.tl_sau_xu_ly_ct)
        row[18] = n(gem.tl_xoan_gr)
        row[19] = n(gem.don_gia)
        row[20] = n(gem.t_gia_xoan)
        row[21] = 0   // don_gia_phi = 0 for ADM
        row[22] = 0   // t_phi = 0 for ADM
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
  r1[8]  = 'Tiền vàng ($)'
  r1[9]  = 'TRỌNG Lượng (gr)'
  r1[12] = 'THÔNG TIN XOÀN'
  r1[21] = 'Phí nhận hột'
  r1[23] = 'Gia công / 1 SP'; r1[24] = 'Đúc / 1sp'
  r1[25] = 'Thiết Kế / 1sp'; r1[26] = 'Resin / 1sp'
  r1[27] = 'Phí phụ kiện (mua bên ngoài)'
  r1[28] = 'HPUSA'
  r1[30] = 'Ngày gửi';        r1[31] = 'Tracking# gửi hàng USA'
  r1[32] = 'Hóa Đôn (V-INVOICE)'
  rows.push(r1)

  // Row 2 — sub-headers (col 16/17 differ for CH2: no TL trước, only TL sau)
  const r2: (string | number)[] = Array(SUMMARY_COLS).fill('')
  r2[2]  = 'SO/MO';           r2[3]  = 'Tên khách';  r2[4]  = 'Kích Thước'
  r2[5]  = 'Số lượng';        r2[6]  = 'Mã số mẫu';  r2[7]  = 'Loại vàng'
  r2[9]  = 'T.Phẩm (có NVL đá)'; r2[10] = 'T.Phẩm (trừ NVL đá)'; r2[11] = 'T.Phẩm (vàng TT)'
  r2[12] = 'Mã Xoàn';         r2[13] = 'P. chất';    r2[14] = 'Size Xoàn'
  r2[15] = 'SL hột'
  r2[16] = isCH2 ? 'TL (ct.) sau xử lý' : 'TL (ct.) trước xử lý'
  r2[17] = isCH2 ? '' : 'TL (ct.) sau xử lý'
  r2[18] = 'TL Xoàn (gr)';    r2[19] = 'Đơn giá ($)'; r2[20] = 'T.GIÁ XOÀN'
  r2[21] = 'Đơn giá phí';     r2[22] = 'T.Phí'
  r2[28] = 'Vốn sản xuất';    r2[29] = 'Bảo hiểm'
  rows.push(r2)

  // Row 3 — Chinese translations
  const r3: (string | number)[] = Array(SUMMARY_COLS).fill('')
  r3[0]='编号'; r3[1]='图片'; r3[2]='产品编号'; r3[3]='客户'; r3[4]='尺寸'; r3[5]='数量'; r3[6]='型号'; r3[7]='金属类型'
  r3[8]='金价'; r3[10]='产品重量'; r3[11]='净金重'
  r3[12]='石编号'; r3[13]='石头质量'; r3[14]='大小'; r3[15]='石数'; r3[16]='车前石重'
  r3[18]='石重/克'; r3[19]='石单价(连耗)'; r3[20]='石总价'; r3[21]='镶单价'; r3[22]='镶工总价'
  r3[23]='产品费'; r3[24]='倒膜费'; r3[25]='起版费'; r3[26]='蜡版费'; r3[27]='附件价'
  r3[28]='总计'; r3[29]='到岸价'
  rows.push(r3)

  // Data — dynamic rows: 1 main row + 1 row per gem (no fixed block limit)
  for (const item of items ?? []) {
    const gems = (item.invoice_diamonds ?? []) as any[]
    const custName = item.customer_name ?? item.nini_adm
    const numRows = Math.max(gems.length, 1)

    for (let g = 0; g < numRows; g++) {
      const gem = gems[g] as any | undefined
      const row: (string | number)[] = Array(SUMMARY_COLS).fill('')

      if (g === 0) {
        // Main row — product identity + fees + output
        row[0]  = n(item.seq)
        row[1]  = driveImageFormula(item.image_url)
        row[2]  = item.so_mo        ?? ''
        row[3]  = custName          ?? ''
        row[4]  = item.kich_thuoc   ?? ''
        row[5]  = n(item.qt_pcs)
        row[6]  = item.vendor_model ?? ''
        row[7]  = item.loai_vang    ?? ''
        row[8]  = n(item.tien_vang)
        row[9]  = n(item.t_pham_co_nvl_da)
        row[10] = n(item.t_pham_tru_nvl_da)
        row[11] = n(item.t_pham_vang_thuc_te ?? item.t_pham_tru_nvl_da)
        row[23] = n(item.gia_cong);     row[24] = n(item.duc)
        row[25] = n(item.thiet_ke);     row[26] = n(item.resin)
        row[27] = n(item.phi_phu_kien)
        row[28] = n(item.von_san_xuat); row[29] = n(item.bao_hiem)
        row[30] = item.ngay_gui    ?? ''
        row[31] = item.tracking_no ?? ''
        row[32] = item.hoa_don     ?? ''
      }

      // Gem columns (12-22) — CH2 prefers tl_sau but falls back to tl_truoc (XoanLookupPanel fills tl_truoc only)
      if (gem) {
        row[12] = gem.ma_xoan         ?? ''
        row[13] = gem.p_chat          ?? ''
        row[14] = gem.size_xoan_range ?? ''
        row[15] = n(gem.sl_hot)
        row[16] = isCH2 ? n(gem.tl_sau_xu_ly_ct ?? gem.tl_truoc_xu_ly_ct) : n(gem.tl_truoc_xu_ly_ct)
        row[17] = isCH2 ? '' : n(gem.tl_sau_xu_ly_ct)
        row[18] = n(gem.tl_xoan_gr)
        row[19] = n(gem.don_gia)
        row[20] = n(gem.t_gia_xoan)
        row[21] = 1
        row[22] = n(gem.t_phi)
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

    // Upload Drive images to Supabase public Storage to get permanent public URLs for =IMAGE() formula.
    const processedItems = await Promise.all(
      (items ?? []).map(async (item) => {
        const fileId = extractDriveFileId(item.image_url)
        if (!fileId) return item
        const publicUrl = await fetchImageToSupabase(accessToken, fileId, db)
        return { ...item, image_url: publicUrl ?? null }
      }),
    )

    const title = `V-Invoice ${invoice.invoice_code ?? params.id} (${templateLabel(invoice.template_type)})`

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
    const jmRows = buildJMFormRows(invoice, processedItems, canSeePrice)
    await sheetsPut(
      accessToken,
      `${spreadsheetId}/values/${encodeURIComponent('JM FORM!A1')}?valueInputOption=USER_ENTERED`,
      { values: jmRows },
    )

    // 3. Write SUMMARY data
    const summaryRows = buildSummaryRows(invoice, processedItems)

    // ── Grand total row (TỔNG CỘNG) ─────────────────────────────────────────
    const template3 = (invoice.template_type ?? 'CH1') as string
    const _isAG3gt  = template3 === 'CH1_AG3' || template3 === 'VNSI_AG3'
    const _isADMgt  = template3 === 'ADM'
    const _gtNCols  = summaryRows[0]?.length ?? 32
    const sumF = (field: string) => processedItems.reduce((s: number, item: any) => {
      const v = n(item[field]); return s + (typeof v === 'number' ? v : 0)
    }, 0)

    let summaryGrandTotalRowIdx = -1
    if (processedItems.length > 0) {
      if (_isAG3gt) {
        summaryGrandTotalRowIdx = 3 + processedItems.length * 4
        const gt = Array(_gtNCols).fill('')
        gt[0] = 'TỔNG'; gt[4] = sumF('qt_pcs'); gt[7] = sumF('tien_vang')
        gt[8] = sumF('t_pham_co_nvl_da'); gt[9] = sumF('von_san_xuat')
        summaryRows.push(gt)
      } else {
        let dataRowCount = 0
        for (const item of processedItems) {
          const gems = (item.invoice_diamonds ?? []) as any[]
          dataRowCount += Math.max(gems.length, 1)
        }
        summaryGrandTotalRowIdx = 3 + dataRowCount
        const gt = Array(_gtNCols).fill('')
        gt[0] = 'TỔNG'; gt[5] = sumF('qt_pcs'); gt[8] = sumF('tien_vang')
        if (_isADMgt) { gt[23] = sumF('von_san_xuat'); gt[24] = sumF('von_san_xuat') * 1.10 }
        else          { gt[9] = sumF('t_pham_co_nvl_da'); gt[28] = sumF('von_san_xuat') }
        summaryRows.push(gt)
      }
    }

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
    const thickGold = { style: 'SOLID_MEDIUM', width: 2, color: { red: 0.70, green: 0.55, blue: 0.10 } }
    const thickDark = { style: 'SOLID_MEDIUM', width: 2, color: { red: 0.30, green: 0.30, blue: 0.30 } }

    // ── Dynamic SUMMARY totals formatting ────────────────────────────────────
    const summaryExtraFmt: any[] = []
    if (isAG3f && processedItems.length > 0) {
      for (let i = 0; i < processedItems.length; i++) {
        const subRowIdx    = 3 + i * 4 + 1
        const spacerRowIdx = 3 + i * 4 + 2
        const totalsRowIdx = 3 + i * 4 + 3
        summaryExtraFmt.push(
          { updateDimensionProperties: { range: { sheetId: 1, dimension: 'ROWS', startIndex: subRowIdx, endIndex: subRowIdx + 1 }, properties: { pixelSize: 22 }, fields: 'pixelSize' } },
          { updateDimensionProperties: { range: { sheetId: 1, dimension: 'ROWS', startIndex: spacerRowIdx, endIndex: spacerRowIdx + 1 }, properties: { pixelSize: 8 }, fields: 'pixelSize' } },
          { updateDimensionProperties: { range: { sheetId: 1, dimension: 'ROWS', startIndex: totalsRowIdx, endIndex: totalsRowIdx + 1 }, properties: { pixelSize: 28 }, fields: 'pixelSize' } },
          { repeatCell: {
            range: { sheetId: 1, startRowIndex: totalsRowIdx, endRowIndex: totalsRowIdx + 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.98, green: 0.94, blue: 0.75 } } },
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
          }},
          { updateBorders: { range: { sheetId: 1, startRowIndex: totalsRowIdx, endRowIndex: totalsRowIdx + 1, startColumnIndex: 0, endColumnIndex: summaryNCols }, top: thickGold, bottom: thickGold, left: thin, right: thin, innerVertical: thinLight } },
        )
      }
    }
    // ── Inter-item separators (ADM/CH1/CH2): medium top border + customer cell ─
    // Each product spans numRows (main + gem rows). A medium top border at every
    // block boundary makes products easy to tell apart. The customer cell (col D)
    // is also given a subtle highlight so it stands out from the gem grid.
    if (!isAG3f && processedItems.length > 0) {
      const itemDivider = { style: 'SOLID_MEDIUM', width: 2, color: { red: 0.45, green: 0.45, blue: 0.45 } }
      let rowCursor = 3  // first data row (after 3 header rows)
      for (let i = 0; i < processedItems.length; i++) {
        const gems    = (processedItems[i].invoice_diamonds ?? []) as any[]
        const numRows = Math.max(gems.length, 1)
        // Divider above every product except the first (header already bounds it)
        if (i > 0) {
          summaryExtraFmt.push(
            { updateBorders: { range: { sheetId: 1, startRowIndex: rowCursor, endRowIndex: rowCursor + 1, startColumnIndex: 0, endColumnIndex: summaryNCols }, top: itemDivider } },
          )
        }
        // Highlight the customer cell (col D = index 3) on the product's main row
        summaryExtraFmt.push(
          { repeatCell: {
            range: { sheetId: 1, startRowIndex: rowCursor, endRowIndex: rowCursor + 1, startColumnIndex: 3, endColumnIndex: 4 },
            cell: { userEnteredFormat: {
              textFormat: { bold: true, fontSize: 9 },
              backgroundColor: { red: 0.96, green: 0.97, blue: 0.92 },
              horizontalAlignment: 'LEFT',
              verticalAlignment: 'MIDDLE',
              wrapStrategy: 'WRAP',
            }},
            fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment,verticalAlignment,wrapStrategy)',
          }},
        )
        rowCursor += numRows
      }
    }

    if (summaryGrandTotalRowIdx >= 0) {
      summaryExtraFmt.push(
        { updateDimensionProperties: { range: { sheetId: 1, dimension: 'ROWS', startIndex: summaryGrandTotalRowIdx, endIndex: summaryGrandTotalRowIdx + 1 }, properties: { pixelSize: 32 }, fields: 'pixelSize' } },
        { repeatCell: {
          range: { sheetId: 1, startRowIndex: summaryGrandTotalRowIdx, endRowIndex: summaryGrandTotalRowIdx + 1 },
          cell: { userEnteredFormat: {
            textFormat: { bold: true, fontSize: 10 },
            backgroundColor: { red: 0.98, green: 0.88, blue: 0.50 },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
          }},
          fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment,verticalAlignment)',
        }},
        { updateBorders: { range: { sheetId: 1, startRowIndex: summaryGrandTotalRowIdx, endRowIndex: summaryGrandTotalRowIdx + 1, startColumnIndex: 0, endColumnIndex: summaryNCols }, top: thickDark, bottom: thickDark, left: thickDark, right: thickDark, innerVertical: thinLight } },
      )
    }

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
      // ADM: 25 cols (Tên khách at col 3)
      summaryMerges.push(
        { mergeCells: { range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 2,  endColumnIndex: 8  }, mergeType: 'MERGE_ALL' } }, // THÔNG TIN SP (incl. Tên khách)
        { mergeCells: { range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 9,  endColumnIndex: 12 }, mergeType: 'MERGE_ALL' } }, // TL SẢN PHẨM
        { mergeCells: { range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 12, endColumnIndex: 19 }, mergeType: 'MERGE_ALL' } }, // THÔNG TIN XOÀN
        { mergeCells: { range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 19, endColumnIndex: 21 }, mergeType: 'MERGE_ALL' } }, // GIÁ XOÀN
        { mergeCells: { range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 21, endColumnIndex: 23 }, mergeType: 'MERGE_ALL' } }, // Phí nhận hột
      )
      for (const c of [0, 1, 8, 24]) {
        summaryMerges.push({ mergeCells: { range: { sheetId: 1, startRowIndex: 0, endRowIndex: 2, startColumnIndex: c, endColumnIndex: c + 1 }, mergeType: 'MERGE_ALL' } })
      }
    } else {
      // CH1 / CH2: 33 cols (Tên khách at col 3)
      summaryMerges.push(
        { mergeCells: { range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 2,  endColumnIndex: 8  }, mergeType: 'MERGE_ALL' } }, // THÔNG TIN SP (incl. Tên khách)
        { mergeCells: { range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 9,  endColumnIndex: 12 }, mergeType: 'MERGE_ALL' } }, // TRỌNG Lượng
        { mergeCells: { range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 12, endColumnIndex: 21 }, mergeType: 'MERGE_ALL' } }, // THÔNG TIN XOÀN
        { mergeCells: { range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 21, endColumnIndex: 23 }, mergeType: 'MERGE_ALL' } }, // Phí nhận hột
      )
      // Fabrication single cols 23-27 + shipping cols 30-32 have no sub-header in row 1
      for (const c of [0, 1, 8, 23, 24, 25, 26, 27, 30, 31, 32]) {
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
      scw(0,1,45); scw(1,2,95); scw(2,3,140); scw(3,4,150); scw(4,5,70); scw(5,6,55)
      scw(6,7,90); scw(7,8,70); scw(8,9,85); scw(9,10,95); scw(10,11,95); scw(11,12,95)
      scw(12,13,110); scw(13,14,65); scw(14,15,80); scw(15,16,50); scw(16,17,85)
      scw(17,18,85); scw(18,19,80); scw(19,20,80); scw(20,21,80); scw(21,22,80); scw(22,23,70)
      scw(23,24,85); scw(24,25,85)
    } else {
      scw(0,1,45); scw(1,2,100); scw(2,3,140); scw(3,4,150); scw(4,5,70); scw(5,6,55)
      scw(6,7,90); scw(7,8,70); scw(8,9,85); scw(9,10,95); scw(10,11,95); scw(11,12,95)
      scw(12,13,110); scw(13,14,65); scw(14,15,80); scw(15,16,50); scw(16,17,85)
      scw(17,18,85); scw(18,19,80); scw(19,20,80); scw(20,21,80); scw(21,22,80); scw(22,23,70)
      scw(23,24,72); scw(24,25,68); scw(25,26,72); scw(26,27,68); scw(27,28,72)
      scw(28,29,85); scw(29,30,80); scw(30,31,100); scw(31,32,120); scw(32,33,100)
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
      sfmt(7, 8,  '#,##0')              // Tiền vàng — rounded
      sfmt(8, 9,  '0.00', 'NUMBER')     // TL T.Phẩm (gr) — 2 decimals
      sfmt(9, 10, '#,##0')              // Trị giá — rounded
    } else if (isADMf) {
      sfmt(8, 9,  '#,##0')              // Tiền vàng — rounded
      sfmt(9, 12, '0.00', 'NUMBER')     // T.Phẩm weights (gr) — 2 decimals
      sfmt(16,18, '0.000', 'NUMBER')    // TL trước/sau (ct) — 3 decimals
      sfmt(18,19, '0.0000', 'NUMBER')   // TL Xoàn (gr) — 4 decimals
      sfmt(19,21, '#,##0')              // GIÁ XOÀN — rounded
      sfmt(21,23, '#,##0')              // Phí nhận hột — rounded
      sfmt(23,25, '#,##0')              // HPUSA, CIF — rounded
    } else {
      sfmt(8, 9,  '#,##0')              // Tiền vàng — rounded
      sfmt(9, 12, '0.00', 'NUMBER')     // T.Phẩm weights (gr) — 2 decimals
      sfmt(16,18, '0.000', 'NUMBER')    // TL trước/sau (ct) — 3 decimals
      sfmt(18,19, '0.0000', 'NUMBER')   // TL Xoàn (gr) — 4 decimals
      sfmt(19,23, '#,##0')              // Đơn giá, T.GIÁ, Phí nhận hột cols — rounded
      sfmt(23,29, '#,##0')              // Gia công–HPUSA — rounded
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
    {
      // Wt.(gr) column = priceStart - 1 → product weight, 2 decimals
      const priceStart0 = template2 === 'CH1_AG3' ? 12 : 11
      jmNumFmt.push({
        repeatCell: {
          range: { sheetId: 0, startRowIndex: 2, startColumnIndex: priceStart0 - 1, endColumnIndex: priceStart0 },
          cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '0.00' }, horizontalAlignment: 'RIGHT' } },
          fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
        },
      })
    }
    if (canSeePrice) {
      // Price cols start after the base cols
      const priceStart = template2 === 'CH1_AG3' ? 12 : 11
      jmNumFmt.push({
        repeatCell: {
          range: { sheetId: 0, startRowIndex: 2, startColumnIndex: priceStart, endColumnIndex: jmColCount - 1 },
          cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '#,##0' }, horizontalAlignment: 'RIGHT' } },
          fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
        },
      })
      // Chênh lệch col is percentage (CH1 only: priceStart+3)
      if (isCH1f) {
        jmNumFmt.push({
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 2, startColumnIndex: priceStart + 3, endColumnIndex: priceStart + 4 },
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
        // Freeze first 2 rows (no col freeze — conflicts with full-width title row merge)
        { updateSheetProperties: { properties: { sheetId: 0, gridProperties: { frozenRowCount: 2, frozenColumnCount: 0 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } },
        // Row heights: title 30px, header row 42px
        { updateDimensionProperties: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 30 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 42 }, fields: 'pixelSize' } },
        // Right-align numeric data cols (Qt, Wt, prices)
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 2, startColumnIndex: template2 === 'CH1_AG3' ? 10 : 9, endColumnIndex: jmColCount },
            cell: { userEnteredFormat: { horizontalAlignment: 'RIGHT', verticalAlignment: 'MIDDLE' } },
            fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)',
          },
        },
        // Left-align + middle-valign text data cols
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 2, startColumnIndex: 0, endColumnIndex: template2 === 'CH1_AG3' ? 10 : 9 },
            cell: { userEnteredFormat: { horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE' } },
            fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)',
          },
        },
        // Borders: header area (rows 1-2)
        { updateBorders: { range: { sheetId: 0, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: jmColCount }, top: thin, bottom: thin, left: thin, right: thin, innerHorizontal: thinLight, innerVertical: thinLight } },
        // Borders: data area (rows 2-150)
        { updateBorders: { range: { sheetId: 0, startRowIndex: 2, endRowIndex: 150, startColumnIndex: 0, endColumnIndex: jmColCount }, top: thinLight, bottom: thinLight, left: thinLight, right: thinLight, innerHorizontal: thinLight, innerVertical: thinLight } },
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
        // Row heights: header rows 42px, Chinese row 20px, data rows 80px (for images)
        { updateDimensionProperties: { range: { sheetId: 1, dimension: 'ROWS', startIndex: 0, endIndex: 2 }, properties: { pixelSize: 42 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: 1, dimension: 'ROWS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 20 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: 1, dimension: 'ROWS', startIndex: 3, endIndex: 203 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } },
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
        // Totals row formatting (AG3 per-item totals + grand total)
        ...summaryExtraFmt,

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
