/**
 * Parse useful fields from a Vietnamese jewelry description string.
 *
 * Vendor Model extraction rule:
 *   The model code (mã mẫu) sits immediately adjacent to the weight token
 *   (e.g. "99.53GR" or "1.08GR").  It is the word directly BEFORE or
 *   directly AFTER that token, whichever looks like an alphanumeric code
 *   (contains both letters and digits).
 *
 *   Examples:
 *     "15KY: DAY CHU CONG 99.53GR CY40CA1, SIZE: 17M6"  → "CY40CA1" (after)
 *     "18KY: LAC BI KHAC KIEU XOAY BBY8 20.58GR, SIZE:18.5" → "BBY8"  (before)
 */

const EXCLUDED_TOKENS = new Set([
  'SIZE', 'GR', 'CM', 'MM', 'KG',
  'VVS', 'VS', 'SI', 'IF', 'FL',
  'CY', // lone prefix — not a full code
])

function isModelCode(raw: string): boolean {
  if (!raw) return false
  const t = raw.replace(/[,;:.]+$/, '').toUpperCase()  // strip trailing punctuation
  if (t.length < 2) return false
  if (EXCLUDED_TOKENS.has(t)) return false
  if (/^\d+K[YWRG]$/.test(t)) return false            // karat patterns: 18KY, 14KW …
  if (/^\d+\.?\d*$/.test(t)) return false              // pure number
  return /[A-Z]/.test(t) && /\d/.test(t)               // must have both letter + digit
}

export function extractVendorModel(description: string | null | undefined): string | null {
  if (!description?.trim()) return null
  const upper = description.toUpperCase()

  // Find weight token: digits + optional decimal + optional space + GR (word boundary)
  const weightMatch = upper.match(/(\d+\.?\d*)\s*GR\b/)
  if (!weightMatch || weightMatch.index == null) return null

  const weightEnd   = weightMatch.index + weightMatch[0].length
  const weightStart = weightMatch.index

  // ── Check token AFTER weight ──────────────────────────────────────────────
  // Also split on ':' so "SIZE:16" → "SIZE" (excluded), not "SIZE:16" (falsely passes isModelCode)
  const afterRaw   = upper.slice(weightEnd).replace(/^[\s,;]+/, '')
  const afterToken = afterRaw.split(/[\s,;:]+/)[0] ?? ''
  if (isModelCode(afterToken)) return afterToken.replace(/[,;:.]+$/, '')

  // ── Check token immediately BEFORE weight ────────────────────────────────
  const beforeTokens = upper.slice(0, weightStart).trimEnd().split(/\s+/)
  const lastBefore   = beforeTokens[beforeTokens.length - 1] ?? ''
  if (isModelCode(lastBefore)) return lastBefore.replace(/[,;:.]+$/, '')

  return null
}
