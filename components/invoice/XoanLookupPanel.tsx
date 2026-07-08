'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { apiCall } from '@/lib/api'
import { detectStoneType, parseSizeValue } from '@/lib/formulas/size-mapping'
import { useUser } from '@/contexts/UserContext'

interface GemRow {
  ma_xoan:      string
  p_chat:       string
  size_xoan:    string   // raw size from tracking (col H): "2.1" or "2.3*2.3"
  sl_hot:       number
  tl_sau_xu_ly: number   // Trọng lượng (col J, index 9)
}

interface NVLHotRow {
  id:         string
  stone_type: string
  grade:      string
  size_range: string
  size_min:   number | null
  size_max:   number | null
  size_unit:  string
  mk_price:   number
}

interface EnrichedRow extends GemRow {
  mapped_range: string | null
  don_gia:      number
  tb_vien:      number | null  // computed for CT-based types (tl / sl)
}

interface Props {
  invoiceId: string
  itemId:    string
  soMo:      string | null | undefined
  onSaved:   () => void
  onClose:   () => void
}

const SETTINGS_KEY = 'xoan_sheet_url'
const TAB_SETTINGS_KEY = 'xoan_sheet_tab'

const CT_BASED_TYPES = new Set([
  'BG', 'LG-BG', 'MQ', 'LG-MQ', 'PS', 'LG-PS',
  'OV', 'LG-OV', 'LG-HS', 'LG-TD', 'BQT', 'XC', 'RRB-N', 'PEARL',
])
function isCTBased(stoneType: string | null): boolean {
  return !!stoneType && CT_BASED_TYPES.has(stoneType)
}

function extractMO(soMo: string): string | null {
  const m = soMo.match(/MO([\d.]+)/i)
  return m ? m[1] : null
}

function inferPChat(maXoan: string): string {
  if (!maXoan) return ''
  const u = maXoan.toUpperCase()
  if (u.includes('CZ')) return 'CZ'
  if (u.includes('L'))  return 'LG'
  const DIAMOND = ['RD', 'PR', 'BG', 'MQ', 'PS', 'OV', 'TD']
  if (DIAMOND.some(p => u.startsWith(p))) return 'VVS1'
  return ''
}

function readSheetRows(wb: XLSX.WorkBook, sheetName: string): any[][] {
  const ws = wb.Sheets[sheetName]
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]
}

// Scans the first 10 rows for the "MO" header at col E (index 4) — returns the
// data start row, or null if this sheet doesn't look like a tracking-data sheet.
function findDataStart(raw: any[][]): number | null {
  for (let i = 0; i < Math.min(10, raw.length); i++) {
    if (String(raw[i]?.[4] ?? '').trim().toUpperCase() === 'MO') return i + 1
  }
  return null
}

function filterRows(raw: any[][], dataStart: number, mo: string | null): GemRow[] {
  const out: GemRow[] = []
  for (let i = dataStart; i < raw.length; i++) {
    const r      = raw[i]
    const rowMO  = String(r[4] ?? '').trim()
    const status = String(r[12] ?? '').trim().toLowerCase()
    if (!rowMO) continue
    if (mo && rowMO !== mo) {
      // Excel numeric cells lose trailing zeros (26.36160 → "26.3616") — compare as floats
      const n1 = parseFloat(rowMO), n2 = parseFloat(mo)
      if (isNaN(n1) || isNaN(n2) || n1 !== n2) continue
    }
    if (status !== 'xuất') continue
    // Col F (index 5) = Mã xoàn; Col H (index 7) = Size gốc; Col I (index 8) = SL
    // Col J (index 9) = Trọng lượng (dùng làm TB viên); Col M (index 12) = Trạng thái
    const ma_xoan = String(r[5] ?? '').trim()
    out.push({
      ma_xoan,
      p_chat:       inferPChat(ma_xoan),
      size_xoan:    String(r[7]  ?? '').trim(),
      sl_hot:       Number(r[8]  ?? 0),
      tl_sau_xu_ly: Number(r[9]  ?? 0),
    })
  }
  return out
}

// Picks the first sheet whose first 10 rows contain the "MO" header — falls
// back to the first sheet in the workbook if none match.
function detectHeuristicSheet(wb: XLSX.WorkBook): string {
  for (const name of wb.SheetNames) {
    if (findDataStart(readSheetRows(wb, name)) !== null) return name
  }
  return wb.SheetNames[0]
}

// Prefers the admin-pinned default tab (if it still exists in this workbook),
// otherwise falls back to the MO-header heuristic.
function resolveDefaultSheet(wb: XLSX.WorkBook, pinnedTab: string | null): string {
  if (pinnedTab && wb.SheetNames.includes(pinnedTab)) return pinnedTab
  return detectHeuristicSheet(wb)
}

export function XoanLookupPanel({ invoiceId, itemId, soMo, onSaved, onClose }: Props) {
  const mo = soMo ? extractMO(soMo) : null
  const { canDo } = useUser()
  const canPin = canDo('manage_rates')

  const [rows,       setRows]       = useState<GemRow[] | null>(null)
  const [fetching,   setFetching]   = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [addedIds,   setAddedIds]   = useState<Set<number>>(new Set())
  const [adding,     setAdding]     = useState(false)
  const [nvlHotList, setNvlHotList] = useState<NVLHotRow[]>([])
  const [workbook,      setWorkbook]      = useState<XLSX.WorkBook | null>(null)
  const [sheetNames,    setSheetNames]    = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string>('')
  const [searchedSheet, setSearchedSheet] = useState<string | null>(null)
  const [pinnedTab,     setPinnedTab]     = useState<string | null>(null)
  const [pinning,       setPinning]       = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Fetch NVL Hot catalog for price lookup
  useEffect(() => {
    fetch('/api/nvl-hot')
      .then(r => r.json())
      .then(j => { if (j.success) setNvlHotList(j.data ?? []) })
      .catch(() => {})
  }, [])

  const enrichedRows: EnrichedRow[] | null = useMemo(() => {
    if (!rows) return null
    return rows.map(r => {
      const stoneType = detectStoneType(r.ma_xoan)
      let sizeNum: number
      let tb_vien: number | null = null
      if (isCTBased(stoneType)) {
        // CT-based types (BG, MQ, PS, OV, ...): use TB viên = TL / SL for range lookup
        tb_vien  = r.sl_hot > 0 ? r.tl_sau_xu_ly / r.sl_hot : 0
        sizeNum  = tb_vien
      } else {
        sizeNum  = parseSizeValue(r.size_xoan) || r.tl_sau_xu_ly
      }
      const found = stoneType && sizeNum > 0
        ? nvlHotList.find(c => c.stone_type === stoneType && c.size_min != null && c.size_max != null && sizeNum >= c.size_min && sizeNum <= c.size_max)
        : null
      return { ...r, mapped_range: found?.size_range ?? null, don_gia: found?.mk_price ?? 0, tb_vien }
    })
  }, [rows, nvlHotList])

  // Auto-fetch from saved URL + pinned tab on mount
  useEffect(() => {
    async function init() {
      setFetching(true)
      try {
        const [urlJson, tabJson] = await Promise.all([
          fetch(`/api/settings?key=${SETTINGS_KEY}`).then(r => r.json()),
          fetch(`/api/settings?key=${TAB_SETTINGS_KEY}`).then(r => r.json()),
        ])
        const url:    string | null = urlJson.success ? urlJson.value : null
        const pinned: string | null = tabJson.success ? tabJson.value : null
        setPinnedTab(pinned)
        if (url) await fetchFromUrl(url, pinned)
        else setFetchError('Chưa cấu hình link Google Sheet — dùng nút "Link Hột" ở trên.')
      } catch {
        setFetchError('Không tải được cấu hình.')
      } finally {
        setFetching(false)
      }
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function runSearch(wb: XLSX.WorkBook, sheetName: string) {
    const raw = readSheetRows(wb, sheetName)
    const dataStart = findDataStart(raw) ?? 3
    setRows(filterRows(raw, dataStart, mo))
    setSearchedSheet(sheetName)
    setAddedIds(new Set())
  }

  function loadWorkbook(buf: ArrayBuffer, pinned: string | null) {
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
    const defaultSheet = resolveDefaultSheet(wb, pinned)
    setWorkbook(wb)
    setSheetNames(wb.SheetNames)
    setSelectedSheet(defaultSheet)
    runSearch(wb, defaultSheet)
  }

  async function fetchFromUrl(url: string, pinnedOverride?: string | null) {
    setFetching(true)
    setFetchError('')
    setRows(null)
    setWorkbook(null)
    setSheetNames([])
    setSearchedSheet(null)
    setAddedIds(new Set())
    try {
      const res = await fetch(`/api/proxy/sheets?url=${encodeURIComponent(url)}`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      loadWorkbook(await res.arrayBuffer(), pinnedOverride !== undefined ? pinnedOverride : pinnedTab)
    } catch (e) {
      setFetchError(String(e))
    } finally {
      setFetching(false)
    }
  }

  async function handleFileUpload(file: File) {
    setFetching(true)
    setFetchError('')
    setRows(null)
    setWorkbook(null)
    setSheetNames([])
    setSearchedSheet(null)
    setAddedIds(new Set())
    try {
      loadWorkbook(await file.arrayBuffer(), pinnedTab)
    } catch (e) {
      setFetchError(`Không đọc được file: ${String(e)}`)
    } finally {
      setFetching(false)
    }
  }

  async function handlePinTab() {
    if (!selectedSheet || pinning) return
    setPinning(true)
    try {
      await fetch('/api/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: TAB_SETTINGS_KEY, value: selectedSheet }),
      })
      setPinnedTab(selectedSheet)
    } finally {
      setPinning(false)
    }
  }

  const tabIsStale = !!workbook && selectedSheet !== searchedSheet

  function buildGemBody(r: EnrichedRow) {
    return {
      ma_xoan:           r.ma_xoan || null,
      p_chat:            r.p_chat,
      size_xoan_range:   r.mapped_range || null,
      sl_hot:            r.sl_hot,
      tl_truoc_xu_ly_ct: r.tl_sau_xu_ly || null,
      tl_sau_xu_ly_ct:   null,
      don_gia:           r.don_gia,
    }
  }

  async function handleAddOne(idx: number) {
    if (addedIds.has(idx) || !enrichedRows) return
    const data = await apiCall(
      () => fetch(`/api/invoices/${invoiceId}/items/${itemId}/gems`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildGemBody(enrichedRows[idx])),
      }),
      { successMsg: 'Gem added.' }
    )
    if (data !== null) {
      setAddedIds(prev => { const s = new Set(prev); s.add(idx); return s })
      onSaved()
    }
  }

  async function handleAddAll() {
    if (!enrichedRows) return
    setAdding(true)
    let count = 0
    const newIds = new Set(addedIds)
    for (let idx = 0; idx < enrichedRows.length; idx++) {
      if (newIds.has(idx)) continue
      const data = await apiCall(
        () => fetch(`/api/invoices/${invoiceId}/items/${itemId}/gems`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildGemBody(enrichedRows[idx])),
        }),
        { successMsg: '' }
      )
      if (data !== null) { newIds.add(idx); count++ }
    }
    setAddedIds(newIds)
    setAdding(false)
    if (count > 0) onSaved()
  }

  const pending = enrichedRows ? enrichedRows.filter((_, i) => !addedIds.has(i)) : []

  return (
    <div style={{ borderTop: '1px solid var(--border-light)', padding: '0.75rem 1rem', background: 'var(--bg-base)' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
          Tra hột — THEO DÕI XOÀN
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Re-fetch trigger */}
          {!fetching && (
            <button onClick={async () => {
              const res  = await fetch(`/api/settings?key=${SETTINGS_KEY}`)
              const json = await res.json()
              if (json.value) fetchFromUrl(json.value, pinnedTab)
            }}
              title="Tải lại" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}>
              <i className="fa-solid fa-rotate-right" />
            </button>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13 }}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
      </div>

      {/* MO info */}
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
        {mo
          ? <>Lọc MO: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{mo}</strong> · trạng thái <strong>Xuất</strong></>
          : <span style={{ color: 'var(--color-warning)' }}><i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 4 }} />Chưa có MO trong SO-MO</span>
        }
      </div>

      {/* Tab selector — only shown when the workbook has more than one sheet */}
      {sheetNames.length > 1 && !fetching && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.5rem' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flexShrink: 0 }}>
            <i className="fa-solid fa-table-cells" style={{ marginRight: 4 }} />Tab:
          </span>
          <select
            value={selectedSheet}
            onChange={e => setSelectedSheet(e.target.value)}
            style={{
              flex: 1, minWidth: 0,
              fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)',
              border: '1px solid var(--border-base)', background: 'var(--bg-surface)',
              color: 'var(--text-primary)', padding: '2px 6px', cursor: 'pointer',
            }}
          >
            {sheetNames.map(name => (
              <option key={name} value={name}>{name}{name === pinnedTab ? ' ★ (mặc định)' : ''}</option>
            ))}
          </select>
          <button
            onClick={() => workbook && runSearch(workbook, selectedSheet)}
            disabled={!workbook}
            style={{
              flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
              padding: '2px 10px', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)',
              border: `1px solid ${tabIsStale ? 'var(--text-primary)' : 'var(--border-base)'}`,
              background: tabIsStale ? 'var(--text-primary)' : 'transparent',
              color: tabIsStale ? 'var(--text-inverse)' : 'var(--text-secondary)',
              cursor: workbook ? 'pointer' : 'not-allowed', fontWeight: tabIsStale ? 600 : 400,
            }}
          >
            <i className="fa-solid fa-magnifying-glass" style={{ fontSize: 9 }} />Tra hột
          </button>
          {canPin && (
            <button
              onClick={handlePinTab}
              disabled={pinning || !selectedSheet}
              title={selectedSheet === pinnedTab ? 'Tab này đang là mặc định' : 'Đặt tab này làm mặc định cho lần tra sau'}
              style={{
                flexShrink: 0, background: 'none', border: 'none',
                cursor: pinning ? 'not-allowed' : 'pointer', padding: '2px 4px',
              }}
            >
              {pinning
                ? <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: 11, color: 'var(--text-muted)' }} />
                : <i className="fa-solid fa-thumbtack" style={{ fontSize: 11, color: selectedSheet === pinnedTab ? '#f59e0b' : 'var(--text-muted)' }} />
              }
            </button>
          )}
        </div>
      )}

      {/* Hint when the selected tab hasn't been searched yet */}
      {tabIsStale && !fetching && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning)', marginBottom: '0.5rem' }}>
          <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 4 }} />
          Đã đổi tab — bấm &quot;Tra hột&quot; để tìm trong tab này.
        </div>
      )}

      {/* Loading */}
      {fetching && (
        <div style={{ textAlign: 'center', padding: '0.75rem', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
          <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 6 }} />Đang tải dữ liệu hột…
        </div>
      )}

      {/* Error */}
      {fetchError && !fetching && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)', marginBottom: '0.4rem' }}>
          {fetchError}
          <button onClick={() => fileRef.current?.click()}
            style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-info)', fontSize: 'var(--text-xs)', textDecoration: 'underline' }}>
            <i className="fa-solid fa-file-excel" style={{ marginRight: 3, color: '#22c55e' }} />Upload file thủ công
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }} />
        </div>
      )}

      {/* Results */}
      {enrichedRows !== null && !fetching && !tabIsStale && (
        <div>
          {enrichedRows.length === 0 ? (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', padding: '0.2rem 0' }}>
              Không tìm thấy dòng nào trong tab &quot;{searchedSheet}&quot; (MO={mo ?? '—'}, trạng thái=Xuất).
              {sheetNames.length > 1 && ' Thử chọn tab khác ở trên.'}
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto', marginBottom: '0.5rem' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', width: '100%' }}>
                  <thead>
                    <tr>
                      {['Mã Xoàn', 'Size gốc', 'Range NVL', 'Đơn giá', 'SL', 'Trọng Lượng', ''].map(h => (
                        <th key={h} style={{ padding: '3px 8px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-base)', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {enrichedRows.map((r, idx) => {
                      const done     = addedIds.has(idx)
                      const ctBased  = r.tb_vien !== null
                      return (
                        <tr key={idx} style={{ opacity: done ? 0.4 : 1 }}
                          onMouseEnter={e => !done && (e.currentTarget.style.background = 'var(--bg-hover)')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}>
                          <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', fontWeight: 600 }}>{r.ma_xoan || '—'}</td>
                          <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>
                            {ctBased ? (
                              <span title={`Size gốc: ${r.size_xoan || '—'} · TB viên = TL/SL`}>
                                {r.size_xoan || '—'}
                                <span style={{ marginLeft: 4, color: 'var(--color-info)', fontSize: '0.9em' }}>
                                  ({r.tb_vien!.toFixed(4)} ct)
                                </span>
                              </span>
                            ) : (r.size_xoan || '—')}
                          </td>
                          <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', color: r.mapped_range ? 'var(--color-success)' : 'var(--text-muted)' }}>
                            {r.mapped_range ?? '—'}
                          </td>
                          <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', color: r.don_gia > 0 ? 'inherit' : 'var(--text-muted)' }}>
                            {r.don_gia > 0 ? `$${r.don_gia}` : '—'}
                          </td>
                          <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)' }}>{r.sl_hot}</td>
                          <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)' }}>{r.tl_sau_xu_ly.toFixed(4)}</td>
                          <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>
                            {done ? (
                              <span style={{ color: 'var(--color-success)', fontFamily: 'var(--font-body)' }}>
                                <i className="fa-solid fa-check" style={{ marginRight: 3 }} />Đã thêm
                              </span>
                            ) : (
                              <button onClick={() => handleAddOne(idx)}
                                style={{ background: 'none', border: '1px solid var(--border-base)', cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', padding: '1px 7px', fontFamily: 'var(--font-body)' }}>
                                + Thêm
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {pending.length > 0 && (
                  <button onClick={handleAddAll} disabled={adding}
                    style={{ padding: '4px 14px', background: 'var(--text-primary)', color: 'var(--text-inverse)', border: 'none', cursor: adding ? 'not-allowed' : 'pointer', opacity: adding ? 0.7 : 1, fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.05em' }}>
                    {adding ? <><i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 4 }} />Đang thêm…</> : `+ Thêm tất cả (${pending.length})`}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
