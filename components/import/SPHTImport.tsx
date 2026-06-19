'use client'

import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { toast } from '@/components/ui/Toast'
import { useUser } from '@/contexts/UserContext'
import { templateLabel } from '@/lib/templates'
import type { ImportRow } from '@/types'

const SPHT_URL_KEY = 'spht_sheet_url'

// SPHT file structure: first header at row 11, data from row 12 onward.
// Sheet has a repeated header mid-sheet (row ~75 local / row 102 Google Sheet)
// which is auto-skipped by the CH!="US" filter.
// DATA_START = 12 ensures both data sections are captured.
const DATA_START_1IDX = 12

// Column indices (0-based)
// A[0]=CH  D[3]=SKU  E[4]=SO  F[5]=MO  G[6]=CHI TIẾT SP  H[7]=LOẠI VÀNG
// I[8]=SỐ LƯỢNG  J[9]=TỔNG TL(gr)  P[15]=TÊN KHÁCH  Q[16]=SỐ PO  R[17]=V-INV

export const TEMPLATE_CHANNELS: Record<string, string[]> = {
  CH1:      ['CH1-Khách', 'CH1-SR'],
  CH2:      ['CH2', 'CH3'],
  ADM:      ['ADM', 'ADM1', 'ADM2'],
  CH1_AG3:  ['CH1-AG3', 'CH2-AG3', 'CH3-AG3'],
  VNSI_AG3: ['KENH-SI', 'KÊNH SỈ', 'Kênh sỉ', 'Kênh Sỉ'],
  MANUAL:   [],
}

function channelsForTemplate(t: string): string[] { return TEMPLATE_CHANNELS[t] ?? [] }

function rowMatchesTemplate(tenKhach: string, template: string): boolean {
  const allowed = channelsForTemplate(template)
  if (!allowed.length) return true
  return allowed.some(ch => tenKhach.trim().toLowerCase() === ch.toLowerCase())
}

// ── Sheet helpers ───────────────────────────────────────────────────────────

function getHTSheets(buf: ArrayBuffer): string[] {
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', bookSheets: true })
  return (wb.SheetNames ?? []).filter(n => /^HT\d{2}\.\d{2}$/i.test(n))
}

interface VinvOption { code: string; count: number; channels: string[] }

interface ParsedSPHT {
  sheetNames:  string[]
  vinvOptions: VinvOption[]
  rowsByVinv:  Record<string, ImportRow[]>
}

function parseSingleSheet(buf: ArrayBuffer, sheetName: string): Record<string, ImportRow[]> {
  const wb    = XLSX.read(new Uint8Array(buf), { type: 'array', sheets: sheetName })
  const sheet = wb.Sheets[sheetName]
  if (!sheet) return {}

  const all: any[][]  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const dataRows      = all.slice(DATA_START_1IDX - 1)
  const rowsByVinv: Record<string, ImportRow[]> = {}

  dataRows.forEach((row, i) => {
    const ch        = String(row[0]  ?? '').trim()
    const hientrang = String(row[16] ?? '').trim()
    const vinv      = String(row[17] ?? '').trim()
    if (ch !== 'US' || !vinv || hientrang !== 'Đã ship') return

    const skuRaw = String(row[3] ?? '').trim()
    const soRaw  = String(row[4] ?? '').trim()
    const moRaw  = String(row[5] ?? '').trim()
    const soMo   = soRaw && moRaw ? `SO${soRaw}-MO${moRaw}` : soRaw ? `SO${soRaw}` : ''
    const qty    = parseInt(String(row[8])) || 1
    const wt     = parseFloat(String(row[9])) || 0

    const importRow: ImportRow = {
      rowNum:      DATA_START_1IDX + i,
      store:       'HP',
      location:    'Safe 1',
      sku:         skuRaw ? String(Number(skuRaw) || skuRaw).toUpperCase() : `SKU-${i + 1}`,
      soMo,
      description: String(row[6]  ?? '').trim(),
      qty,
      weightTotal: wt,
      loaiVang:    String(row[7]  ?? '').trim().toUpperCase(),
      class:       '',
      subClass:    '',
      niniAdm:     String(row[15] ?? '').trim(),
    }

    if (!rowsByVinv[vinv]) rowsByVinv[vinv] = []
    rowsByVinv[vinv].push(importRow)
  })

  return rowsByVinv
}

function parseSPHTSheets(buf: ArrayBuffer, sheetNames: string[]): ParsedSPHT {
  const merged: Record<string, ImportRow[]> = {}

  for (const name of sheetNames) {
    const rows = parseSingleSheet(buf, name)
    for (const [vinv, items] of Object.entries(rows)) {
      if (!merged[vinv]) merged[vinv] = []
      merged[vinv].push(...items)
    }
  }

  const vinvOptions = Object.entries(merged)
    .map(([code, rows]) => ({
      code,
      count:    rows.length,
      channels: Array.from(new Set(rows.map(r => r.niniAdm).filter(Boolean))),
    }))
    .sort((a, b) => a.code.localeCompare(b.code))

  return { sheetNames, vinvOptions, rowsByVinv: merged }
}

// ── Preview table ───────────────────────────────────────────────────────────

const TEMPLATE_COLOR: Record<string, string> = {
  'CH1-Khách': '#92400E', 'CH1-SR': '#B45309',
  'ADM': '#065F46', 'ADM1': '#065F46', 'ADM2': '#065F46',
  'CH1-AG3': '#6B21A8', 'CH2-AG3': '#6B21A8', 'CH3-AG3': '#6B21A8',
  'KENH-SI': '#9F1239',
}

function PreviewTable({ rows }: { rows: ImportRow[] }) {
  const th: React.CSSProperties = {
    padding: '6px 8px', background: 'var(--bg-base)',
    fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.07em',
    textTransform: 'uppercase', color: 'var(--text-secondary)',
    borderBottom: '2px solid var(--border-base)', whiteSpace: 'nowrap', textAlign: 'left',
  }
  const td: React.CSSProperties = {
    padding: '5px 8px', borderBottom: '1px solid var(--border-light)',
    fontSize: 'var(--text-sm)', verticalAlign: 'middle',
  }
  return (
    <div style={{ overflowX: 'auto', maxHeight: 340, overflowY: 'auto', border: '1px solid var(--border-base)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
          <tr>
            {['#', 'SKU', 'SO-MO', 'Description', 'Loại Vàng', 'Qty', 'TL (gr)', 'Kênh'].map(h => (
              <th key={h} style={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const kenhColor = TEMPLATE_COLOR[r.niniAdm] ?? 'var(--text-secondary)'
            return (
              <tr key={i}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <td style={{ ...td, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', width: 28 }}>{i + 1}</td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontWeight: 700, background: 'var(--sku-highlight-bg)', color: '#92400E' }}>{r.sku}</td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{r.soMo || '—'}</td>
                <td style={{ ...td, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.description}>{r.description || '—'}</td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-info)' }}>{r.loaiVang || '—'}</td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{r.qty}</td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{r.weightTotal.toFixed(4)}</td>
                <td style={{ ...td }}>
                  <span style={{
                    fontSize: 'var(--text-xs)', fontWeight: 600,
                    color: kenhColor, background: `${kenhColor}18`,
                    padding: '2px 6px', borderRadius: 2,
                  }}>
                    {r.niniAdm || '—'}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

interface Props {
  invoiceId: string
  template:  string
  locked:    boolean
  onDone:    (count: number) => void
}

type ReadyStage = {
  s:              'ready'
  buf:            ArrayBuffer
  sheets:         string[]
  selectedSheets: string[]
  parsed:         ParsedSPHT
  selected:       string | null
}

type Stage =
  | { s: 'idle' }
  | { s: 'fetching' }
  | { s: 'pickSheet'; buf: ArrayBuffer; sheets: string[]; checked: string[] }
  | ReadyStage
  | { s: 'importing'; prev: ReadyStage }

export function SPHTImport({ invoiceId, template, locked, onDone }: Props) {
  const { canDo } = useUser()
  const canManage = canDo('manage_rates')

  const [stage,      setStage]      = useState<Stage>({ s: 'idle' })
  const [manualCode, setManualCode] = useState('')
  const [savedUrl,   setSavedUrl]   = useState<string | null>(null)
  const [urlInput,   setUrlInput]   = useState('')
  const [editUrl,    setEditUrl]    = useState(false)
  const [urlSaving,  setUrlSaving]  = useState(false)
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/settings?key=${SPHT_URL_KEY}`)
      .then(r => r.json())
      .then(j => { if (j.success && j.value) { setSavedUrl(j.value); setUrlInput(j.value) } })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (editUrl) setTimeout(() => editInputRef.current?.focus(), 50)
  }, [editUrl])

  async function saveUrl(url: string) {
    setUrlSaving(true)
    await fetch('/api/settings', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ key: SPHT_URL_KEY, value: url }),
    })
    setSavedUrl(url)
    setUrlSaving(false)
    setEditUrl(false)
  }

  function confirmSheets(buf: ArrayBuffer, sheets: string[], checked: string[]) {
    if (checked.length === 0) { toast('Vui lòng chọn ít nhất 1 sheet.', 'warn', 3000); return }
    try {
      const parsed = parseSPHTSheets(buf, checked)
      setManualCode('')
      setStage({ s: 'ready', buf, sheets, selectedSheets: checked, parsed, selected: null })
    } catch (err) {
      toast(`Lỗi đọc sheet: ${String(err)}`, 'error', 5000)
    }
  }

  async function handleFetchUrl(url: string) {
    if (!url.trim()) return
    setStage({ s: 'fetching' })
    try {
      const res = await fetch(`/api/proxy/sheets?url=${encodeURIComponent(url.trim())}`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      const buf    = await res.arrayBuffer()
      const sheets = getHTSheets(buf)
      if (sheets.length === 0) {
        toast('Không tìm thấy tab sheet nào dạng HT06.26, HT07.26,...', 'warn', 5000)
        setStage({ s: 'idle' }); return
      }
      // Default: check all sheets
      setStage({ s: 'pickSheet', buf, sheets, checked: [...sheets] })
    } catch (err) {
      toast(String(err), 'error', 6000)
      setStage({ s: 'idle' })
    }
  }

  async function handleImport(rows: ImportRow[], prevStage: ReadyStage) {
    setStage({ s: 'importing', prev: prevStage })
    try {
      const res  = await fetch('/api/import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ invoiceId, rows }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message || 'Import failed')
      onDone(rows.length)
    } catch (err) {
      toast(String(err), 'error', 5000)
      setStage(prevStage)
    }
  }

  function shortUrl(url: string) {
    try {
      const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{6,44})/)
      return m ? `docs.google.com/…/${m[1].slice(0, 10)}…` : url.slice(0, 48) + '…'
    } catch { return url.slice(0, 48) + '…' }
  }

  // ── Loading ─────────────────────────────────────────────────────────────

  if (stage.s === 'fetching' || stage.s === 'importing') {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: 24, display: 'block', marginBottom: '1rem' }} />
        {stage.s === 'fetching' ? 'Đang tải dữ liệu...' : 'Đang import...'}
      </div>
    )
  }

  // ── Idle ─────────────────────────────────────────────────────────────────

  if (stage.s === 'idle') {
    return (
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)', padding: '1.5rem 2rem' }}>
        <div style={{
          fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.6rem',
        }}>
          <i className="fa-brands fa-google-drive" style={{ marginRight: 6, color: '#34A853' }} />
          Google Sheet SPHT Nhập Kho
        </div>

        {editUrl || !savedUrl ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              ref={editInputRef}
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && urlInput.trim()) saveUrl(urlInput).then(() => handleFetchUrl(urlInput))
                if (e.key === 'Escape') setEditUrl(false)
              }}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              style={{
                flex: 1, border: '1px solid var(--border-base)', background: 'var(--bg-base)',
                padding: '6px 10px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                color: 'var(--text-primary)', outline: 'none',
              }}
            />
            <button
              onClick={async () => { if (!urlInput.trim()) return; await saveUrl(urlInput); handleFetchUrl(urlInput) }}
              disabled={urlSaving || !urlInput.trim() || locked}
              style={{
                padding: '6px 18px', background: 'var(--text-primary)', color: 'var(--text-inverse)',
                border: 'none',
                cursor: urlSaving || !urlInput.trim() || locked ? 'not-allowed' : 'pointer',
                opacity: urlSaving || !urlInput.trim() || locked ? 0.6 : 1,
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, whiteSpace: 'nowrap',
              }}>
              {urlSaving ? <i className="fa-solid fa-circle-notch fa-spin" /> : 'Lưu & Tải'}
            </button>
            {savedUrl && editUrl && (
              <button onClick={() => setEditUrl(false)}
                style={{
                  padding: '6px 10px', border: '1px solid var(--border-base)',
                  background: 'transparent', cursor: 'pointer',
                  color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                }}>
                Hủy
              </button>
            )}
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '0.6rem 0.75rem', background: 'var(--bg-base)', border: '1px solid var(--border-base)',
          }}>
            <i className="fa-solid fa-circle-check" style={{ color: '#34A853', fontSize: 12, flexShrink: 0 }} />
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
              flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {shortUrl(savedUrl)}
            </span>
            {canManage && (
              <button onClick={() => setEditUrl(true)} title="Đổi link"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, padding: 2, flexShrink: 0 }}>
                <i className="fa-solid fa-pen" />
              </button>
            )}
            <button
              onClick={() => handleFetchUrl(savedUrl)}
              disabled={locked}
              style={{
                padding: '5px 18px', background: 'var(--text-primary)', color: 'var(--text-inverse)',
                border: 'none', cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.6 : 1,
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600,
                flexShrink: 0, whiteSpace: 'nowrap',
              }}>
              <i className="fa-solid fa-rotate-right" style={{ marginRight: 6 }} />Tải dữ liệu
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Pick sheets (multi-select) ───────────────────────────────────────────

  if (stage.s === 'pickSheet') {
    const { buf, sheets, checked } = stage

    const toggle = (name: string) => {
      const next = checked.includes(name)
        ? checked.filter(s => s !== name)
        : [...checked, name]
      setStage({ s: 'pickSheet', buf, sheets, checked: next })
    }

    return (
      <div>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem',
          padding: '0.75rem 1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-base)',
        }}>
          <i className="fa-brands fa-google-drive" style={{ color: '#34A853', fontSize: 18 }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>Google Sheet SPHT</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              Tìm thấy {sheets.length} tab dữ liệu — tích chọn tháng cần lấy dữ liệu
            </div>
          </div>
          <button onClick={() => setStage({ s: 'idle' })}
            style={{
              marginLeft: 'auto', background: 'none', border: '1px solid var(--border-base)',
              padding: '4px 12px', cursor: 'pointer',
              fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)',
            }}>
            <i className="fa-solid fa-arrows-rotate" style={{ marginRight: 5 }} />Đổi nguồn
          </button>
        </div>

        {/* Select all / none */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            Tab sheet (tháng)
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button
              onClick={() => setStage({ s: 'pickSheet', buf, sheets, checked: [...sheets] })}
              style={{
                padding: '3px 10px', border: '1px solid var(--border-base)', background: 'transparent',
                cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)',
              }}>
              Chọn tất cả
            </button>
            <button
              onClick={() => setStage({ s: 'pickSheet', buf, sheets, checked: [] })}
              style={{
                padding: '3px 10px', border: '1px solid var(--border-base)', background: 'transparent',
                cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)',
              }}>
              Bỏ chọn tất cả
            </button>
          </div>
        </div>

        {/* Checkbox list */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: '0.5rem', marginBottom: '1.5rem',
        }}>
          {sheets.map(name => {
            const isChecked = checked.includes(name)
            return (
              <label key={name}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 14px',
                  border: `1.5px solid ${isChecked ? 'var(--text-primary)' : 'var(--border-base)'}`,
                  background: isChecked ? 'var(--bg-hover)' : 'var(--bg-surface)',
                  cursor: 'pointer', userSelect: 'none', transition: 'all 0.1s',
                }}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(name)}
                  style={{ width: 14, height: 14, accentColor: 'var(--text-primary)', cursor: 'pointer', flexShrink: 0 }}
                />
                <span style={{
                  fontFamily: 'var(--font-mono)', fontWeight: isChecked ? 700 : 400,
                  fontSize: 'var(--text-sm)',
                  color: isChecked ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}>
                  {name}
                </span>
              </label>
            )
          })}
        </div>

        {/* Confirm button */}
        <button
          onClick={() => confirmSheets(buf, sheets, checked)}
          disabled={checked.length === 0}
          style={{
            padding: '0.6rem 1.75rem', background: 'var(--text-primary)', color: 'var(--bg-base)',
            border: 'none', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            fontWeight: 600, cursor: checked.length === 0 ? 'not-allowed' : 'pointer',
            opacity: checked.length === 0 ? 0.45 : 1, letterSpacing: '0.05em',
          }}>
          <i className="fa-solid fa-check" style={{ marginRight: 7 }} />
          Xác nhận {checked.length > 0 ? `(${checked.length} sheet)` : ''}
        </button>
      </div>
    )
  }

  // ── Ready: selected sheets header + V-INV picker + preview ──────────────

  const readyStage = stage as ReadyStage
  const { buf, sheets, selectedSheets, parsed, selected } = readyStage
  const allowedChannels = channelsForTemplate(template)

  function filterByTemplate(rows: ImportRow[]) {
    if (!allowedChannels.length) return rows
    return rows.filter(r => rowMatchesTemplate(r.niniAdm, template))
  }

  const allForSelected = selected ? (parsed.rowsByVinv[selected] ?? []) : []
  const allForManual   = manualCode.trim() ? (parsed.rowsByVinv[manualCode.trim()] ?? []) : []
  const activeCode     = selected ?? (manualCode.trim() || null)
  const allActiveRows  = selected ? allForSelected : allForManual
  const activeRows     = filterByTemplate(allActiveRows)
  const skippedRows    = allActiveRows.filter(r => !rowMatchesTemplate(r.niniAdm, template))

  return (
    <div>
      {/* Source header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
        padding: '0.6rem 1rem', marginBottom: '1.25rem',
        background: 'var(--bg-surface)', border: '1px solid var(--border-base)',
      }}>
        <i className="fa-brands fa-google-drive" style={{ color: '#34A853', fontSize: 14 }} />
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260,
        }}>
          {shortUrl(savedUrl ?? '')}
        </span>

        {/* Selected sheet chips */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
          {selectedSheets.map(name => (
            <span key={name} style={{
              padding: '2px 8px',
              background: 'var(--bg-hover)', border: '1px solid var(--border-base)',
              fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 700,
              color: 'var(--text-primary)', borderRadius: 2,
            }}>
              {name}
            </span>
          ))}
        </div>

        {/* Edit selection button */}
        <button
          onClick={() => setStage({ s: 'pickSheet', buf, sheets, checked: [...selectedSheets] })}
          style={{
            background: 'none', border: '1px solid var(--border-base)',
            padding: '3px 10px', cursor: 'pointer',
            fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)',
            whiteSpace: 'nowrap',
          }}>
          <i className="fa-solid fa-pen" style={{ marginRight: 5 }} />Sửa chọn
        </button>
        <button
          onClick={() => setStage({ s: 'idle' })}
          style={{
            background: 'none', border: '1px solid var(--border-base)',
            padding: '3px 10px', cursor: 'pointer',
            fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)',
            whiteSpace: 'nowrap',
          }}>
          <i className="fa-solid fa-arrows-rotate" style={{ marginRight: 5 }} />Đổi nguồn
        </button>
      </div>

      {/* V-INV picker */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{
          fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem',
        }}>
          Chọn mã V-INV cần import
        </div>

        {parsed.vinvOptions.length === 0 ? (
          <div style={{
            padding: '1rem', color: 'var(--text-muted)', fontSize: 'var(--text-sm)',
            background: 'var(--bg-surface)', border: '1px solid var(--border-base)',
          }}>
            Không tìm thấy dòng CH="US" và HIỆN TRẠNG="Đã ship" trong{' '}
            {selectedSheets.length === 1 ? `sheet ${selectedSheets[0]}` : `${selectedSheets.length} sheet đã chọn`}.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {parsed.vinvOptions.map(opt => {
                const isActive   = selected === opt.code
                const matchCount = filterByTemplate(parsed.rowsByVinv[opt.code] ?? []).length
                const hasMatch   = matchCount > 0
                return (
                  <button key={opt.code}
                    onClick={() => {
                      if (!hasMatch) return
                      setStage({ ...readyStage, selected: isActive ? null : opt.code })
                      setManualCode('')
                    }}
                    style={{
                      padding: '6px 14px',
                      border: `1.5px solid ${isActive ? 'var(--text-primary)' : hasMatch ? 'var(--border-base)' : 'var(--border-light)'}`,
                      background: isActive ? 'var(--text-primary)' : 'var(--bg-surface)',
                      color: isActive ? 'var(--text-inverse)' : hasMatch ? 'var(--text-primary)' : 'var(--text-muted)',
                      cursor: hasMatch ? 'pointer' : 'default',
                      fontFamily: 'var(--font-mono)', fontWeight: 700,
                      fontSize: 'var(--text-sm)', borderRadius: 2, transition: 'all 0.1s',
                      opacity: hasMatch ? 1 : 0.45,
                    }}>
                    {opt.code}
                    <span style={{ marginLeft: 6, fontSize: 'var(--text-xs)', fontWeight: 400, opacity: 0.8 }}>
                      {hasMatch ? `(${matchCount} SP)` : `(0/${opt.count})`}
                    </span>
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Hoặc nhập thủ công:</span>
              <input
                value={manualCode}
                onChange={e => {
                  setManualCode(e.target.value.toUpperCase())
                  setStage({ ...readyStage, selected: null })
                }}
                placeholder="P60501"
                style={{
                  border: '1px solid var(--border-base)', background: 'var(--bg-surface)',
                  padding: '5px 10px', fontFamily: 'var(--font-mono)', fontWeight: 600,
                  fontSize: 'var(--text-sm)', width: 140, outline: 'none', color: 'var(--text-primary)',
                }}
              />
              {manualCode.trim() && !parsed.rowsByVinv[manualCode.trim()] && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>
                  Mã "{manualCode.trim()}" không có trong dữ liệu đã chọn
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Preview */}
      {activeCode && activeRows.length > 0 && (
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem',
            padding: '0.5rem 0.75rem', background: 'var(--bg-base)', border: '1px solid var(--border-light)',
            flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              Lọc theo template <strong>{templateLabel(template)}</strong>:
            </span>
            {allowedChannels.map(ch => (
              <span key={ch} style={{
                fontSize: 'var(--text-xs)', fontWeight: 700,
                color: TEMPLATE_COLOR[ch] ?? 'var(--text-secondary)',
                background: `${TEMPLATE_COLOR[ch] ?? '#888'}18`,
                padding: '2px 7px', borderRadius: 2,
              }}>
                {ch}
              </span>
            ))}
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-success)', marginLeft: 'auto' }}>
              ✓ {activeRows.length} SP sẽ import
            </span>
            {skippedRows.length > 0 && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)', opacity: 0.8 }}>
                — bỏ qua {skippedRows.length} SP ({Array.from(new Set(skippedRows.map(r => r.niniAdm).filter(Boolean))).join(', ')})
              </span>
            )}
          </div>

          <PreviewTable rows={activeRows} />

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button
              onClick={() => handleImport(activeRows, readyStage)}
              disabled={locked}
              style={{
                padding: '0.6rem 1.75rem', background: 'var(--text-primary)', color: 'var(--bg-base)',
                border: 'none', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                fontWeight: 600, cursor: locked ? 'not-allowed' : 'pointer',
                letterSpacing: '0.05em', opacity: locked ? 0.5 : 1,
              }}>
              <i className="fa-solid fa-file-import" style={{ marginRight: 7 }} />
              Import {activeRows.length} sản phẩm
            </button>
            <button
              onClick={() => { setStage({ ...readyStage, selected: null }); setManualCode('') }}
              style={{
                padding: '0.6rem 1.25rem', border: '1px solid var(--border-base)',
                background: 'transparent', color: 'var(--text-secondary)',
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', cursor: 'pointer',
              }}>
              Bỏ chọn
            </button>
          </div>
        </div>
      )}

      {activeCode && activeRows.length === 0 && allActiveRows.length > 0 && (
        <div style={{ padding: '1.5rem', border: '1px solid var(--border-base)', background: 'var(--bg-surface)' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: 'var(--text-sm)', color: 'var(--color-danger)' }}>
            Không có sản phẩm nào khớp template <strong>{templateLabel(template)}</strong>
          </div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Mã <strong>{activeCode}</strong> có {allActiveRows.length} SP thuộc kênh:{' '}
            {Array.from(new Set(allActiveRows.map(r => r.niniAdm).filter(Boolean))).join(', ')}.
            <br />
            Template <strong>{templateLabel(template)}</strong> chỉ nhận kênh: {allowedChannels.join(', ') || '(tất cả)'}.
          </div>
        </div>
      )}

      {activeCode && allActiveRows.length === 0 && (
        <div style={{
          padding: '2rem', textAlign: 'center', color: 'var(--text-muted)',
          border: '1px dashed var(--border-base)', fontSize: 'var(--text-sm)',
        }}>
          Mã "{activeCode}" không có dòng "Đã ship" trong dữ liệu đã chọn.
        </div>
      )}

      {!activeCode && parsed.vinvOptions.length > 0 && (
        <div style={{
          padding: '2rem', textAlign: 'center', color: 'var(--text-muted)',
          border: '1px dashed var(--border-base)', fontSize: 'var(--text-sm)',
        }}>
          Chọn mã V-INV ở trên để xem danh sách sản phẩm
        </div>
      )}
    </div>
  )
}
