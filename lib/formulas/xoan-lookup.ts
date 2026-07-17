// Pure gem-tracking lookup logic — extracted from the old XoanLookupPanel so both
// the SPHT import auto-attach and the invoice "Tra lại tất cả hột" button share it.
// No React, no fetch — takes a parsed workbook + NVL Hot catalog, returns gem bodies.
//
// Tracking sheet columns (0-based): E[4]=MO  F[5]=Mã xoàn  H[7]=Size gốc
//   I[8]=SL hột  J[9]=Trọng lượng (dùng làm TB viên)  M[12]=Trạng thái ("Xuất")

import * as XLSX from 'xlsx'
import { detectStoneType, parseSizeValue } from './size-mapping'

export interface GemRow {
  ma_xoan:      string
  p_chat:       string
  size_xoan:    string   // raw size from tracking (col H): "2.1" or "2.3*2.3"
  sl_hot:       number
  tl_sau_xu_ly: number   // Trọng lượng (col J)
}

export interface NVLHotRow {
  id:         string
  stone_type: string
  grade:      string
  size_range: string
  size_min:   number | null
  size_max:   number | null
  size_unit:  string
  mk_price:   number
}

export interface EnrichedRow extends GemRow {
  mapped_range: string | null
  don_gia:      number
  tb_vien:      number | null  // computed for CT-based types (tl / sl)
}

// Gem POST body shape accepted by /api/invoices/[id]/items/[itemId]/gems
export interface GemBody {
  ma_xoan:           string | null
  p_chat:            string
  size_xoan_range:   string | null
  sl_hot:            number
  tl_truoc_xu_ly_ct: number | null
  tl_sau_xu_ly_ct:   number | null
  don_gia:           number
}

const CT_BASED_TYPES = new Set([
  'BG', 'LG-BG', 'MQ', 'LG-MQ', 'PS', 'LG-PS',
  'OV', 'LG-OV', 'LG-HS', 'LG-TD', 'BQT', 'XC', 'RRB-N', 'PEARL',
])
function isCTBased(stoneType: string | null): boolean {
  return !!stoneType && CT_BASED_TYPES.has(stoneType)
}

/** Extract the MO number from an item's "SO...-MO..." string. */
export function extractMO(soMo: string | null | undefined): string | null {
  if (!soMo) return null
  const m = soMo.match(/MO([\d.]+)/i)
  return m ? m[1] : null
}

function inferPChat(maXoan: string): string {
  if (!maXoan) return ''
  const u = maXoan.toUpperCase()
  if (u.includes('CZ')) return 'CZ'
  if (u.includes('L'))  return 'LG'
  const DIAMOND = ['RD', 'PR', 'BG', 'MQ', 'PS', 'OV', 'TD']
  if (DIAMOND.some(p => u.startsWith(p))) return 'VVS1'
  return ''
}

export function readSheetRows(wb: XLSX.WorkBook, sheetName: string): any[][] {
  const ws = wb.Sheets[sheetName]
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]
}

// Scans the first 10 rows for the "MO" header at col E (index 4) — returns the
// data start row, or null if this sheet doesn't look like a tracking-data sheet.
export function findDataStart(raw: any[][]): number | null {
  for (let i = 0; i < Math.min(10, raw.length); i++) {
    if (String(raw[i]?.[4] ?? '').trim().toUpperCase() === 'MO') return i + 1
  }
  return null
}

/** Filter tracking rows by MO (float-compared to survive Excel trailing-zero loss) and status "Xuất". */
export function filterRows(raw: any[][], dataStart: number, mo: string | null): GemRow[] {
  const out: GemRow[] = []
  for (let i = dataStart; i < raw.length; i++) {
    const r      = raw[i]
    const rowMO  = String(r[4] ?? '').trim()
    const status = String(r[12] ?? '').trim().toLowerCase()
    if (!rowMO) continue
    if (mo && rowMO !== mo) {
      const n1 = parseFloat(rowMO), n2 = parseFloat(mo)
      if (isNaN(n1) || isNaN(n2) || n1 !== n2) continue
    }
    if (status !== 'xuất') continue
    const ma_xoan = String(r[5] ?? '').trim()
    out.push({
      ma_xoan,
      p_chat:       inferPChat(ma_xoan),
      size_xoan:    String(r[7] ?? '').trim(),
      sl_hot:       Number(r[8] ?? 0),
      tl_sau_xu_ly: Number(r[9] ?? 0),
    })
  }
  return out
}

// Picks the first sheet whose first 10 rows contain the "MO" header — falls
// back to the first sheet in the workbook if none match.
export function detectHeuristicSheet(wb: XLSX.WorkBook): string {
  for (const name of wb.SheetNames) {
    if (findDataStart(readSheetRows(wb, name)) !== null) return name
  }
  return wb.SheetNames[0]
}

// Prefers the pinned tab (if it still exists in this workbook), otherwise the MO-header heuristic.
export function resolveDefaultSheet(wb: XLSX.WorkBook, pinnedTab: string | null): string {
  if (pinnedTab && wb.SheetNames.includes(pinnedTab)) return pinnedTab
  return detectHeuristicSheet(wb)
}

/** Enrich raw gem rows with NVL Hot price + mapped size range. */
export function enrichRows(rows: GemRow[], nvlHotList: NVLHotRow[]): EnrichedRow[] {
  return rows.map(r => {
    const stoneType = detectStoneType(r.ma_xoan)
    let sizeNum: number
    let tb_vien: number | null = null
    if (isCTBased(stoneType)) {
      tb_vien = r.sl_hot > 0 ? r.tl_sau_xu_ly / r.sl_hot : 0
      sizeNum = tb_vien
    } else {
      sizeNum = parseSizeValue(r.size_xoan) || r.tl_sau_xu_ly
    }
    const found = stoneType && sizeNum > 0
      ? nvlHotList.find(c =>
          c.stone_type === stoneType &&
          c.size_min != null && c.size_max != null &&
          sizeNum >= c.size_min && sizeNum <= c.size_max)
      : null
    return { ...r, mapped_range: found?.size_range ?? null, don_gia: found?.mk_price ?? 0, tb_vien }
  })
}

export function buildGemBody(r: EnrichedRow): GemBody {
  return {
    ma_xoan:           r.ma_xoan || null,
    p_chat:            r.p_chat,
    size_xoan_range:   r.mapped_range || null,
    sl_hot:            r.sl_hot,
    tl_truoc_xu_ly_ct: r.tl_sau_xu_ly || null,
    tl_sau_xu_ly_ct:   null,
    don_gia:           r.don_gia,
  }
}

/**
 * High-level: given a parsed workbook + pinned tab + NVL Hot catalog + an item's MO,
 * return the gem bodies to attach (empty if MO missing or no matching rows).
 */
export function gemsForMO(
  wb: XLSX.WorkBook,
  pinnedTab: string | null,
  nvlHotList: NVLHotRow[],
  mo: string | null,
): GemBody[] {
  if (!mo) return []
  const sheet     = resolveDefaultSheet(wb, pinnedTab)
  const raw       = readSheetRows(wb, sheet)
  const dataStart = findDataStart(raw) ?? 3
  const rows      = filterRows(raw, dataStart, mo)
  return enrichRows(rows, nvlHotList).map(buildGemBody)
}
