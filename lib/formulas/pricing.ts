import type { MetalRate, PricingRule, InvoiceItem, ItemGemDetail } from '@/types'
import { getKaratRate } from '@/lib/gold-fetch'

// Rates stored in daily_metal_rates are DERIVED rates (already include casting loss %).
// New rows also store karat_prices JSONB (preferred) for all karats: 24K, 23K, 22K, 18K, 15K, 14K, 10K, PT, AG, PD
// Old rows fallback to individual columns: gold_24k, gold_18kw, gold_18ky, gold_14ky, platinum, silver, palladium

// Old column fallback map (for rows without karat_prices JSONB)
const OLD_RATE_MAP: Record<string, keyof MetalRate> = {
  '18KW': 'gold_18kw', '18KY': 'gold_18ky', '18K': 'gold_18kw',
  '14KY': 'gold_14ky', '14K':  'gold_14ky', '22K': 'gold_18kw',
  '24K':  'gold_24k',  'PT950':'platinum',   'PT':  'platinum',
  'AG':   'silver',    'PD':   'palladium',
}

export function calcGoldValue(
  weightGoldGr: number,
  metalType:    string,
  rate:         MetalRate,
  _castingLossPct: number  // kept for API compat — NOT used (already in stored derived rate)
): number {
  // Prefer karat_prices JSONB (new rows), fallback to old individual columns
  const kp = (rate as any).karat_prices ?? null
  const fallback: Record<string, number | null> = {
    gold_24k: rate.gold_24k ?? null, gold_18kw: rate.gold_18kw ?? null,
    gold_18ky: rate.gold_18ky ?? null, gold_14ky: rate.gold_14ky ?? null,
    platinum: rate.platinum ?? null, silver: rate.silver ?? null, palladium: rate.palladium ?? null,
  }
  const rateVal = kp
    ? getKaratRate(metalType, kp, fallback)
    : (fallback[OLD_RATE_MAP[metalType] ?? ''] ?? rate.gold_24k ?? 0)
  return weightGoldGr * (rateVal ?? 0)
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

export interface MarkupTier {
  value_from: number | string
  value_to:   number | string
  markups:    Record<string, number>
}

/**
 * Lookup sell_price từ mk_store_markup tier table.
 * cifPrice → tìm tier → lấy markup của priceListType → sell = cif × markup
 */
export function calcSellPrice(
  cifPrice:      number,
  priceListType: string,
  tiers:         MarkupTier[]
): number | null {
  if (!cifPrice || !priceListType || !tiers?.length) return null
  const tier = tiers.find(t =>
    cifPrice >= Number(t.value_from) && cifPrice <= Number(t.value_to)
  )
  if (!tier) return null
  const markup = tier.markups[priceListType]
  if (markup == null) return null
  return Math.round(cifPrice * markup * 100) / 100
}

export function calcWeightNoGem(totalGr: number, gems: ItemGemDetail[]): number {
  const gemGr = gems.reduce((s, g) => s + (g.weight_gr ?? 0), 0)
  return Math.max(0, totalGr - gemGr)
}

// Full recalculate for one item — returns fields to UPDATE
export function recalcItem(
  item:         Partial<InvoiceItem>,
  gems:         ItemGemDetail[],
  rate:         MetalRate,
  rule:         PricingRule,
  markupTiers?: MarkupTier[]
): Partial<InvoiceItem> {
  const goldValue   = calcGoldValue(item.weight_gold_actual_gr ?? 0, item.metal_type ?? '', rate, rule.casting_loss_pct)
  const withGold    = { ...item, gold_value_usd: goldValue }
  const hpusa       = calcHPUSA(withGold, gems)
  const prices      = calcPrices(hpusa, rule)
  const weightNoGem = calcWeightNoGem(item.weight_total_gr ?? 0, gems)

  const result: Partial<InvoiceItem> = {
    weight_no_gem_gr: weightNoGem,
    gold_value_usd:   goldValue,
    hpusa:            prices.hpusa,
    cif_price:        prices.cif_price,
    tag_price:        prices.tag_price,
    fr_price:         prices.fr_price,
  }

  // Auto-compute sell_price if price_list_type is set and tiers are provided
  const plt = (item as any).price_list_type as string | undefined
  if (plt && markupTiers?.length) {
    const sell = calcSellPrice(prices.cif_price, plt, markupTiers)
    if (sell !== null) result.sell_price = sell
  }

  return result
}
