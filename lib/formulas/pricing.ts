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
  spot_gold_24k:  number        // $/oz raw 24K spot price
  spot_pt:        number        // $/oz Platinum
  spot_ag:        number        // $/oz Silver
  spot_pd:        number        // $/oz Palladium
  loss_gold:      number        // fraction e.g. 0.06  (6% casting loss for gold)
  loss_pt:        number        // fraction e.g. 0.17  (17% casting loss for PT/PD)
  tag_multiplier: number        // tag_price = cif_price × tag_multiplier (AG3)
  fr_multiplier:  number        // fb_price  = cif_price × fr_multiplier  (AG3)
  cif_rate:       number | null // per-invoice CIF override; null = use template default
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
    case 'AG': return spot_ag * (1 + loss_gold) * (1 + loss_pt) / OUNCE_PER_GRAM  // AG = cả 2 loss (×1.06 × 1.17)
    case 'PD': return spot_pd * (1 + loss_pt) / OUNCE_PER_GRAM
    default: {
      // Handle any numeric karat e.g. "8K", "9KY", "12K", "8" → karat/24 with loss
      const num = parseInt(k)
      if (!isNaN(num) && num > 0 && num <= 24) {
        if (num >= 23) return spot_gold_24k * (num / 24) / OUNCE_PER_GRAM
        return spot_gold_24k * (1 + loss_gold) * (num / 24) / OUNCE_PER_GRAM
      }
      return null
    }
  }
}

/**
 * T.Phẩm vàng thực tế = T.Phẩm có NVL đá − Σ TL xoàn (gr)
 * tl_xoan_gr = (tl_sau_xu_ly_ct ?? tl_truoc_xu_ly_ct) / 5 (written by recalcDiamond)
 */
export function calcWeightNoGem(totalGr: number, diamonds: InvoiceDiamond[]): number {
  const gemGr = diamonds.reduce((s, g) => s + (g.tl_xoan_gr ?? 0), 0)
  return Math.max(0, totalGr - gemGr)
}

/**
 * Computed fields for a single diamond row.
 * Call this BEFORE recalcItem so that tl_xoan_gr / t_gia_xoan / t_phi are up to date.
 */
// ADM has no setting fee per pcs (U col = empty in Excel) → don_gia_phi = 0, t_phi = 0
export function recalcDiamond(
  d: Partial<InvoiceDiamond>,
  template: InvoiceTemplate = 'CH1',
): Partial<InvoiceDiamond> {
  // TL Sau (after processing) overrides TL Trước when entered; otherwise use TL Trước.
  const tl_base   = d.tl_sau_xu_ly_ct ?? d.tl_truoc_xu_ly_ct ?? 0
  const don_gia   = d.don_gia ?? 0
  const sl_hot    = d.sl_hot  ?? 0
  const feePerPcs = template === 'ADM' ? 0 : 1
  return {
    tl_xoan_gr:  tl_base / 5,
    t_gia_xoan:  tl_base * don_gia,
    don_gia_phi: feePerPcs,
    t_phi:       sl_hot * feePerPcs,
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
 * CIF price — template-aware (JM Form §8.4)
 * CH1 / ADM / CH1_AG3: purchase × 1.05  (5% — JM FORM col M = L × 1.05)
 * VNSI_AG3:            purchase × 1.10  (10% — SUMMARY!G7 = 0.10)
 * CH2:                 null  (no CIF column in CH2 template)
 *
 * NOTE: ADM has an *internal* SUMMARY CIF of 10% (SUMMARY!X = W × 1.10) but the
 * JM FORM export col M uses L × 1.05. We store the JM FORM value (5%).
 */
export function calcCIFPrice(purchase: number, template: InvoiceTemplate, cifRateOverride?: number | null): number | null {
  if (template === 'CH2' || template === 'MANUAL') return null
  const defaultRate = template === 'VNSI_AG3' ? 0.10 : 0.05
  const rate = (cifRateOverride != null) ? cifRateOverride : defaultRate
  return purchase * (1 + rate)
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

  const isAG3    = template === 'CH1_AG3' || template === 'VNSI_AG3'
  const zeroFees = isAG3 || diamonds.length === 0

  // Zero fees BEFORE Von SX so the formula is consistent: fees only count when gems are present
  const itemForCalc: Partial<InvoiceProduct> = zeroFees
    ? { ...item, gia_cong: 0, duc: 0, thiet_ke: 0, resin: 0, phi_phu_kien: 0 }
    : item

  const withGold = { ...itemForCalc, tien_vang: goldValue }
  const vonSX    = calcVonSanXuat(withGold, diamonds, template)
  const cif      = calcCIFPrice(vonSX, template, nvl.cif_rate)

  const tag = isAG3
    ? (cif != null && nvl.tag_multiplier > 0 ? cif * nvl.tag_multiplier : null)
    : (item.tag_price ?? null)
  const fb = isAG3
    ? (cif != null && nvl.fr_multiplier > 0 ? cif * nvl.fr_multiplier : null)
    : (item.fb_price ?? null)

  return {
    t_pham_tru_nvl_da:   weightNoGem,
    t_pham_vang_thuc_te: weightNoGem,
    tien_vang:           goldValue,
    von_san_xuat:        vonSX,
    purchase_price:      vonSX,
    cif_price:           cif,
    tag_price:           tag,
    fb_price:            fb,
    ...(zeroFees ? { gia_cong: 0, duc: 0, thiet_ke: 0, resin: 0, phi_phu_kien: 0 } : {}),
  }
}

/**
 * Build NVLSnapshot from invoices DB row.
 * Falls back to conservative defaults when columns are null.
 */
export function nvlFromInvoice(invoice: Record<string, any>): NVLSnapshot {
  return {
    spot_gold_24k:  invoice.nvl_gold_24k        ?? 3300,
    spot_pt:        invoice.nvl_pt_price         ?? 1050,
    spot_ag:        invoice.nvl_ag_price         ?? 33,
    spot_pd:        invoice.nvl_pd_price         ?? 950,
    loss_gold:      invoice.nvl_loss_gold        ?? 0.06,
    loss_pt:        invoice.nvl_loss_pt          ?? 0.17,
    tag_multiplier: invoice.nvl_tag_multiplier   ?? 0,
    fr_multiplier:  invoice.nvl_fr_multiplier    ?? 0,
    cif_rate:       invoice.nvl_cif_rate         ?? null,
  }
}
