'use client'

import { useState, useRef } from 'react'
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

function extractMO(soMo: string): string | null {
  const m = soMo.match(/MO([\d.]+)/i)
  return m ? m[1] : null
}

function parseWorkbook(buf: ArrayBuffer): any[][] {
  const wb  = XLSX.read(new Uint8Array(buf), { type: 'array' })
  const ws  = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]
}

function filterRows(raw: any[][], mo: string | null): GemRow[] {
  // Find header row: col[4] = 'MO'
  let dataStart = 3
  for (let i = 0; i < Math.min(10, raw.length); i++) {
    if (String(raw[i][4] ?? '').trim().toUpperCase() === 'MO') {
      dataStart = i + 1
      break
    }
  }

  const matched: GemRow[] = []
  for (let i = dataStart; i < raw.length; i++) {
    const r      = raw[i]
    const rowMO  = String(r[4] ?? '').trim()
    const status = String(r[12] ?? '').trim().toLowerCase()
    if (!rowMO) continue
    if (mo && rowMO !== mo) continue
    if (status !== 'nhập') continue
    matched.push({
      ma_xoan:      String(r[6]  ?? '').trim(),
      p_chat:       'VVS1',
      size_xoan:    String(r[7]  ?? '').trim(),
      sl_hot:       Number(r[8]  ?? 0),
      tl_sau_xu_ly: Number(r[11] ?? 0),
    })
  }
  return matched
}

type InputMode = 'file' | 'url'

export function XoanLookupPanel({ invoiceId, itemId, soMo, onSaved, onClose }: Props) {
  const [inputMode,  setInputMode]  = useState<InputMode>('file')
  const [sheetUrl,   setSheetUrl]   = useState('')
  const [rows,       setRows]       = useState<GemRow[] | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [addedIds,   setAddedIds]   = useState<Set<number>>(new Set())
  const [adding,     setAdding]     = useState(false)
  const [error,      setError]      = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const mo = soMo ? extractMO(soMo) : null

  async function processBuffer(buf: ArrayBuffer) {
    try {
      const raw     = parseWorkbook(buf)
      const matched = filterRows(raw, mo)
      setRows(matched)
    } catch (e) {
      setError(`Không đọc được file: ${String(e)}`)
    }
  }

  async function handleFile(file: File) {
    setLoading(true); setError(''); setRows(null); setAddedIds(new Set())
    try {
      await processBuffer(await file.arrayBuffer())
    } finally {
      setLoading(false)
    }
  }

  async function handleFetchUrl() {
    if (!sheetUrl.trim()) return
    setLoading(true); setError(''); setRows(null); setAddedIds(new Set())
    try {
      const res = await fetch(`/api/proxy/sheets?url=${encodeURIComponent(sheetUrl.trim())}`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      await processBuffer(await res.arrayBuffer())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
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
          tl_truoc_xu_ly_ct: null, tl_sau_xu_ly_ct: r.tl_sau_xu_ly || null,
          don_gia: 0,
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
            tl_truoc_xu_ly_ct: null, tl_sau_xu_ly_ct: r.tl_sau_xu_ly || null,
            don_gia: 0,
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

  function reset() { setRows(null); setAddedIds(new Set()); setError('') }

  const pending = rows ? rows.filter((_, i) => !addedIds.has(i)) : []

  const tabBtn = (mode: InputMode, label: string) => (
    <button onClick={() => { setInputMode(mode); reset() }}
      style={{
        padding: '3px 10px', border: '1px solid var(--border-base)', cursor: 'pointer',
        fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600,
        background: inputMode === mode ? 'var(--text-primary)' : 'transparent',
        color: inputMode === mode ? 'var(--text-inverse)' : 'var(--text-secondary)',
        borderRadius: 0,
      }}>
      {label}
    </button>
  )

  return (
    <div style={{ borderTop: '1px solid var(--border-light)', padding: '0.75rem 1rem', background: 'var(--bg-base)' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
          Tra hột — THEO DÕI XOÀN
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13 }}>
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      {/* MO info */}
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
        {mo ? (
          <>Lọc theo MO: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{mo}</strong>
            {' '}+ trạng thái <strong>Nhập</strong></>
        ) : (
          <span style={{ color: 'var(--color-warning)' }}>
            <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 4 }} />
            Chưa có MO — sẽ lấy toàn bộ dòng Nhập
          </span>
        )}
      </div>

      {/* Input area — only show when no results yet */}
      {!rows && (
        <div>
          {/* Mode tabs */}
          <div style={{ display: 'flex', gap: 0, marginBottom: '0.5rem' }}>
            {tabBtn('url',  'Link Google Sheet')}
            {tabBtn('file', 'Upload file')}
          </div>

          {/* URL input */}
          {inputMode === 'url' && (
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                value={sheetUrl}
                onChange={e => setSheetUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleFetchUrl()}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                style={{
                  flex: 1, border: '1px solid var(--border-base)', background: 'var(--bg-surface)',
                  padding: '5px 8px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                  color: 'var(--text-primary)', outline: 'none',
                }}
              />
              <button onClick={handleFetchUrl} disabled={loading || !sheetUrl.trim()}
                style={{
                  padding: '5px 14px', background: 'var(--text-primary)', color: 'var(--text-inverse)',
                  border: 'none', cursor: loading || !sheetUrl.trim() ? 'not-allowed' : 'pointer',
                  opacity: loading || !sheetUrl.trim() ? 0.6 : 1,
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, whiteSpace: 'nowrap',
                }}>
                {loading ? <i className="fa-solid fa-circle-notch fa-spin" /> : 'Lấy dữ liệu'}
              </button>
            </div>
          )}

          {/* File upload */}
          {inputMode === 'file' && !loading && (
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                border: '1px dashed var(--border-base)', padding: '0.65rem 1rem',
                cursor: 'pointer', textAlign: 'center', color: 'var(--text-muted)',
                fontSize: 'var(--text-xs)', background: 'var(--bg-surface)',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--text-secondary)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-base)')}
            >
              <i className="fa-solid fa-file-excel" style={{ marginRight: 6, color: '#22c55e' }} />
              Chọn file TỔNG HỢP THEO DÕI XOÀN (.xlsx)
            </div>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

          {loading && inputMode === 'file' && (
            <div style={{ textAlign: 'center', padding: '0.65rem', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
              <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 6 }} />Đang đọc file…
            </div>
          )}

          {error && <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)', marginTop: 4 }}>{error}</p>}
        </div>
      )}

      {/* Loading (URL fetch) */}
      {loading && inputMode === 'url' && !rows && (
        <div style={{ textAlign: 'center', padding: '0.65rem', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
          <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 6 }} />Đang tải Google Sheet…
        </div>
      )}

      {/* Results */}
      {rows !== null && (
        <div>
          {rows.length === 0 ? (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', padding: '0.4rem 0' }}>
              Không tìm thấy dòng nào (MO={mo ?? '—'}, trạng thái=Nhập).
              <button onClick={reset} style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--color-info)', cursor: 'pointer', fontSize: 'var(--text-xs)', textDecoration: 'underline' }}>
                Thử lại
              </button>
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
                          onMouseLeave={e => (e.currentTarget.style.background = '')}
                        >
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
                    {adding
                      ? <><i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 4 }} />Đang thêm…</>
                      : `+ Thêm tất cả (${pending.length})`}
                  </button>
                )}
                <button onClick={reset}
                  style={{ padding: '4px 10px', border: '1px solid var(--border-base)', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                  Đổi nguồn
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
