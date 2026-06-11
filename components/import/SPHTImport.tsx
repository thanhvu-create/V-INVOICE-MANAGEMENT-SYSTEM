'use client'

import { useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { toast } from '@/components/ui/Toast'
import { DropZone } from '@/components/import/DropZone'
import type { ImportRow } from '@/types'

// ── Column indices in SPHT file ────────────────────────────────────────────
// After header row is found (row where col[0] = "CH"):
// [3]  SKU         [4]  SO        [5]  MO
// [6]  Description [7]  Loại vàng [8]  Qty  [9] Weight(gr)
// [15] Tên khách   [16] Hiện trạng (filter = "Đã ship")  [17] V-INV code

interface VinvOption {
  code:     string
  count:    number
  channels: string[]   // distinct TÊN KHÁCH values
}

interface ParsedSPHT {
  filename:     string
  sheetName:    string
  vinvOptions:  VinvOption[]
  rowsByVinv:   Record<string, ImportRow[]>
}

// ── Parser ─────────────────────────────────────────────────────────────────

function findHeaderRowIndex(rows: any[][]): number {
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    if (String(rows[i]?.[0] ?? '').trim().toUpperCase() === 'CH') return i
  }
  return 0
}

function parseSPHT(file: File): Promise<ParsedSPHT> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = e => {
      try {
        const data     = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb       = XLSX.read(data, { type: 'array' })

        // Prefer sheet whose name starts with "HT", else first sheet
        const sheetName = wb.SheetNames.find(n => /^HT/i.test(n)) ?? wb.SheetNames[0]
        const sheet     = wb.Sheets[sheetName]
        const all: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

        const headerIdx  = findHeaderRowIndex(all)
        const dataRows   = all.slice(headerIdx + 1)

        const rowsByVinv: Record<string, ImportRow[]> = {}

        dataRows.forEach((row, i) => {
          const hientrang = String(row[16] ?? '').trim()
          const vinv      = String(row[17] ?? '').trim()
          if (!vinv || hientrang !== 'Đã ship') return

          const skuRaw = String(row[3] ?? '').trim()
          const soRaw  = String(row[4] ?? '').trim()
          const moRaw  = String(row[5] ?? '').trim()
          const soMo   = soRaw && moRaw ? `SO${soRaw}-MO${moRaw}` : soRaw ? `SO${soRaw}` : ''

          const qty    = parseInt(String(row[8])) || 1
          const wt     = parseFloat(String(row[9])) || 0

          const importRow: ImportRow = {
            rowNum:      headerIdx + 1 + i + 2,   // 1-based Excel row
            store:       '',
            location:    '',
            sku:         skuRaw ? String(Number(skuRaw) || skuRaw).toUpperCase() : `SKU-${i + 1}`,
            soMo,
            description: String(row[6] ?? '').trim(),
            qty,
            weightTotal: wt,
            loaiVang:    String(row[7] ?? '').trim().toUpperCase(),
            class:       String(row[10] ?? '').trim(),
            subClass:    String(row[11] ?? '').trim(),
            niniAdm:     String(row[15] ?? '').trim(),  // TÊN KHÁCH → ghi chú
          }

          if (!rowsByVinv[vinv]) rowsByVinv[vinv] = []
          rowsByVinv[vinv].push(importRow)
        })

        // Build vinvOptions summary
        const vinvOptions: VinvOption[] = Object.entries(rowsByVinv)
          .map(([code, rows]) => ({
            code,
            count:    rows.length,
            channels: Array.from(new Set(rows.map(r => r.niniAdm).filter(Boolean))),
          }))
          .sort((a, b) => a.code.localeCompare(b.code))

        resolve({ filename: file.name, sheetName, vinvOptions, rowsByVinv })
      } catch (err) {
        reject(err)
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

// ── Preview table ──────────────────────────────────────────────────────────

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
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: kenhColor,
                    background: `${kenhColor}18`, padding: '2px 6px', borderRadius: 2 }}>
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

// ── Main component ─────────────────────────────────────────────────────────

interface Props {
  invoiceId: string
  locked:    boolean
  onDone:    (count: number) => void
}

type Stage =
  | { s: 'idle' }
  | { s: 'parsing' }
  | { s: 'ready';   parsed: ParsedSPHT; selected: string | null }
  | { s: 'importing' }

export function SPHTImport({ invoiceId, locked, onDone }: Props) {
  const [stage,   setStage]   = useState<Stage>({ s: 'idle' })
  const [manualCode, setManualCode] = useState('')

  async function handleFile(file: File) {
    setStage({ s: 'parsing' })
    try {
      const parsed = await parseSPHT(file)
      if (parsed.vinvOptions.length === 0) {
        toast('Không tìm thấy dòng nào có HIỆN TRẠNG = "Đã ship" trong file.', 'warn', 5000)
        setStage({ s: 'idle' }); return
      }
      setStage({ s: 'ready', parsed, selected: null })
    } catch (err) {
      toast(`Lỗi đọc file: ${String(err)}`, 'error', 5000)
      setStage({ s: 'idle' })
    }
  }

  async function handleImport(rows: ImportRow[]) {
    setStage({ s: 'importing' })
    try {
      const res  = await fetch('/api/import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ invoiceId, rows }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message || 'Import failed')
      toast(`${rows.length} sản phẩm đã được import.`, 'success')
      onDone(rows.length)
    } catch (err) {
      toast(String(err), 'error', 5000)
      // restore previous stage so user can try again
      setStage(prev => prev.s === 'importing' ? { s: 'idle' } : prev)
    }
  }

  // ── Idle ──
  if (stage.s === 'idle') {
    return (
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)', padding: '2rem' }}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.6 }}>
          Upload file <strong>SPHT NHẬP KHO TỔNG</strong> — hệ thống sẽ tự lọc các dòng <strong>Đã ship</strong>
          và cho bạn chọn mã <strong>V-INV</strong> (P60501, P60503...) để import vào invoice này.
        </div>
        <DropZone onFile={handleFile} disabled={locked} />
      </div>
    )
  }

  // ── Parsing ──
  if (stage.s === 'parsing') {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: 24, display: 'block', marginBottom: '1rem' }} />
        Đang đọc file...
      </div>
    )
  }

  // ── Importing ──
  if (stage.s === 'importing') {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: 24, display: 'block', marginBottom: '1rem' }} />
        Đang import...
      </div>
    )
  }

  // ── Ready: show V-INV picker + preview ──
  const { parsed, selected } = stage
  const previewRows = selected ? (parsed.rowsByVinv[selected] ?? []) : []
  const manualRows  = manualCode.trim()
    ? (parsed.rowsByVinv[manualCode.trim()] ?? [])
    : []
  const activeCode  = selected ?? (manualCode.trim() || null)
  const activeRows  = selected ? previewRows : manualRows

  return (
    <div>
      {/* File info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', padding: '0.75rem 1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}>
        <i className="fa-solid fa-file-excel" style={{ color: '#16a34a', fontSize: 18 }} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{parsed.filename}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Sheet: <strong>{parsed.sheetName}</strong> — {parsed.vinvOptions.length} mã V-INV có hàng "Đã ship"
          </div>
        </div>
        <button onClick={() => { setStage({ s: 'idle' }); setManualCode('') }}
          style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border-base)', padding: '4px 12px', cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
          <i className="fa-solid fa-arrows-rotate" style={{ marginRight: 5 }} />Đổi file
        </button>
      </div>

      {/* V-INV code picker */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
          Chọn mã V-INV cần import
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {parsed.vinvOptions.map(opt => {
            const isActive = selected === opt.code
            return (
              <button
                key={opt.code}
                onClick={() => { setStage({ ...stage, selected: isActive ? null : opt.code }); setManualCode('') }}
                style={{
                  padding: '6px 14px', border: `1.5px solid ${isActive ? 'var(--text-primary)' : 'var(--border-base)'}`,
                  background: isActive ? 'var(--text-primary)' : 'var(--bg-surface)',
                  color: isActive ? 'var(--text-inverse)' : 'var(--text-primary)',
                  cursor: 'pointer', fontFamily: 'var(--font-mono)', fontWeight: 700,
                  fontSize: 'var(--text-sm)', borderRadius: 2, transition: 'all 0.1s',
                }}
              >
                {opt.code}
                <span style={{ marginLeft: 6, fontSize: 'var(--text-xs)', fontWeight: 400, opacity: 0.75 }}>
                  ({opt.count} SP)
                </span>
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Hoặc nhập thủ công:</span>
          <input
            value={manualCode}
            onChange={e => { setManualCode(e.target.value.toUpperCase()); setStage({ ...stage, selected: null }) }}
            placeholder="P60501"
            style={{ border: '1px solid var(--border-base)', background: 'var(--bg-surface)', padding: '5px 10px', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 'var(--text-sm)', width: 140, outline: 'none', color: 'var(--text-primary)' }}
          />
          {manualCode.trim() && !parsed.rowsByVinv[manualCode.trim()] && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>
              Mã "{manualCode.trim()}" không có trong file
            </span>
          )}
        </div>
      </div>

      {/* Preview */}
      {activeCode && activeRows.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-info)' }}>{activeCode}</span>
              {' — '}{activeRows.length} sản phẩm
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              Kênh: {Array.from(new Set(activeRows.map(r => r.niniAdm).filter(Boolean))).join(', ') || '—'}
            </div>
          </div>
          <PreviewTable rows={activeRows} />

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button
              onClick={() => handleImport(activeRows)}
              style={{
                padding: '0.6rem 1.75rem', background: 'var(--text-primary)', color: 'var(--bg-base)',
                border: 'none', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                fontWeight: 600, cursor: 'pointer', letterSpacing: '0.05em',
              }}
            >
              <i className="fa-solid fa-file-import" style={{ marginRight: 7 }} />
              Import {activeRows.length} sản phẩm
            </button>
            <button
              onClick={() => { setStage({ ...stage, selected: null }); setManualCode('') }}
              style={{ padding: '0.6rem 1.25rem', border: '1px solid var(--border-base)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', cursor: 'pointer' }}
            >
              Bỏ chọn
            </button>
          </div>
        </div>
      )}

      {activeCode && activeRows.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-base)', fontSize: 'var(--text-sm)' }}>
          Mã "{activeCode}" không có dòng "Đã ship" trong file.
        </div>
      )}

      {!activeCode && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-base)', fontSize: 'var(--text-sm)' }}>
          Chọn mã V-INV ở trên để xem danh sách sản phẩm
        </div>
      )}
    </div>
  )
}
