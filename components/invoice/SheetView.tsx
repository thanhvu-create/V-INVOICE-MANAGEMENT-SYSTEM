'use client'

import { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'

// Renders the REAL exported spreadsheet, in-browser, without saving any file:
// it fetches /export (which builds an .xlsx in memory and returns it — nothing
// is persisted), then renders each worksheet faithfully via SheetJS sheet_to_html
// (merged cells preserved). "Chốt" then creates the persistent Google Sheet on Drive.

interface Props {
  invoiceId:     string
  onSaveToDrive: () => void          // creates the Google Sheet on Drive (export-sheets)
  savingToDrive?: boolean
}

// sheet_to_html returns a full HTML document; keep only the <table>.
function tableOnly(html: string): string {
  const m = html.match(/<table[\s\S]*?<\/table>/i)
  return m ? m[0] : html
}

export function SheetView({ invoiceId, onSaveToDrive, savingToDrive }: Props) {
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [sheets,  setSheets]  = useState<{ name: string; html: string }[]>([])
  const [active,  setActive]  = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/export`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.message ?? `HTTP ${res.status}`)
      }
      const wb  = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: 'array' })
      const out = wb.SheetNames.map(name => ({
        name,
        html: tableOnly(XLSX.utils.sheet_to_html(wb.Sheets[name])),
      }))
      setSheets(out)
      setActive(0)
    } catch (e) {
      setError(String(e))
      setSheets([])
    } finally {
      setLoading(false)
    }
  }, [invoiceId])

  useEffect(() => { load() }, [load])

  const btn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
    border: '1px solid var(--border-base)', background: 'transparent', cursor: 'pointer',
    fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
  }

  return (
    <div>
      {/* Scoped styling for the SheetJS-rendered table */}
      <style>{`
        .xlsx-preview table { border-collapse: collapse; font-family: var(--font-mono); font-size: 12px; }
        .xlsx-preview td, .xlsx-preview th {
          border: 1px solid var(--border-base); padding: 4px 8px;
          white-space: nowrap; text-align: left; vertical-align: middle;
        }
        .xlsx-preview tr:first-child td { background: var(--bg-base); font-weight: 600; }
      `}</style>

      {/* Action bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '0.6rem 0.85rem', marginBottom: '0.75rem',
        background: 'var(--bg-surface)', border: '1px solid var(--border-base)',
      }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          <i className="fa-solid fa-eye" style={{ marginRight: 6 }} />
          Xem trước file thật — <strong style={{ color: 'var(--text-secondary)' }}>chưa tạo/lưu file nào</strong>
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={load} disabled={loading} style={btn} title="Tải lại từ dữ liệu mới nhất">
            <i className={`fa-solid ${loading ? 'fa-circle-notch fa-spin' : 'fa-rotate-right'}`} style={{ fontSize: 11 }} />
            Tải lại
          </button>
          <button
            onClick={onSaveToDrive}
            disabled={!!savingToDrive}
            title="Chốt — tạo Google Sheet trên Drive"
            style={{
              ...btn,
              border: '1px solid var(--border-strong)',
              background: 'var(--text-primary)', color: 'var(--text-inverse)', fontWeight: 600,
              cursor: savingToDrive ? 'not-allowed' : 'pointer', opacity: savingToDrive ? 0.6 : 1,
            }}
          >
            <i className={`fa-solid ${savingToDrive ? 'fa-circle-notch fa-spin' : 'fa-check'}`} style={{ fontSize: 11 }} />
            Chốt · Lưu lên Google Drive
          </button>
        </div>
      </div>

      {/* Sheet tab selector (the xlsx has "Invoice" + "Info") */}
      {sheets.length > 1 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: '0.5rem' }}>
          {sheets.map((s, i) => (
            <button key={s.name} onClick={() => setActive(i)}
              style={{
                padding: '4px 12px', border: '1px solid var(--border-base)', cursor: 'pointer',
                background: i === active ? 'var(--text-primary)' : 'transparent',
                color: i === active ? 'var(--text-inverse)' : 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: i === active ? 700 : 400,
              }}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 8 }} />Đang dựng file xem trước…
        </div>
      ) : error ? (
        <div style={{ padding: '1.5rem', color: 'var(--color-danger)', border: '1px solid var(--border-base)', fontSize: 'var(--text-sm)' }}>
          Không tạo được xem trước: {error}
          <button onClick={load} style={{ ...btn, marginLeft: 10 }}>Thử lại</button>
        </div>
      ) : sheets.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-base)' }}>
          Chưa có dữ liệu để xem.
        </div>
      ) : (
        <div className="xlsx-preview" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', border: '1px solid var(--border-light)' }}
          dangerouslySetInnerHTML={{ __html: sheets[active]?.html ?? '' }} />
      )}
    </div>
  )
}
