import type { MetalRate, PricingRule, InvoiceItem, ItemGemDetail } from '@/types'

// Rates stored in daily_metal_rates are DERIVED rates (already include casting loss %).
// Formula from actual Excel: rate_18K = spot_oz × (18/24) × (1 + loss%) / 31.103
// Do NOT multiply by casting_loss_pct again — it is already baked into the stored rate.
//
// Metal type key lookup — LEFT(metalType, 2) logic mirrors the Excel formula:
//   "24" → gold_24k, "22" → gold_18kw (closest), "18" → gold_18kw or gold_18ky
//   "14" → gold_14ky, "10" → gold_14ky (closest), "PT" → platinum, "AG" → silver, "PD" → palladium
const RATE_MAP_KEYS: Record<string, keyof MetalRate> = {
  // Exact matches:
  '18KW':  'gold_18kw',
  '18KY':  'gold_18ky',
  '18K':   'gold_18kw',   // generic 18K → default white
  '14KY':  'gold_14ky',
  '14K':   'gold_14ky',
  '22K':   'gold_18kw',   // no 22K col — use 18kw as closest available
  '24K':   'gold_24k',
  'PT950': 'platinum',
  'PT':    'platinum',
  'AG':    'silver',
  'PD':    'palladium',
}

export function calcGoldValue(
  weightGoldGr: number,
  metalType:    string,
  rate:         MetalRate,
  _castingLossPct: number  // kept for API compat — NOT used (already in stored rate)
): number {
  const key     = RATE_MAP_KEYS[metalType] ?? RATE_MAP_KEYS[metalType?.slice(0, 2)] ?? null
  const rateVal = key ? ((rate[key] as number | null) ?? rate.gold_24k ?? 0) : (rate.gold_24k ?? 0)
  // No (1 + castingLoss) multiplication — derived rate already includes casting loss
  return weightGoldGr * rateVal
}

export function calcHPUSA(item: Partial<InvoiceItem>, gems: ItemGemDetail[]): number {
  const goldValue   = item.gold_value_usd ?? 0
  const totalGemVal = gems.reduce((s, g) => s + (g.total_price ?? 0), 0)
  const totalGemFee = gems.reduce((s, g) => s + (g.total_setting_fee ?? 0), 0)
  return (
    goldValue + totalGemVal + totalGemFee
    + (item.labor_fee   ?? 0)
    + (item.casting_fee ?? 0)
    + (item.design_fee  ?? 0)
    + (item.resin_fee   ?? 0)
    + (item.misc_fee    ?? 0)
  )
}

export function calcPrices(hpusa: number, rule: PricingRule) {
  const cif = hpusa * rule.cif_multiplier
  return {
    hpusa,
    cif_price: cif,
    tag_price: cif * rule.tag_multiplier,
    fr_price:  cif * rule.fr_multiplier,
  }
}

export function calcWeightNoGem(totalGr: number, gems: ItemGemDetail[]): number {
  const gemGr = gems.reduce((s, g) => s + (g.weight_gr ?? 0), 0)
  return Math.max(0, totalGr - gemGr)
}

// Full recalculate for one item — returns fields to UPDATE
export function recalcItem(
  item:  Partial<InvoiceItem>,
  gems:  ItemGemDetail[],
  rate:  MetalRate,
  rule:  PricingRule
): Partial<InvoiceItem> {
  const goldValue     = calcGoldValue(item.weight_gold_actual_gr ?? 0, item.metal_type ?? '', rate, rule.casting_loss_pct)
  const withGold      = { ...item, gold_value_usd: goldValue }
  const hpusa         = calcHPUSA(withGold, gems)
  const prices        = calcPrices(hpusa, rule)
  const weightNoGem   = calcWeightNoGem(item.weight_total_gr ?? 0, gems)

  return {
    weight_no_gem_gr: weightNoGem,
    gold_value_usd:   goldValue,
    hpusa:            prices.hpusa,
    cif_price:        prices.cif_price,
    tag_price:        prices.tag_price,
    fr_price:         prices.fr_price,
  }
}
