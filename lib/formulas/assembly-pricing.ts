// Assembly fabrication prices — "SP có xoàn" table (default for CH1/CH2)
// Source: GIÁ CÔNG TRONG INVOICE.xlsx → "Assembly Price(SP có xoàn)"
// DB table: assembly_pricing_rules (managed via Admin → Assembly Price)

export interface AssemblyPrices {
  gia_cong:     number  // AS — Assembly
  duc:          number  // CA — Casting
  thiet_ke:     number  // 3D — Design
  resin:        number  // MO — Modeling/Resin
  phi_phu_kien: number  // AC — Accessories
}

export interface AssemblyPricingRule extends AssemblyPrices {
  id?:       string
  sub_class: string
  phi_phu_kien: number
}

// Hardcoded fallback (used when DB rules not yet loaded)
const FALLBACK: Record<string, AssemblyPrices> = {
  RI:   { gia_cong: 67,  duc: 25, thiet_ke: 29, resin: 29,  phi_phu_kien: 30 },
  PD:   { gia_cong: 67,  duc: 25, thiet_ke: 29, resin: 29,  phi_phu_kien: 30 },
  ER:   { gia_cong: 76,  duc: 33, thiet_ke: 36, resin: 36,  phi_phu_kien: 30 },
  BL:   { gia_cong: 95,  duc: 58, thiet_ke: 57, resin: 43,  phi_phu_kien: 30 },
  BG:   { gia_cong: 95,  duc: 58, thiet_ke: 57, resin: 43,  phi_phu_kien: 30 },
  CH:   { gia_cong: 95,  duc: 58, thiet_ke: 57, resin: 43,  phi_phu_kien: 30 },
  NL:   { gia_cong: 100, duc: 83, thiet_ke: 71, resin: 100, phi_phu_kien: 30 },
  ACC:  { gia_cong: 10,  duc: 5,  thiet_ke: 0,  resin: 5,   phi_phu_kien: 10 },
  SPPT: { gia_cong: 286, duc: 95, thiet_ke: 85, resin: 171, phi_phu_kien: 30 },
}

// Lookup from DB rules array (preferred) with fallback to hardcoded
export function getAssemblyPrices(
  subClass:     string | null | undefined,
  dbRules?:     AssemblyPricingRule[],
): AssemblyPrices | null {
  if (!subClass?.trim()) return null
  const key = subClass.trim().toUpperCase()
  if (dbRules?.length) {
    const rule = dbRules.find(r => r.sub_class.toUpperCase() === key)
    return rule ? { gia_cong: rule.gia_cong, duc: rule.duc, thiet_ke: rule.thiet_ke, resin: rule.resin, phi_phu_kien: rule.phi_phu_kien ?? 30 } : null
  }
  return FALLBACK[key] ?? null
}

// Phụ kiện price depends on metal type, not sub_class
// Source: AC-14K.18K=$30, AC-PT950=$50, AC-SV925=$10
export function getPhiPhuKien(loaiVang: string | null | undefined): number {
  if (!loaiVang?.trim()) return 0
  const v = loaiVang.trim().toUpperCase()
  if (v.startsWith('PT')) return 50
  if (v.includes('AG') || v.includes('SV') || v.includes('925')) return 10
  return 30  // 14K, 18K, 24K, 22K, 10K
}
