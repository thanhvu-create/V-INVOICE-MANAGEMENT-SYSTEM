import { describe, it, expect } from 'vitest'
import { resolveMetalPricePerGram, goldPricePerGram, type NVLSnapshot, type MetalTypeRule } from './pricing'

const nvl: NVLSnapshot = {
  spot_gold_24k: 3000, spot_pt: 1000, spot_ag: 30, spot_pd: 900,
  loss_gold: 0.06, loss_pt: 0.17,
  tag_multiplier: 0, fr_multiplier: 0, cif_rate: null,
}

describe('resolveMetalPricePerGram', () => {
  it('fixed mode returns fixed_per_gram directly', () => {
    const reg: MetalTypeRule[] = [{ code: 'SV925', price_mode: 'fixed', fixed_per_gram: 3.2 }]
    expect(resolveMetalPricePerGram('SV925', nvl, reg)).toBe(3.2)
  })

  it('matches code case-insensitively and trimmed', () => {
    const reg: MetalTypeRule[] = [{ code: 'SV925', price_mode: 'fixed', fixed_per_gram: 3.2 }]
    expect(resolveMetalPricePerGram('  sv925 ', nvl, reg)).toBe(3.2)
  })

  it('dynamic karat + surcharge = karat base + surcharge', () => {
    const reg: MetalTypeRule[] = [{ code: '18KW', price_mode: 'dynamic', base_kind: 'karat', karat: 18, surcharge_per_gram: 1.5 }]
    const base = goldPricePerGram('18K', nvl)!
    expect(resolveMetalPricePerGram('18KW', nvl, reg)).toBeCloseTo(base + 1.5, 6)
  })

  it('dynamic ag with 0 surcharge equals AG formula', () => {
    const reg: MetalTypeRule[] = [{ code: 'SV999', price_mode: 'dynamic', base_kind: 'ag', surcharge_per_gram: 0 }]
    expect(resolveMetalPricePerGram('SV999', nvl, reg)).toBeCloseTo(goldPricePerGram('AG', nvl)!, 6)
  })

  it('falls back to goldPricePerGram when no registry match', () => {
    expect(resolveMetalPricePerGram('18K', nvl, [])).toBe(goldPricePerGram('18K', nvl))
  })

  it('unknown code with no override stays null (SV925 without registry)', () => {
    expect(resolveMetalPricePerGram('SV925', nvl, [])).toBeNull()
  })

  it('inactive rule is ignored (fallback used)', () => {
    const reg: MetalTypeRule[] = [{ code: 'SV925', price_mode: 'fixed', fixed_per_gram: 3.2, active: false }]
    expect(resolveMetalPricePerGram('SV925', nvl, reg)).toBeNull()
  })

  it('fixed mode with null price returns null, not 0', () => {
    const reg: MetalTypeRule[] = [{ code: 'X', price_mode: 'fixed', fixed_per_gram: null }]
    expect(resolveMetalPricePerGram('X', nvl, reg)).toBeNull()
  })
})
