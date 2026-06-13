'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { apiCall } from '@/lib/api'
import { mapSizeToRange } from '@/lib/formulas/size-mapping'

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
  mk_price:   number
}

interface EnrichedRow extends GemRow {
  mapped_range: string | null  // computed via mapSizeToRange
  don_gia:      number         // looked up from NVL Hot catalog
}

interface Props {
  invoiceId: string
  itemId:    string
  soMo:      string | null | undefined
  onSaved:   () => void
  onClose:   () => void
}

const SETTINGS_KEY = 'xoan_sheet_url'

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

function parseAndFilter(buf: ArrayBuffer, mo: string | null): GemRow[] {
  const wb  = XLSX.read(new Uint8Array(buf), { type: 'array' })
  const ws  = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]

  let dataStart = 3
  for (let i = 0; i < Math.min(10, raw.length); i++) {
    if (String(raw[i][4] ?? '').trim().toUpperCase() === 'MO') { dataStart = i + 1; break }
  }

  const out: GemRow[] = []
  for (let i = dataStart; i < raw.length; i++) {
    const r      = raw[i]
    const rowMO  = String(r[4] ?? '').trim()
    const status = String(r[12] ?? '').trim().toLowerCase()
    if (!rowMO) continue
    if (mo && rowMO !== mo) continue
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

export function XoanLookupPanel({ invoiceId, itemId, soMo, onSaved, onClose }: Props) {
  const mo = soMo ? extractMO(soMo) : null

  const [rows,       setRows]       = useState<GemRow[] | null>(null)
  const [fetching,   setFetching]   = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [addedIds,   setAddedIds]   = useState<Set<number>>(new Set())
  const [adding,     setAdding]     = useState(false)
  const [nvlHotList, setNvlHotList] = useState<NVLHotRow[]>([])
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
      const mapped_range = mapSizeToRange(r.ma_xoan, r.size_xoan, r.tl_sau_xu_ly)
      const found        = mapped_range ? nvlHotList.find(c => c.size_range === mapped_range) : null
      return { ...r, mapped_range, don_gia: found?.mk_price ?? 0 }
    })
  }, [rows, nvlHotList])

  // Auto-fetch from saved URL on mount
  useEffect(() => {
    async function init() {
      setFetching(true)
      try {
        const res  = await fetch(`/api/settings?key=${SETTINGS_KEY}`)
        const json = await res.json()
        const url: string | null = json.success ? json.value : null
        if (url) await fetchFromUrl(url)
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

  async function fetchFromUrl(url: string) {
    setFetching(true)
    setFetchError('')
    setRows(null)
    setAddedIds(new Set())
    try {
      const res = await fetch(`/api/proxy/sheets?url=${encodeURIComponent(url)}`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      setRows(parseAndFilter(await res.arrayBuffer(), mo))
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
    setAddedIds(new Set())
    try {
      setRows(parseAndFilter(await file.arrayBuffer(), mo))
    } catch (e) {
      setFetchError(`Không đọc được file: ${String(e)}`)
    } finally {
      setFetching(false)
    }
  }

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
              if (json.value) fetchFromUrl(json.value)
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
      {enrichedRows !== null && !fetching && (
        <div>
          {enrichedRows.length === 0 ? (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', padding: '0.2rem 0' }}>
              Không tìm thấy dòng nào (MO={mo ?? '—'}, trạng thái=Xuất).
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
                      const done = addedIds.has(idx)
                      return (
                        <tr key={idx} style={{ opacity: done ? 0.4 : 1 }}
                          onMouseEnter={e => !done && (e.currentTarget.style.background = 'var(--bg-hover)')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}>
                          <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', fontWeight: 600 }}>{r.ma_xoan || '—'}</td>
                          <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>{r.size_xoan || '—'}</td>
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
