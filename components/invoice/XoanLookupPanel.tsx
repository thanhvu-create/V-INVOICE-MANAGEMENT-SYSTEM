'use client'

import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { apiCall } from '@/lib/api'

interface GemRow {
  ma_xoan:      string
  p_chat:       string
  size_xoan:    string
  sl_hot:       number
  tl_sau_xu_ly: number
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
    if (status !== 'nhập') continue
    out.push({
      ma_xoan:      String(r[6]  ?? '').trim(),
      p_chat:       'VVS1',
      size_xoan:    String(r[7]  ?? '').trim(),
      sl_hot:       Number(r[8]  ?? 0),
      tl_sau_xu_ly: Number(r[11] ?? 0),
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
  const fileRef = useRef<HTMLInputElement>(null)

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

  async function handleAddOne(idx: number) {
    if (addedIds.has(idx) || !rows) return
    const r = rows[idx]
    const data = await apiCall(
      () => fetch(`/api/invoices/${invoiceId}/items/${itemId}/gems`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ma_xoan: r.ma_xoan || null, p_chat: r.p_chat,
          size_xoan_range: r.size_xoan || null, sl_hot: r.sl_hot,
          tl_truoc_xu_ly_ct: null, tl_sau_xu_ly_ct: r.tl_sau_xu_ly || null, don_gia: 0,
        }),
      }),
      { successMsg: 'Gem added.' }
    )
    if (data !== null) {
      setAddedIds(prev => { const s = new Set(prev); s.add(idx); return s })
      onSaved()
    }
  }

  async function handleAddAll() {
    if (!rows) return
    setAdding(true)
    let count = 0
    const newIds = new Set(addedIds)
    for (let idx = 0; idx < rows.length; idx++) {
      if (newIds.has(idx)) continue
      const r = rows[idx]
      const data = await apiCall(
        () => fetch(`/api/invoices/${invoiceId}/items/${itemId}/gems`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ma_xoan: r.ma_xoan || null, p_chat: r.p_chat,
            size_xoan_range: r.size_xoan || null, sl_hot: r.sl_hot,
            tl_truoc_xu_ly_ct: null, tl_sau_xu_ly_ct: r.tl_sau_xu_ly || null, don_gia: 0,
          }),
        }),
        { successMsg: '' }
      )
      if (data !== null) { newIds.add(idx); count++ }
    }
    setAddedIds(newIds)
    setAdding(false)
    if (count > 0) onSaved()
  }

  const pending = rows ? rows.filter((_, i) => !addedIds.has(i)) : []

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
          ? <>Lọc MO: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{mo}</strong> · trạng thái <strong>Nhập</strong></>
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
      {rows !== null && !fetching && (
        <div>
          {rows.length === 0 ? (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', padding: '0.2rem 0' }}>
              Không tìm thấy dòng nào (MO={mo ?? '—'}, trạng thái=Nhập).
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto', marginBottom: '0.5rem' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', width: '100%' }}>
                  <thead>
                    <tr>
                      {['Mã Xoàn', 'P.Chất', 'Size', 'SL', 'TB viên (ct)', ''].map(h => (
                        <th key={h} style={{ padding: '3px 8px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-base)', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => {
                      const done = addedIds.has(idx)
                      return (
                        <tr key={idx} style={{ opacity: done ? 0.4 : 1 }}
                          onMouseEnter={e => !done && (e.currentTarget.style.background = 'var(--bg-hover)')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}>
                          <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', fontWeight: 600 }}>{r.ma_xoan || '—'}</td>
                          <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>{r.p_chat}</td>
                          <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)' }}>{r.size_xoan || '—'}</td>
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
