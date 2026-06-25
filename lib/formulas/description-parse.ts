/**
 * Parse useful fields from a Vietnamese jewelry description string.
 *
 * Vendor Model extraction rule:
 *   Find the GR weight token, then check the adjacent token (before/after).
 *   Priority: extract [A-Z]+\d{5} pattern (e.g. B12815, E11034).
 *   Fallback: old alphanumeric token check for other code formats.
 *
 * Kích thước extraction:
 *   Match "Size: <value>" pattern, e.g. "Size: 4.5VN", "Size: 8US", "Size: 17CM".
 */

const EXCLUDED_TOKENS = new Set([
  'SIZE', 'GR', 'CM', 'MM', 'KG',
  'VVS', 'VS', 'SI', 'IF', 'FL',
  'CY', // lone prefix — not a full code
])

function isModelCode(raw: string): boolean {
  if (!raw) return false
  const t = raw.replace(/[,;:.]+$/, '').toUpperCase()
  if (t.length < 2) return false
  if (EXCLUDED_TOKENS.has(t)) return false
  if (/^\d+K[YWRG]$/.test(t)) return false
  if (/^\d+\.?\d*$/.test(t)) return false
  return /[A-Z]/.test(t) && /\d/.test(t)
}

// Extract [A-Z]+\d{5} from a token (e.g. "B12815-6.7MM" → "B12815")
function extractFiveDigitCode(token: string): string | null {
  const m = token.match(/([A-Z]+\d{5})/)
  return m ? m[1] : null
}

export function extractVendorModel(description: string | null | undefined): string | null {
  if (!description?.trim()) return null
  const upper = description.toUpperCase()

  const weightMatch = upper.match(/(\d+\.?\d*)\s*GR\b/)
  if (!weightMatch || weightMatch.index == null) return null

  const weightEnd   = weightMatch.index + weightMatch[0].length
  const weightStart = weightMatch.index

  // ── Check token AFTER weight ──────────────────────────────────────────────
  const afterRaw   = upper.slice(weightEnd).replace(/^[\s,;]+/, '')
  const afterToken = afterRaw.split(/[\s,;:]+/)[0] ?? ''
  const afterCode  = extractFiveDigitCode(afterToken)
  if (afterCode) return afterCode
  if (isModelCode(afterToken)) return afterToken.replace(/[,;:.]+$/, '')

  // ── Check token immediately BEFORE weight ────────────────────────────────
  const beforeTokens = upper.slice(0, weightStart).trimEnd().split(/\s+/)
  const lastBefore   = beforeTokens[beforeTokens.length - 1] ?? ''
  const beforeCode   = extractFiveDigitCode(lastBefore)
  if (beforeCode) return beforeCode
  if (isModelCode(lastBefore)) return lastBefore.replace(/[,;:.]+$/, '')

  return null
}

// Extract size from description, e.g. "Size: 4.5VN" → "4.5VN", "Size: 8US" → "8US"
export function extractKichThuoc(description: string | null | undefined): string | null {
  if (!description?.trim()) return null
  const match = description.match(/size\s*[:\s]\s*(\d+(?:\.\d+)?\s*(?:VN|US|CM|IN|MM|M|in)?)/i)
  return match ? match[1].trim() : null
}
