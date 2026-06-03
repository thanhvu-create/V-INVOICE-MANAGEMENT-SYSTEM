/**
 * Metal price fetching — Yahoo Finance primary, goldprice.org fallback
 * Port từ BOM-web/lib/gold-fetch.ts
 * Kitco không cho phép server-side scraping → dùng Yahoo Finance (GC=F, PL=F, SI=F, PA=F)
 */

export interface SpotPrices {
  spot_24k_oz: number   // Gold USD/oz
  spot_pt_oz:  number   // Platinum USD/oz
  spot_ag_oz:  number   // Silver USD/oz
  spot_pd_oz:  number   // Palladium USD/oz
  source:      string
}

async function fetchYahoo(symbol: string): Promise<number> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Yahoo ${symbol}: HTTP ${res.status}`)
  const d = await res.json()
  const price = d?.chart?.result?.[0]?.meta?.regularMarketPrice
  if (!price || price <= 0) throw new Error(`Yahoo ${symbol}: no price`)
  return Math.round(price * 100) / 100
}

export async function fetchMetalPrices(): Promise<SpotPrices> {
  const errors: string[] = []

  // Source 1: Yahoo Finance futures
  try {
    const [goldOz, agOz, ptOz, pdOz] = await Promise.all([
      fetchYahoo('GC=F'),   // Gold futures
      fetchYahoo('SI=F'),   // Silver futures
      fetchYahoo('PL=F'),   // Platinum futures
      fetchYahoo('PA=F'),   // Palladium futures
    ])
    if (goldOz > 1000) {
      return { spot_24k_oz: goldOz, spot_pt_oz: ptOz, spot_ag_oz: agOz, spot_pd_oz: pdOz, source: 'Yahoo Finance' }
    }
  } catch (e: any) { errors.push(`Yahoo: ${e.message}`) }

  // Source 2: goldprice.org
  try {
    const res = await fetch('https://data-asg.goldprice.org/dbXRates/USD', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const d = await res.json()
      const item = d?.items?.[0]
      if (item?.xauPrice > 0) {
        return {
          spot_24k_oz: Math.round(item.xauPrice * 100) / 100,
          spot_pt_oz:  Math.round((item.xptPrice || 0) * 100) / 100,
          spot_ag_oz:  Math.round((item.xagPrice || 0) * 100) / 100,
          spot_pd_oz:  0,
          source: 'goldprice.org',
        }
      }
    }
  } catch (e: any) { errors.push(`goldprice.org: ${e.message}`) }

  throw new Error(`All sources failed: ${errors.join(' | ')}`)
}

// ── Karat derived rate formula (từ Excel SUMMARY rows 1-13) ──────────
export const OZ_PER_GRAM = 31.103

export interface KaratPrices {
  '24K': number
  '23K': number
  '22K': number
  '18K': number
  '15K': number
  '14K': number
  '10K': number
  'PT':  number
  'AG':  number
  'PD':  number
}

export function computeKaratPrices(
  spot_24k_oz:   number,
  spot_pt_oz:    number,
  spot_ag_oz:    number,
  spot_pd_oz:    number,
  loss_gold_pct: number = 6,    // default 6%
  loss_pt_pct:   number = 17,   // default 17%
): KaratPrices {
  const oz    = OZ_PER_GRAM
  const lg    = 1 + loss_gold_pct / 100
  const lp    = 1 + loss_pt_pct   / 100
  const g     = spot_24k_oz

  const r = (v: number) => Math.round(v * 10000) / 10000  // 4 decimals

  return {
    '24K': r(g / oz),                         // no loss — pure reference
    '23K': r(g * (23/24) / oz),               // no loss
    '22K': r(g * (22/24) / oz),               // no loss
    '18K': r(g * (18/24) * lg / oz),          // with loss
    '15K': r(g * (15/24) * lg / oz),          // with loss
    '14K': r(g * (14/24) * lg / oz),          // with loss
    '10K': r(g * (10/24) * lg / oz),          // with loss
    'PT':  r(spot_pt_oz  * lp / oz),
    'AG':  r(spot_ag_oz  * lg * lp / oz),
    'PD':  r(spot_pd_oz  * lg * lp / oz),
  }
}

// Map metal_type → karat key (dùng trong pricing recalculate)
export function getKaratRate(metalType: string, kp: KaratPrices | null | undefined, fallback: Record<string, number | null>): number {
  if (kp) {
    const map: Record<string, keyof KaratPrices> = {
      '24K': '24K', '22K': '22K', '18KW': '18K', '18KY': '18K', '18K': '18K',
      '15K': '15K', '14KY': '14K', '14K': '14K', '10K': '10K',
      'PT950': 'PT', 'PT': 'PT', 'AG': 'AG', 'PD': 'PD',
    }
    const key = map[metalType]
    if (key && kp[key] != null) return kp[key]
  }
  // Fallback to old columns
  const oldMap: Record<string, number | null> = {
    '18KW': fallback.gold_18kw ?? null, '18KY': fallback.gold_18ky ?? null,
    '14KY': fallback.gold_14ky ?? null, 'PT950': fallback.platinum ?? null,
    'PT':   fallback.platinum  ?? null, '24K':   fallback.gold_24k  ?? null,
    'AG':   fallback.silver    ?? null, 'PD':    fallback.palladium ?? null,
  }
  return oldMap[metalType] ?? fallback.gold_24k ?? 0
}
