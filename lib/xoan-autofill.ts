// Client helper shared by SPHT import (auto-attach after import) and the invoice
// "Tra lại tất cả hột" button. Fetches the gem tracking sheet + pinned tab + NVL Hot
// catalog once, matches each item by MO, and attaches gems via the existing gem endpoint.

import * as XLSX from 'xlsx'
import {
  readSheetRows, findDataStart, filterRows, enrichRows,
  buildGemBody, resolveDefaultSheet, extractMO,
  type NVLHotRow,
} from '@/lib/formulas/xoan-lookup'

const URL_KEY = 'xoan_sheet_url'
const TAB_KEY = 'xoan_sheet_tab'

// Only these templates have a gem section (matches XoanUrlConfig.hasGems).
const GEM_TEMPLATES = new Set(['CH1', 'CH2', 'ADM'])

export interface AutoFillItem { id: string; so_mo: string | null }

export interface AutoFillResult {
  configured:   boolean   // false when no gem-sheet URL is set → nothing ran
  itemsTotal:   number
  itemsMatched: number    // items that got at least one gem
  gemsAdded:    number    // total gem rows inserted
  itemsNoMo:    number    // items whose SO-MO had no MO
  itemsNoMatch: number    // items with an MO but no matching tracking rows
  error?:       string
}

const empty = (over: Partial<AutoFillResult>): AutoFillResult => ({
  configured: true, itemsTotal: 0, itemsMatched: 0, gemsAdded: 0, itemsNoMo: 0, itemsNoMatch: 0, ...over,
})

async function getSetting(key: string): Promise<string | null> {
  try {
    const j = await fetch(`/api/settings?key=${key}`).then(r => r.json())
    return j.success ? (j.value ?? null) : null
  } catch { return null }
}

/**
 * Auto-attach gems to the given items by MO lookup. Skipping items that already have gems
 * is the caller's job (pass only items that need gems). Non-gem templates are a no-op.
 */
export async function autoFillGems(params: {
  invoiceId: string
  items:     AutoFillItem[]
  template:  string
}): Promise<AutoFillResult> {
  const { invoiceId, items, template } = params

  if (!GEM_TEMPLATES.has(template) || items.length === 0) {
    return empty({ itemsTotal: items.length })
  }

  const url = await getSetting(URL_KEY)
  if (!url) return { ...empty({ itemsTotal: items.length }), configured: false }

  let wb: XLSX.WorkBook
  let nvlHot: NVLHotRow[]
  let pinnedTab: string | null
  try {
    const [sheetRes, nvlRes, tab] = await Promise.all([
      fetch(`/api/proxy/sheets?url=${encodeURIComponent(url)}`),
      fetch('/api/nvl-hot').then(r => r.json()),
      getSetting(TAB_KEY),
    ])
    if (!sheetRes.ok) {
      const j = await sheetRes.json().catch(() => ({}))
      throw new Error(j.error ?? `HTTP ${sheetRes.status}`)
    }
    wb        = XLSX.read(new Uint8Array(await sheetRes.arrayBuffer()), { type: 'array' })
    nvlHot    = nvlRes.success ? (nvlRes.data ?? []) : []
    pinnedTab = tab
  } catch (e) {
    return { ...empty({ itemsTotal: items.length }), error: String(e) }
  }

  // Parse the tracking tab once, then filter per-item by MO.
  const sheet     = resolveDefaultSheet(wb, pinnedTab)
  const raw       = readSheetRows(wb, sheet)
  const dataStart = findDataStart(raw) ?? 3

  const res = empty({ itemsTotal: items.length })

  for (const item of items) {
    const mo = extractMO(item.so_mo)
    if (!mo) { res.itemsNoMo++; continue }

    const bodies = enrichRows(filterRows(raw, dataStart, mo), nvlHot).map(buildGemBody)
    if (bodies.length === 0) { res.itemsNoMatch++; continue }

    let added = 0
    for (const body of bodies) {
      try {
        const r = await fetch(`/api/invoices/${invoiceId}/items/${item.id}/gems`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
        })
        if (r.ok) added++
      } catch { /* skip this gem, keep going */ }
    }
    res.gemsAdded += added
    if (added > 0) res.itemsMatched++
    else res.itemsNoMatch++
  }

  return res
}

/** One-line Vietnamese summary for a toast. */
export function summarize(r: AutoFillResult): string {
  if (!r.configured) return 'Chưa cấu hình link sheet hột — bỏ qua tra hột.'
  if (r.error)       return `Lỗi tra hột: ${r.error}`
  const parts = [`${r.itemsMatched} item khớp`, `+${r.gemsAdded} hột`]
  if (r.itemsNoMo)    parts.push(`${r.itemsNoMo} item không có MO`)
  if (r.itemsNoMatch) parts.push(`${r.itemsNoMatch} item chưa khớp`)
  return parts.join(' · ')
}
