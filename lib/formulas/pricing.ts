import type { MetalRate, PricingRule, InvoiceItem, ItemGemDetail } from '@/types'

const RATE_MAP_KEYS: Record<string, keyof MetalRate> = {
  '18KW':  'gold_18kw',
  '18KY':  'gold_18ky',
  '14KY':  'gold_14ky',
  'PT950': 'platinum',
  'PT':    'platinum',
  '24K':   'gold_24k',
  'AG':    'silver',
  'PD':    'palladium',
}

export function calcGoldValue(
  weightGoldGr: number,
  metalType:    string,
  rate:         MetalRate,
  castingLossPct: number
): number {
  const rateKey = RATE_MAP_KEYS[metalType]
  const rateVal = rateKey ? (rate[rateKey] as number | null) ?? (rate.gold_24k ?? 0) : (rate.gold_24k ?? 0)
  return weightGoldGr * rateVal * (1 + castingLossPct / 100)
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
