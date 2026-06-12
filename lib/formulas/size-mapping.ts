// Size → NVL Hột range mapping
// Source: .claude/rules/JM-FORM-SUMMARY-logic-flow.md §9.4
//
// RD, RD-LG, PR  → use rawSize (mm)
// BG, MQ, PS, OV → use tbVien  (ct/viên, từ cột "TB viên" trong tracking file)

type RangeEntry = { min: number; max: number; label: string }

function lookup(value: number, table: RangeEntry[]): string | null {
  for (const { min, max, label } of table) {
    if (value >= min && value <= max) return label
  }
  return null
}

const RD_RANGES: RangeEntry[] = [
  { min: 0.7,  max: 2.0,  label: 'RD1 0.7 - 2.0'  },
  { min: 2.1,  max: 2.4,  label: 'RD2 2.1 - 2.4'  },
  { min: 2.5,  max: 2.6,  label: 'RD3 2.5 - 2.6'  },
  { min: 2.7,  max: 2.8,  label: 'RD4 2.7 - 2.8'  },
  { min: 2.9,  max: 3.2,  label: 'RD5 2.9 - 3.2'  },
  { min: 3.3,  max: 3.4,  label: 'RD6 3.3 - 3.4'  },
  { min: 3.5,  max: 3.6,  label: 'RD7 3.5 - 3.6'  },
  { min: 3.7,  max: 3.9,  label: 'RD8 3.7 - 3.9'  },
  { min: 4.0,  max: 4.4,  label: 'RD9 4.0 - 4.4'  },
  { min: 4.5,  max: 5.0,  label: 'RD9 4.5 - 5.0'  },
]

// NOTE: RDL8 (2.8-3.0) and RDL9 (2.9-3.4) overlap per spec.
// RDL8 is listed first → first-match wins for 2.9-3.0.
const RDL_RANGES: RangeEntry[] = [
  { min: 0.6,  max: 0.9,  label: 'RDL1: 0.6-0.9'  },
  { min: 1.0,  max: 1.1,  label: 'RDL2: 1.0-1.1'  },
  { min: 1.2,  max: 1.4,  label: 'RDL3: 1.2-1.4'  },
  { min: 1.5,  max: 1.6,  label: 'RDL4: 1.5-1.6'  },
  { min: 1.7,  max: 2.0,  label: 'RDL5: 1.7-2.0'  },
  { min: 2.1,  max: 2.3,  label: 'RDL6: 2.1-2.3'  },
  { min: 2.4,  max: 2.7,  label: 'RDL7: 2.4-2.7'  },
  { min: 2.8,  max: 3.0,  label: 'RDL8: 2.8-3.0'  },
  { min: 2.9,  max: 3.4,  label: 'RDL9: 2.9-3.4'  },
  { min: 3.5,  max: 3.6,  label: 'RDL10: 3.5-3.6' },
  { min: 3.7,  max: 4.0,  label: 'RDL11: 3.7-4.0' },
]

const PR_RANGES: RangeEntry[] = [
  { min: 1.0,  max: 1.8,  label: '1.0x1.0 - 1.8x 1.8'      },
  { min: 1.9,  max: 2.3,  label: '1.9x1.9 - 2.3x 2.3'      },
  { min: 2.4,  max: 2.8,  label: '2.4x 2.4 -2.8x 2.8'      },
  { min: 2.9,  max: 3.4,  label: '2.9x 2.9 - 3.4x 3.4'     },
  { min: 3.5,  max: 3.7,  label: '3.5x 3.5 - 3.7x 3.7'     },
]

const BG_RANGES: RangeEntry[] = [
  { min: 0.005, max: 0.025, label: 'BG 0.005 - 0.025' },
  { min: 0.03,  max: 0.05,  label: 'BG1 0.03 - 0.05'  },
  { min: 0.06,  max: 0.07,  label: 'BG2 0.06 - 0.07'  },
  { min: 0.08,  max: 0.09,  label: 'BG3 0.08 - 0.09'  },
  { min: 0.10,  max: 0.16,  label: 'BG4 0.10 - 0.16'  },
  { min: 0.17,  max: 0.20,  label: 'BG5 0.17 - 0.20'  },
  { min: 0.21,  max: 0.25,  label: 'BG6 0.21 - 0.25'  },
  { min: 0.26,  max: 0.28,  label: 'BG7 0.26 - 0.28'  },
  { min: 0.29,  max: 0.35,  label: 'BG8 0.29 - 0.35'  },
]

const MQ_RANGES: RangeEntry[] = [
  { min: 0.005, max: 0.10,  label: 'MQ1 0.005 - 0.10' },
  { min: 0.11,  max: 0.12,  label: 'MQ2 0.11 - 0.12'  },
  { min: 0.13,  max: 0.17,  label: 'MQ3 0.13 - 0.17'  },
  { min: 0.18,  max: 0.24,  label: 'MQ4 0.18 - 0.24'  },
  { min: 0.25,  max: 0.29,  label: 'MQ5 0.25 - 0.29'  },
  { min: 0.30,  max: 0.36,  label: 'MQ6 0.30 - 0.36'  },
  { min: 0.37,  max: 0.39,  label: 'MQ7 0.37 - 0.39'  },
]

const PS_RANGES: RangeEntry[] = [
  { min: 0.005, max: 0.12,  label: 'PS1 0.005 - 0.12' },
  { min: 0.12,  max: 0.17,  label: 'PS2 0.12 - 0.17'  },
  { min: 0.18,  max: 0.25,  label: 'PS3 0.18 - 0.25'  },
  { min: 0.26,  max: 0.29,  label: 'PS4 0.26 - 0.29'  },
  { min: 0.30,  max: 0.34,  label: 'PS5 0.30 - 0.34'  },
  { min: 0.35,  max: 0.38,  label: 'PS6 0.35 - 0.38'  },
  { min: 0.39,  max: 0.40,  label: 'PS7 0.39 - 0.40'  },
  { min: 0.41,  max: 0.45,  label: 'PS8 0.41 - 0.45'  },
]

const OV_RANGES: RangeEntry[] = [
  { min: 0.005, max: 0.095, label: 'OV1 0.005 - 0.095' },
  { min: 0.10,  max: 0.14,  label: 'OV2 0.10 - 0.14'   },
  { min: 0.15,  max: 0.25,  label: 'OV3 0.15 - 0.25'   },
  { min: 0.30,  max: 0.35,  label: 'OV4 0.30 - 0.35'   },
  { min: 0.40,  max: 0.45,  label: 'OV5 0.40 - 0.45'   },
  { min: 0.50,  max: 0.55,  label: 'OV6 0.50 - 0.55'   },
]

/**
 * Map gem tracking data → NVL Hột size_range key (for catalog price lookup).
 *
 * @param maXoan   Mã xoàn — e.g. "RD-11119-2.1", "BG-L14", "PR-L13"
 * @param rawSize  Col H from tracking: "2.1" (mm, for RD/RD-LG/PR) or "2.3*2.3" (PR)
 * @param tbVien   Col L from tracking: TB viên ct/viên (for BG/MQ/PS/OV)
 *                 For manual entry in GemModal, pass parseFloat(rawSize).
 * @returns        nvl_hot.size_range string, or null when no match / unknown type
 */
export function mapSizeToRange(maXoan: string, rawSize: string, tbVien: number): string | null {
  if (!maXoan) return null
  const u = maXoan.toUpperCase()

  // L-XX prefix (lab-grown variant of any type)
  // L-RD → RDL table (distinct lab-grown pricing)
  // L-PR / L-BG / L-OV / etc → same table as natural type (strip prefix and recurse)
  if (u.startsWith('L-') && maXoan.length > 2) {
    if (u.startsWith('L-RD')) {
      const mm = parseFloat(rawSize)
      return isNaN(mm) ? null : lookup(mm, RDL_RANGES)
    }
    return mapSizeToRange(maXoan.slice(2), rawSize, tbVien)
  }

  // RD-LG / RDL — explicit lab-grown RD prefix variants
  if (u.startsWith('RD-LG') || u.startsWith('RDL')) {
    const mm = parseFloat(rawSize)
    return isNaN(mm) ? null : lookup(mm, RDL_RANGES)
  }

  // RD and RDCZ (cubic zirconia) share the same size table
  if (u.startsWith('RD')) {
    const mm = parseFloat(rawSize)
    return isNaN(mm) ? null : lookup(mm, RD_RANGES)
  }

  if (u.startsWith('PR')) {
    // rawSize may be "2.3" or "2.3*2.3" — take the first numeric token
    const mm = parseFloat(rawSize.split(/[*xX×]/)[0])
    return isNaN(mm) ? null : lookup(mm, PR_RANGES)
  }

  // ct-based types: use tbVien
  if (tbVien <= 0) return null
  if (u.startsWith('BG')) return lookup(tbVien, BG_RANGES)
  if (u.startsWith('MQ')) return lookup(tbVien, MQ_RANGES)
  if (u.startsWith('PS')) return lookup(tbVien, PS_RANGES)
  if (u.startsWith('OV')) return lookup(tbVien, OV_RANGES)

  return null
}
