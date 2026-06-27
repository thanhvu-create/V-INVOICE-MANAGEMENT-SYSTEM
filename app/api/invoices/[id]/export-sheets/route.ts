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

// ── Row builders ─────────────────────────────────────────────────────────────
// All computed values (tien_vang, von_san_xuat, cif_price, etc.) come from DB.
// No Sheets formulas are emitted — only =IMAGE() for inline images remains.

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
  let itemIdx = 0
  for (const item of items ?? []) {
    const erp          = n(item.erp_bom_cost)

    // Purchase price — pre-computed from DB (= von_san_xuat)
    const purchaseValue = n(item.von_san_xuat)

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
      row.push(purchaseValue)
      if (hasCIF) {
        // CIF price — pre-computed from DB
        row.push(n(item.cif_price))
      }
      if (hasERP) {
        row.push(typeof erp === 'number' ? erp : '')  // ERP — manual input, keep static
        // Chênh lệch — computed inline
        const purchaseNum = typeof purchaseValue === 'number' ? purchaseValue : 0
        const erpNum      = typeof erp === 'number' ? erp : 0
        const chenhLech   = purchaseNum > 0 ? (purchaseNum - erpNum) / purchaseNum : ''
        row.push(chenhLech)
      }
      if (hasTagFB) row.push(n(item.tag_price), n(item.fb_price))
      if (isADM) row.push(item.ngay_gui ?? '', item.hoa_don ?? '')
      // AG3 per-unit pricing section
      if (isAG3) {
        const qty = (typeof n(item.qt_pcs) === 'number' && (n(item.qt_pcs) as number) > 0)
          ? (n(item.qt_pcs) as number) : 1
        const wtPerUnit = typeof n(item.wt_gr ?? item.t_pham_co_nvl_da) === 'number'
          ? (n(item.wt_gr ?? item.t_pham_co_nvl_da) as number) / qty : ''
        const purchasePerUnit = typeof purchaseValue === 'number' ? purchaseValue / qty : ''
        const tagVal = n(item.tag_price)
        const tagPerUnit = typeof tagVal === 'number' ? tagVal / qty : ''
        row.push(1, wtPerUnit, purchasePerUnit, tagPerUnit)
      }
    }
    row.push(item.customer_name ?? '')
    row.push(isAG3 ? (item.chi_tiet_tap ?? '') : (item.nini_adm ?? ''))
    if (isAG3) row.push('', item.hoa_don ?? '', item.ngay_gui ?? '')

    rows.push(row)
    itemIdx++
  }

  return rows
}

function buildFormulaRows(invoice: any): (string | number)[][] {
  const template  = invoice.template_type ?? 'CH1'
  const isAG3     = template === 'CH1_AG3' || template === 'VNSI_AG3'
  const isADM     = template === 'ADM'
  const lossGold  = ((invoice.nvl_loss_gold ?? 0.06) * 100).toFixed(0) + '%'
  const lossPt    = ((invoice.nvl_loss_pt  ?? 0.17) * 100).toFixed(0) + '%'
  const cifRate   = ((invoice.nvl_cif_rate ?? 0.05) * 100).toFixed(0) + '%'
  const spotAu    = invoice.nvl_gold_24k  ?? '—'
  const spotPt    = invoice.nvl_pt_price  ?? '—'
  const spotAg    = invoice.nvl_ag_price  ?? '—'
  const spotPd    = invoice.nvl_pd_price  ?? '—'

  const rows: (string | number)[][] = []

  const h  = (t: string)   => [t, '', '']
  const sub= (t: string)   => ['', t, '']
  const row= (a: string, b: string, c = '') => [a, b, c]
  const hr = ()             => ['', '', '']

  // ── TITLE ────────────────────────────────────────────────────────────────
  rows.push(['CÔNG THỨC TÍNH TOÁN — V-Invoice', '', ''])
  rows.push([`Template: ${template}  |  Invoice: ${invoice.invoice_code ?? ''}`, '', ''])
  rows.push(hr())

  // ── 1. GIÁ VÀNG/GRAM ────────────────────────────────────────────────────
  rows.push(h('1. GIÁ KIM LOẠI / GRAM'))
  rows.push(['Loại', 'Công thức', 'Giá trị snapshot ($)'])
  rows.push(row('24K',  `Spot_Au / 31.103`,                                           String(typeof spotAu === 'number' ? (spotAu / 31.103).toFixed(4) : '—')))
  rows.push(row('22K',  `Spot_Au × (22/24) / 31.103`))
  rows.push(row('18K',  `Spot_Au × (1 + ${lossGold}) × (18/24) / 31.103`))
  rows.push(row('14K',  `Spot_Au × (1 + ${lossGold}) × (14/24) / 31.103`))
  rows.push(row('10K',  `Spot_Au × (1 + ${lossGold}) × (10/24) / 31.103`))
  rows.push(row('PT',   `Spot_PT × (1 + ${lossPt}) / 31.103`,                        String(typeof spotPt === 'number' ? (spotPt * (1 + (invoice.nvl_loss_pt ?? 0.17)) / 31.103).toFixed(4) : '—')))
  rows.push(row('AG',   `Spot_AG × (1 + ${lossGold}) × (1 + ${lossPt}) / 31.103`,   String(typeof spotAg === 'number' ? (spotAg * (1 + (invoice.nvl_loss_gold ?? 0.06)) * (1 + (invoice.nvl_loss_pt ?? 0.17)) / 31.103).toFixed(4) : '—')))
  rows.push(row('PD',   `Spot_PD × (1 + ${lossPt}) / 31.103`,                        String(typeof spotPd === 'number' ? (spotPd * (1 + (invoice.nvl_loss_pt ?? 0.17)) / 31.103).toFixed(4) : '—')))
  rows.push(hr())

  // ── 2. TIỀN VÀNG ────────────────────────────────────────────────────────
  rows.push(h('2. TIỀN VÀNG'))
  rows.push(sub('T.Phẩm vàng thực tế (gr) = T.Phẩm có NVL đá − Σ TL Xoàn (gr)'))
  rows.push(sub('Tiền vàng ($) = Giá kim loại/gram × T.Phẩm vàng thực tế'))
  rows.push(hr())

  // ── 3. TÍNH TOÁN XOÀN ───────────────────────────────────────────────────
  if (!isAG3) {
    rows.push(h('3. TÍNH TOÁN XOÀN (mỗi dòng gem)'))
    rows.push(row('TL Xoàn (gr)',      'TL trước xử lý (ct) ÷ 5'))
    rows.push(row('Đơn giá ($/ct)',    'Lookup từ bảng NVL-Hột theo Size Range'))
    rows.push(row('T.GIÁ XOÀN ($)',   'TL trước xử lý (ct) × Đơn giá ($/ct)'))
    rows.push(row('Đơn giá phí',       '$1 (cố định / viên)'))
    rows.push(row('T.Phí ($)',         'SL hột (viên) × $1'))
    rows.push(hr())
  }

  // ── 4. VỐN SẢN XUẤT / HPUSA ─────────────────────────────────────────────
  rows.push(h('4. VỐN SẢN XUẤT / HPUSA'))
  if (isAG3) {
    rows.push(sub('Vốn SX = Tiền vàng'))
    rows.push(sub('(AG3 không có xoàn và gia công)'))
  } else if (isADM) {
    rows.push(sub('Vốn SX = Σ T.GIÁ XOÀN + Σ T.Phí + Tiền vàng'))
    rows.push(sub('(ADM không tính gia công riêng lẻ)'))
  } else {
    rows.push(sub('Vốn SX = Σ T.GIÁ XOÀN + Σ T.Phí + Tiền vàng'))
    rows.push(sub('       + Gia công + Đúc + Thiết Kế + Resin + Phí phụ kiện'))
  }
  rows.push(hr())

  // ── 5. CIF PRICE ────────────────────────────────────────────────────────
  rows.push(h('5. CIF PRICE'))
  if (template === 'CH2') {
    rows.push(sub('CH2: Không có CIF price'))
  } else {
    rows.push(row('CIF ($)', `Vốn SX × (1 + ${cifRate})  =  Vốn SX × ${(1 + (invoice.nvl_cif_rate ?? 0.05)).toFixed(2)}`))
  }
  rows.push(hr())

  // ── 6. NVL SNAPSHOT ─────────────────────────────────────────────────────
  rows.push(h('6. NVL SNAPSHOT (freeze tại thời điểm tạo invoice)'))
  rows.push(['Tham số', 'Giá trị', ''])
  rows.push(row('Spot Vàng 24K ($/oz)', String(spotAu)))
  rows.push(row('Spot Platinum ($/oz)', String(spotPt)))
  rows.push(row('Spot Silver ($/oz)',   String(spotAg)))
  rows.push(row('Spot Palladium ($/oz)',String(spotPd)))
  rows.push(row('Loss vàng',            lossGold))
  rows.push(row('Loss Pt/AG/PD',        lossPt))
  rows.push(row('CIF rate',             cifRate))
  rows.push(hr())
  rows.push(['⚠ Giá NVL trên đây đã được snapshot khi tạo invoice.', '', ''])
  rows.push(['  Thay đổi giá sau này không ảnh hưởng đến invoice này.', '', ''])

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
  // ── Giá kim loại / gram — pre-computed from NVL snapshot ──────────────
  // Row index (0-based): 13=blank, 14=section header, 15..23 = price/gram rows
  // Sheets rows (1-based):         B15 is header,     B16..B24 = price/gram values
  const spot  = invoice.nvl_gold_24k ?? 0
  const sPt   = invoice.nvl_pt_price ?? 0
  const sAg   = invoice.nvl_ag_price ?? 0
  const sPd   = invoice.nvl_pd_price ?? 0
  const lGold = invoice.nvl_loss_gold ?? 0.06
  const lPt   = invoice.nvl_loss_pt   ?? 0.17
  const OZ    = 31.103
  rows.push([''])
  rows.push(['--- Giá kim loại / gram ---', ''])   // Sheets B15 — section label
  rows.push(['24K / gram',  spot / OZ])                                // B16
  rows.push(['22K / gram',  spot * (22 / 24) / OZ])                    // B17
  rows.push(['18K / gram',  spot * (1 + lGold) * (18 / 24) / OZ])     // B18
  rows.push(['15K / gram',  spot * (1 + lGold) * (15 / 24) / OZ])     // B19
  rows.push(['14K / gram',  spot * (1 + lGold) * (14 / 24) / OZ])     // B20
  rows.push(['10K / gram',  spot * (1 + lGold) * (10 / 24) / OZ])     // B21
  rows.push(['PT / gram',   sPt * (1 + lPt) / OZ])                    // B22
  rows.push(['AG / gram',   sAg * (1 + lGold) * (1 + lPt) / OZ])     // B23
  rows.push(['PD / gram',   sPd * (1 + lPt) / OZ])                    // B24
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
    row[2] = item.vendor_model ?? item.so_mo ?? ''
    row[3] = item.kich_thuoc   ?? ''
    row[4] = n(item.qt_pcs)
    row[5] = item.vendor_model ?? ''
    row[6] = item.loai_vang    ?? ''
    // H = Tiền vàng (pre-computed from DB)
    row[7] = n(item.tien_vang)
    row[8] = n(item.t_pham_co_nvl_da)   // I = TL T.Phẩm — INPUT
    row[9] = n(item.von_san_xuat)       // J = Trị giá = Tiền vàng for AG3 (pre-computed)
    rows.push(row)

    rows.push(Array(C).fill(''))                                    // channel sub-row

    rows.push(Array(C).fill('').map((v, i) => i === 7 ? ' ' : v))  // spacer

    // Totals row — static values matching the main row
    const totals = Array(C).fill('')
    totals[4] = n(item.qt_pcs)
    totals[7] = n(item.tien_vang)           // Tiền vàng
    totals[8] = n(item.t_pham_co_nvl_da)    // TL T.Phẩm
    totals[9] = n(item.von_san_xuat)        // Trị giá
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
    const custName = item.customer_name ?? item.nini_adm
    const numRows  = Math.max(gems.length, 1)

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
        row[9]  = n(item.t_pham_co_nvl_da)   // J = T.Phẩm có NVL đá — INPUT
        // Pre-computed values from DB
        row[10] = n(item.t_pham_tru_nvl_da)     // K = T.Phẩm trừ NVL đá
        row[11] = n(item.t_pham_vang_thuc_te)   // L = T.Phẩm vàng TT
        row[8]  = n(item.tien_vang)              // I = Tiền vàng
        row[23] = n(item.von_san_xuat)           // X = Vốn SX ADM
        row[24] = n(item.cif_price)              // Y = CIF
      }

      if (gem) {
        row[12] = gem.ma_xoan         ?? ''
        row[13] = gem.p_chat          ?? ''
        row[14] = gem.size_xoan_range ?? ''
        row[15] = n(gem.sl_hot)                // P = SL hột — INPUT
        row[16] = n(gem.tl_truoc_xu_ly_ct)     // Q = TL trước — INPUT
        row[17] = n(gem.tl_sau_xu_ly_ct)       // R = TL sau — INPUT
        row[18] = n(gem.tl_xoan_gr)              // S = TL Xoàn (gr) (pre-computed)
        row[19] = n(gem.don_gia)                // T = Đơn giá — from DB lookup
        row[20] = n(gem.t_gia_xoan)             // U = Tổng giá (pre-computed)
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

  // Row 2 — sub-headers (TL trước = col 16, TL sau = col 17 for all templates)
  const r2: (string | number)[] = Array(SUMMARY_COLS).fill('')
  r2[2]  = 'SO/MO';           r2[3]  = 'Tên khách';  r2[4]  = 'Kích Thước'
  r2[5]  = 'Số lượng';        r2[6]  = 'Mã số mẫu';  r2[7]  = 'Loại vàng'
  r2[9]  = 'T.Phẩm (có NVL đá)'; r2[10] = 'T.Phẩm (trừ NVL đá)'; r2[11] = 'T.Phẩm (vàng TT)'
  r2[12] = 'Mã Xoàn';         r2[13] = 'P. chất';    r2[14] = 'Size Xoàn'
  r2[15] = 'SL hột'
  r2[16] = 'TL (ct.) trước xử lý'
  r2[17] = 'TL (ct.) sau xử lý'
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
    const gems     = (item.invoice_diamonds ?? []) as any[]
    const custName = item.customer_name ?? item.nini_adm
    const numRows  = Math.max(gems.length, 1)

    for (let g = 0; g < numRows; g++) {
      const gem = gems[g] as any | undefined
      const row: (string | number)[] = Array(SUMMARY_COLS).fill('')

      if (g === 0) {
        // Static inputs
        row[0]  = n(item.seq)
        row[1]  = driveImageFormula(item.image_url)
        row[2]  = item.so_mo        ?? ''
        row[3]  = custName          ?? ''
        row[4]  = item.kich_thuoc   ?? ''
        row[5]  = n(item.qt_pcs)
        row[6]  = item.vendor_model ?? ''
        row[7]  = item.loai_vang    ?? ''
        row[9]  = n(item.t_pham_co_nvl_da)   // J = T.Phẩm có NVL đá — INPUT
        row[23] = n(item.gia_cong);     row[24] = n(item.duc)
        row[25] = n(item.thiet_ke);     row[26] = n(item.resin)
        row[27] = n(item.phi_phu_kien)
        row[29] = n(item.bao_hiem)
        row[30] = item.ngay_gui    ?? ''
        row[31] = item.tracking_no ?? ''
        row[32] = item.hoa_don     ?? ''
        // Pre-computed values from DB
        row[10] = n(item.t_pham_tru_nvl_da)     // K = T.Phẩm trừ NVL đá
        row[11] = n(item.t_pham_vang_thuc_te)   // L = T.Phẩm vàng TT
        row[8]  = n(item.tien_vang)              // I = Tiền vàng
        row[28] = n(item.von_san_xuat)           // AC = Vốn SX
      }

      // Gem columns (12-22)
      if (gem) {
        row[12] = gem.ma_xoan         ?? ''
        row[13] = gem.p_chat          ?? ''
        row[14] = gem.size_xoan_range ?? ''
        row[15] = n(gem.sl_hot)                // P = SL hột — INPUT
        row[16] = n(gem.tl_truoc_xu_ly_ct)     // Q = TL trước — INPUT
        row[17] = n(gem.tl_sau_xu_ly_ct)       // R = TL sau — INPUT
        row[18] = n(gem.tl_xoan_gr)              // S = TL Xoàn (gr) (pre-computed)
        row[19] = n(gem.don_gia)                // T = Đơn giá — from DB lookup
        row[20] = n(gem.t_gia_xoan)             // U = T.GIÁ XOÀN (pre-computed)
        row[21] = 1                              // V = Đơn giá phí = $1/viên
        row[22] = n(gem.t_phi)                   // W = T.Phí (pre-computed)
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

    // 1. Create spreadsheet with four sheets
    const created = await sheetsPost(accessToken, '', {
      properties: { title },
      sheets: [
        { properties: { title: 'JM FORM',    sheetId: 0, index: 0 } },
        { properties: { title: 'SUMMARY',    sheetId: 1, index: 1 } },
        { properties: { title: 'NVL',        sheetId: 2, index: 2 } },
        { properties: { title: 'CÔNG THỨC', sheetId: 3, index: 3 } },
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

    // 3. Write NVL data (reference sheet with metal prices snapshot)
    const nvlRows = buildNVLRows(invoice)
    await sheetsPut(
      accessToken,
      `${spreadsheetId}/values/${encodeURIComponent('NVL!A1')}?valueInputOption=USER_ENTERED`,
      { values: nvlRows },
    )

    // 3b. Write SUMMARY data (references NVL sheet)
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
        gt[0] = 'TỔNG'
        gt[4] = sumF('qt_pcs')                // Qt. pcs
        gt[7] = sumF('tien_vang')             // Tiền vàng
        gt[8] = sumF('t_pham_co_nvl_da')      // T.Phẩm có NVL đá
        gt[9] = sumF('von_san_xuat')          // Vốn sản xuất
        summaryRows.push(gt)
      } else {
        let dataRowCount = 0
        for (const item of processedItems) {
          const gems = (item.invoice_diamonds ?? []) as any[]
          dataRowCount += Math.max(gems.length, 1)
        }
        summaryGrandTotalRowIdx = 3 + dataRowCount
        const gt = Array(_gtNCols).fill('')
        gt[0] = 'TỔNG'
        gt[5] = sumF('qt_pcs')                // Qty
        gt[8] = sumF('tien_vang')             // Tiền vàng
        if (_isADMgt) {
          gt[23] = sumF('von_san_xuat')       // Vốn SX ADM
          gt[24] = sumF('cif_price')          // CIF ADM
        } else {
          gt[9]  = sumF('t_pham_co_nvl_da')   // T.Phẩm có NVL đá
          gt[28] = sumF('von_san_xuat')       // Vốn SX CH1/CH2
        }
        summaryRows.push(gt)
      }
    }

    await sheetsPut(
      accessToken,
      `${spreadsheetId}/values/${encodeURIComponent('SUMMARY!A1')}?valueInputOption=USER_ENTERED`,
      { values: summaryRows },
    )

    // 3c. Write CÔNG THỨC data (4th sheet)
    const formulaRows = buildFormulaRows(invoice)
    await sheetsPut(
      accessToken,
      `${spreadsheetId}/values/${encodeURIComponent('CÔNG THỨC!A1')}?valueInputOption=USER_ENTERED`,
      { values: formulaRows },
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
        // Multi-gem item: vertically merge the non-gem cols (product info 0–11 +
        // fabrication/totals 23…N) across the item's rows. Gem cols 12–22 stay per-row.
        if (numRows > 1) {
          summaryExtraFmt.push(
            { mergeCells: { range: { sheetId: 1, startRowIndex: rowCursor, endRowIndex: rowCursor + numRows, startColumnIndex: 0,  endColumnIndex: 12 },           mergeType: 'MERGE_COLUMNS' } },
            { mergeCells: { range: { sheetId: 1, startRowIndex: rowCursor, endRowIndex: rowCursor + numRows, startColumnIndex: 23, endColumnIndex: summaryNCols }, mergeType: 'MERGE_COLUMNS' } },
          )
        }
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
    const $ = '"$"#,##0.###'           // explicit dollar — not locale-dependent
    const sfmt = (s: number, e: number, pattern: string) => summaryNumFmt.push({
      repeatCell: {
        range: { sheetId: 1, startRowIndex: 3, startColumnIndex: s, endColumnIndex: e },
        cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern }, horizontalAlignment: 'RIGHT' } },
        fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
      },
    })
    if (isAG3f) {
      sfmt(7, 8,  $)                    // Tiền vàng
      sfmt(8, 9,  '0.00')              // TL T.Phẩm (gr)
      sfmt(9, 10, $)                    // Trị giá
    } else if (isADMf) {
      sfmt(8, 9,  $)                    // Tiền vàng
      sfmt(9, 12, '0.00')              // T.Phẩm weights (gr)
      sfmt(16,18, '0.000')             // TL trước/sau (ct)
      sfmt(18,19, '0.0000')            // TL Xoàn (gr)
      sfmt(19,21, $)                    // GIÁ XOÀN
      sfmt(21,23, $)                    // Phí nhận hột
      sfmt(23,25, $)                    // HPUSA, CIF
    } else {
      sfmt(8, 9,  $)                    // Tiền vàng
      sfmt(9, 12, '0.00')              // T.Phẩm weights (gr)
      sfmt(16,18, '0.000')             // TL trước/sau (ct)
      sfmt(18,19, '0.0000')            // TL Xoàn (gr)
      sfmt(19,23, $)                    // Đơn giá, T.GIÁ, Phí nhận hột
      sfmt(23,29, $)                    // Gia công–HPUSA
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
          cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '"$"#,##0.###' }, horizontalAlignment: 'RIGHT' } },
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

        // ═══════════════════════ CÔNG THỨC (sheetId 3) ════════════════════
        // Title row
        { mergeCells: { range: { sheetId: 3, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 3 }, mergeType: 'MERGE_ALL' } },
        { repeatCell: { range: { sheetId: 3, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 13, foregroundColor: { red: 1, green: 1, blue: 1 } }, backgroundColor: { red: 0.17, green: 0.36, blue: 0.60 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment,verticalAlignment)' } },
        // Subtitle row
        { mergeCells: { range: { sheetId: 3, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 3 }, mergeType: 'MERGE_ALL' } },
        { repeatCell: { range: { sheetId: 3, startRowIndex: 1, endRowIndex: 2 }, cell: { userEnteredFormat: { textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.4 } }, backgroundColor: { red: 0.94, green: 0.96, blue: 0.99 } } }, fields: 'userEnteredFormat(textFormat,backgroundColor)' } },
        // Section headers (col A contains section titles starting with number)
        { repeatCell: { range: { sheetId: 3, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: 3 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)' } },
        // Section header rows — highlight rows where col A starts with a digit (1., 2., ...)
        { addConditionalFormatRule: { rule: { ranges: [{ sheetId: 3, startRowIndex: 2, startColumnIndex: 0, endColumnIndex: 3 }], booleanRule: { condition: { type: 'TEXT_STARTS_WITH', values: [{ userEnteredValue: '1' }] }, format: { textFormat: { bold: true }, backgroundColor: { red: 0.98, green: 0.95, blue: 0.80 } } } }, index: 0 } },
        { addConditionalFormatRule: { rule: { ranges: [{ sheetId: 3, startRowIndex: 2, startColumnIndex: 0, endColumnIndex: 3 }], booleanRule: { condition: { type: 'TEXT_STARTS_WITH', values: [{ userEnteredValue: '2' }] }, format: { textFormat: { bold: true }, backgroundColor: { red: 0.98, green: 0.95, blue: 0.80 } } } }, index: 1 } },
        { addConditionalFormatRule: { rule: { ranges: [{ sheetId: 3, startRowIndex: 2, startColumnIndex: 0, endColumnIndex: 3 }], booleanRule: { condition: { type: 'TEXT_STARTS_WITH', values: [{ userEnteredValue: '3' }] }, format: { textFormat: { bold: true }, backgroundColor: { red: 0.98, green: 0.95, blue: 0.80 } } } }, index: 2 } },
        { addConditionalFormatRule: { rule: { ranges: [{ sheetId: 3, startRowIndex: 2, startColumnIndex: 0, endColumnIndex: 3 }], booleanRule: { condition: { type: 'TEXT_STARTS_WITH', values: [{ userEnteredValue: '4' }] }, format: { textFormat: { bold: true }, backgroundColor: { red: 0.98, green: 0.95, blue: 0.80 } } } }, index: 3 } },
        { addConditionalFormatRule: { rule: { ranges: [{ sheetId: 3, startRowIndex: 2, startColumnIndex: 0, endColumnIndex: 3 }], booleanRule: { condition: { type: 'TEXT_STARTS_WITH', values: [{ userEnteredValue: '5' }] }, format: { textFormat: { bold: true }, backgroundColor: { red: 0.98, green: 0.95, blue: 0.80 } } } }, index: 4 } },
        { addConditionalFormatRule: { rule: { ranges: [{ sheetId: 3, startRowIndex: 2, startColumnIndex: 0, endColumnIndex: 3 }], booleanRule: { condition: { type: 'TEXT_STARTS_WITH', values: [{ userEnteredValue: '6' }] }, format: { textFormat: { bold: true }, backgroundColor: { red: 0.98, green: 0.95, blue: 0.80 } } } }, index: 5 } },
        // Col widths: label | formula | value
        { updateDimensionProperties: { range: { sheetId: 3, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 200 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: 3, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 420 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: 3, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 140 }, fields: 'pixelSize' } },
        // Title row height
        { updateDimensionProperties: { range: { sheetId: 3, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 36 }, fields: 'pixelSize' } },

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
        // NVL value col: number format — covers spot prices (rows 3-12) + price/gram formulas (rows 15-23)
        {
          repeatCell: {
            range: { sheetId: 2, startRowIndex: 3, endRowIndex: 30, startColumnIndex: 1, endColumnIndex: 2 },
            cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0.00####' }, horizontalAlignment: 'RIGHT' } },
            fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
          },
        },
        // Section header for price/gram block (row 14, 0-indexed)
        {
          repeatCell: {
            range: { sheetId: 2, startRowIndex: 14, endRowIndex: 15 },
            cell: { userEnteredFormat: { textFormat: { bold: true, italic: true }, backgroundColor: { red: 0.93, green: 0.96, blue: 0.88 } } },
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
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
