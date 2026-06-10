// ──────────────────────────────────────────────────────────────────────────────
// V-Invoice pricing formulas — ported from JM-FORM / SUMMARY Excel logic
// See: .claude/rules/v-invoice.md for full specification
// ──────────────────────────────────────────────────────────────────────────────

import type { InvoiceProduct, InvoiceDiamond } from '@/types'

const OUNCE_PER_GRAM = 31.103

export type InvoiceTemplate = 'CH1' | 'CH2' | 'ADM' | 'CH1_AG3' | 'VNSI_AG3' | 'MANUAL'

/**
 * NVL snapshot — raw spot prices snapshotted into invoice at creation time.
 * Maps to invoices columns: nvl_gold_24k, nvl_pt_price, nvl_ag_price, nvl_pd_price, nvl_loss_gold, nvl_loss_pt
 */
export interface NVLSnapshot {
  spot_gold_24k: number  // $/oz raw 24K spot price
  spot_pt:       number  // $/oz Platinum
  spot_ag:       number  // $/oz Silver
  spot_pd:       number  // $/oz Palladium
  loss_gold:     number  // fraction e.g. 0.06  (6% casting loss for gold)
  loss_pt:       number  // fraction e.g. 0.17  (17% casting loss for PT/PD)
}

/**
 * Returns gold price per gram for a given loai_vang string.
 * Uses raw 24K spot ($/oz) + loss% per karat — matches SUMMARY formula exactly.
 * Returns null if the material code is unknown (caller should show manual-entry field).
 */
export function goldPricePerGram(loai_vang: string, nvl: NVLSnapshot): number | null {
  const { spot_gold_24k, spot_pt, spot_ag, spot_pd, loss_gold, loss_pt } = nvl
  const k = loai_vang.substring(0, 2).toUpperCase()
  switch (k) {
    case '24': return spot_gold_24k / OUNCE_PER_GRAM
    case '23': return spot_gold_24k * (23 / 24) / OUNCE_PER_GRAM
    case '22': return spot_gold_24k * (22 / 24) / OUNCE_PER_GRAM
    case '18': return spot_gold_24k * (1 + loss_gold) * (18 / 24) / OUNCE_PER_GRAM
    case '17': return spot_gold_24k * (1 + loss_gold) * (17 / 24) / OUNCE_PER_GRAM
    case '16': return spot_gold_24k * (1 + loss_gold) * (16 / 24) / OUNCE_PER_GRAM
    case '15': return spot_gold_24k * (1 + loss_gold) * (15 / 24) / OUNCE_PER_GRAM
    case '14': return spot_gold_24k * (1 + loss_gold) * (14 / 24) / OUNCE_PER_GRAM
    case '10': return spot_gold_24k * (1 + loss_gold) * (10 / 24) / OUNCE_PER_GRAM
    case 'PT': return spot_pt * (1 + loss_pt) / OUNCE_PER_GRAM
    case 'AG': return spot_ag * (1 + loss_gold) / OUNCE_PER_GRAM
    case 'PD': return spot_pd * (1 + loss_pt) / OUNCE_PER_GRAM
    default:   return null
  }
}

/**
 * T.Phẩm vàng thực tế = T.Phẩm có NVL đá − Σ TL xoàn (gr)
 * tl_xoan_gr = tl_truoc_xu_ly_ct / 5 (written by recalcDiamond)
 */
export function calcWeightNoGem(totalGr: number, diamonds: InvoiceDiamond[]): number {
  const gemGr = diamonds.reduce((s, g) => s + (g.tl_xoan_gr ?? 0), 0)
  return Math.max(0, totalGr - gemGr)
}

/**
 * Computed fields for a single diamond row.
 * Call this BEFORE recalcItem so that tl_xoan_gr / t_gia_xoan / t_phi are up to date.
 */
export function recalcDiamond(d: Partial<InvoiceDiamond>): Partial<InvoiceDiamond> {
  const tl_truoc  = d.tl_truoc_xu_ly_ct ?? 0
  const don_gia   = d.don_gia           ?? 0
  const sl_hot    = d.sl_hot            ?? 0
  return {
    tl_xoan_gr:  tl_truoc / 5,
    t_gia_xoan:  tl_truoc * don_gia,
    don_gia_phi: 1,
    t_phi:       sl_hot * 1,
  }
}

/**
 * Vốn sản xuất — template-aware per JM-FORM SUMMARY
 *
 * CH1, CH2:  Σt_gia_xoan + Σt_phi + tien_vang + gia_cong + duc + thiet_ke + resin + phi_phu_kien
 * ADM:       Σt_gia_xoan + Σt_phi + tien_vang  (no individual fabrication fees)
 * CH1_AG3, VNSI_AG3: tien_vang only (no diamonds, no fees)
 */
export function calcVonSanXuat(
  item:     Partial<InvoiceProduct>,
  diamonds: InvoiceDiamond[],
  template: InvoiceTemplate
): number {
  const tienVang   = item.tien_vang ?? 0
  const sumGiaXoan = diamonds.reduce((s, g) => s + (g.t_gia_xoan ?? 0), 0)
  const sumPhi     = diamonds.reduce((s, g) => s + (g.t_phi      ?? 0), 0)

  if (template === 'CH1' || template === 'CH2') {
    return (
      sumGiaXoan + sumPhi + tienVang
      + (item.gia_cong     ?? 0)
      + (item.duc          ?? 0)
      + (item.thiet_ke     ?? 0)
      + (item.resin        ?? 0)
      + (item.phi_phu_kien ?? 0)
    )
  }
  if (template === 'ADM') {
    return sumGiaXoan + sumPhi + tienVang
  }
  // CH1_AG3, VNSI_AG3, MANUAL
  return tienVang
}

/**
 * CIF price — template-aware
 * CH1 / ADM / CH1_AG3: purchase × 1.05
 * CH2:                 null  (no CIF column in CH2 template)
 * VNSI_AG3:            purchase × 1.10
 */
export function calcCIFPrice(purchase: number, template: InvoiceTemplate): number | null {
  if (template === 'CH1' || template === 'ADM' || template === 'CH1_AG3') {
    return purchase * 1.05
  }
  if (template === 'VNSI_AG3') {
    return purchase * 1.10
  }
  return null  // CH2, MANUAL
}

/**
 * Full recalculate for one invoice product — returns only the derived fields to UPDATE.
 * Diamonds must already have tl_xoan_gr/t_gia_xoan/t_phi set (call recalcDiamond first).
 */
export function recalcItem(
  item:     Partial<InvoiceProduct>,
  diamonds: InvoiceDiamond[],
  nvl:      NVLSnapshot,
  template: InvoiceTemplate = 'CH1'
): Partial<InvoiceProduct> {
  const weightNoGem = calcWeightNoGem(item.t_pham_co_nvl_da ?? 0, diamonds)

  const gpg       = goldPricePerGram(item.loai_vang ?? '', nvl)
  const goldValue = gpg !== null ? weightNoGem * gpg : 0

  const withGold = { ...item, tien_vang: goldValue }
  const vonSX    = calcVonSanXuat(withGold, diamonds, template)
  const cif      = calcCIFPrice(vonSX, template)

  return {
    t_pham_tru_nvl_da:   weightNoGem,
    t_pham_vang_thuc_te: weightNoGem,
    tien_vang:           goldValue,
    von_san_xuat:        vonSX,
    purchase_price:      vonSX,
    cif_price:           cif,
  }
}

/**
 * Build NVLSnapshot from invoices DB row.
 * Falls back to conservative defaults when columns are null.
 */
export function nvlFromInvoice(invoice: Record<string, any>): NVLSnapshot {
  return {
    spot_gold_24k: invoice.nvl_gold_24k  ?? 3300,
    spot_pt:       invoice.nvl_pt_price  ?? 1050,
    spot_ag:       invoice.nvl_ag_price  ?? 33,
    spot_pd:       invoice.nvl_pd_price  ?? 950,
    loss_gold:     invoice.nvl_loss_gold ?? 0.06,
    loss_pt:       invoice.nvl_loss_pt   ?? 0.17,
  }
}
