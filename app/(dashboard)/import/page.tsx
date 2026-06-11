'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import * as XLSX from 'xlsx'
import { useUser } from '@/contexts/UserContext'
import { toast } from '@/components/ui/Toast'
import { DropZone } from '@/components/import/DropZone'
import { ImportPreview } from '@/components/import/ImportPreview'
import { ImportErrorTable } from '@/components/import/ImportErrorTable'
import { SPHTImport } from '@/components/import/SPHTImport'
import type { ImportRow, ValidationError } from '@/types'

type ImportMode = 'template' | 'spht'

type Stage =
  | { stage: 'idle' }
  | { stage: 'parsing'; filename: string }
  | { stage: 'preview'; valid: ImportRow[]; errors: ValidationError[]; filename: string }
  | { stage: 'importing'; progress: number; total: number }
  | { stage: 'done'; imported: number }
  | { stage: 'error'; message: string }

function parseExcelFile(file: File): Promise<any[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const data     = new Uint8Array(e.target!.result as ArrayBuffer)
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet    = workbook.Sheets[workbook.SheetNames[0]]
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false })
      resolve(rows.slice(1))
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

async function validateRows(rows: any[][]): Promise<{ valid: ImportRow[]; errors: ValidationError[] }> {
  const valid: ImportRow[]        = []
  const errors: ValidationError[] = []

  // Column layout (new SPHT-based template):
  // 0:store  1:location  2:sku  3:so_mo  4:description  5:loai_vang
  // 6:qt_pcs  7:wt_gr  8:class  9:sub_class  10:nini_adm

  rows.forEach((row, idx) => {
    const rowNum = idx + 2
    const sku    = String(row[2] || '').trim().toUpperCase()
    if (!sku && !row[3] && !row[6]) return

    if (!sku) { errors.push({ row: rowNum, sku: '(empty)', message: 'SKU is required' }); return }

    const qty = parseInt(String(row[6] || '0'))
    if (isNaN(qty) || qty < 1) { errors.push({ row: rowNum, sku, message: 'Qty must be ≥ 1' }); return }

    const wt = parseFloat(String(row[7] || '0'))

    valid.push({
      rowNum,
      store:       String(row[0]  || '').trim(),
      location:    String(row[1]  || '').trim(),
      sku,
      soMo:        String(row[3]  || '').trim(),
      description: String(row[4]  || '').trim(),
      loaiVang:    String(row[5]  || '').trim(),
      qty,
      weightTotal: isNaN(wt) ? 0 : wt,
      class:       String(row[8]  || '').trim(),
      subClass:    String(row[9]  || '').trim(),
      niniAdm:     String(row[10] || '').trim(),
    })
  })

  return { valid, errors }
}

function ImportContent() {
  const { canDo, loaded } = useUser()
  const router    = useRouter()
  const sp        = useSearchParams()
  const invoiceId = sp.get('invoiceId') ?? ''

  const [mode,    setMode]    = useState<ImportMode>('template')
  const [state,   setState]   = useState<Stage>({ stage: 'idle' })
  const [invoice, setInvoice] = useState<{ invoice_code: string; status: string } | null>(null)

  useEffect(() => {
    if (!invoiceId) return
    fetch(`/api/invoices/${invoiceId}`)
      .then(r => r.json())
      .then(json => {
        if (json.success) setInvoice({ invoice_code: json.data.header.invoice_code, status: json.data.header.status })
      })
  }, [invoiceId])

  async function handleFile(file: File) {
    setState({ stage: 'parsing', filename: file.name })
    try {
      const rows   = await parseExcelFile(file)
      const result = await validateRows(rows)
      setState({ stage: 'preview', ...result, filename: file.name })
    } catch (err) {
      setState({ stage: 'error', message: String(err) })
    }
  }

  async function handleImport() {
    if (state.stage !== 'preview') return
    const { valid, errors } = state
    const hadErrors = errors.length > 0
    setState({ stage: 'importing', progress: 0, total: valid.length })

    const res  = await fetch('/api/import', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ invoiceId, rows: valid }),
    })
    const json = await res.json()

    if (!json.success) {
      setState({ stage: 'error', message: json.message })
      toast(json.message || 'Import failed. Please try again.', 'error')
      return
    }

    const imported = json.data.imported
    setState({ stage: 'done', imported })
    const hardErrors = errors.filter(e => !e.warn)
    const warnings   = errors.filter(e =>  e.warn)
    if (hardErrors.length > 0) {
      toast(`${imported} items imported. ${hardErrors.length} row${hardErrors.length !== 1 ? 's' : ''} skipped.`, 'warn', 5000)
    } else if (warnings.length > 0) {
      toast(`${imported} items imported. ${warnings.length} SKU${warnings.length !== 1 ? 's' : ''} not in catalog — fees set to 0.`, 'warn', 6000)
    } else {
      toast(`${imported} item${imported !== 1 ? 's' : ''} imported successfully.`, 'success')
    }
  }

  if (!loaded) return <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
  if (!canDo('import')) {
    return <p style={{ color: 'var(--color-danger)' }}>You don't have permission to import.</p>
  }

  if (!invoiceId) {
    return <p style={{ color: 'var(--color-danger)' }}>No invoice selected. Go to an invoice and click Import.</p>
  }

  const locked = invoice?.status === 'finalized'

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        {invoice && (
          <a href={`/invoices/${invoiceId}`} style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: 'var(--text-sm)' }}>
            ← Invoice {invoice.invoice_code}
          </a>
        )}
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 400, margin: '0.25rem 0 0' }}>
          Import Items
        </h1>
      </div>

      {locked && (
        <div style={{ background: '#1A1814', color: '#FAFAF7', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: 'var(--text-sm)' }}>
          🔒 This invoice is locked and cannot accept imports.
        </div>
      )}

      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: '1.5rem', borderBottom: '2px solid var(--border-base)' }}>
        {([
          { key: 'template', label: 'Template Import', icon: 'fa-table' },
          { key: 'spht',     label: 'SPHT Nhập Kho',   icon: 'fa-file-excel' },
        ] as { key: ImportMode; label: string; icon: string }[]).map(tab => {
          const active = mode === tab.key
          return (
            <button key={tab.key} onClick={() => setMode(tab.key)}
              style={{
                padding: '0.6rem 1.25rem', border: 'none', background: 'transparent', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: active ? 700 : 400,
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                borderBottom: `2px solid ${active ? 'var(--text-primary)' : 'transparent'}`,
                marginBottom: -2, transition: 'all 0.1s',
                letterSpacing: '0.04em',
              }}>
              <i className={`fa-solid ${tab.icon}`} style={{ marginRight: 6, fontSize: 12 }} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* SPHT mode */}
      {mode === 'spht' && (
        <SPHTImport
          invoiceId={invoiceId}
          locked={!!locked}
          onDone={count => {
            toast(`${count} sản phẩm đã import từ SPHT.`, 'success')
            router.push(`/invoices/${invoiceId}`)
          }}
        />
      )}

      {mode === 'template' && <>
      {/* IDLE */}
      {state.stage === 'idle' && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)', padding: '2rem' }}>
          <DropZone onFile={handleFile} disabled={!!locked} />
          <div style={{ marginTop: '1rem', textAlign: 'center' }}>
            <a
              href="/api/export/template"
              style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', textDecoration: 'underline', fontFamily: 'var(--font-body)' }}
            >
              <i className="fa-solid fa-download" style={{ marginRight: 5 }} />
              Download blank template
            </a>
          </div>
        </div>
      )}

      {/* PARSING */}
      {state.stage === 'parsing' && (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: 24, display: 'block', marginBottom: '1rem' }} />
          Parsing {state.filename}...
        </div>
      )}

      {/* PREVIEW */}
      {state.stage === 'preview' && (
        <div>
          {/* Summary */}
          <div style={{ padding: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-base)', marginBottom: '1rem', display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-success)' }}>
                ✓ {state.valid.length} valid row{state.valid.length !== 1 ? 's' : ''}
              </span>
            </div>
            {state.errors.length > 0 && (
              <div>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-danger)' }}>
                  ✗ {state.errors.length} row{state.errors.length !== 1 ? 's' : ''} with errors
                </span>
              </div>
            )}
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {state.filename}
            </span>
          </div>

          {/* Valid rows preview */}
          {state.valid.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                Valid Rows
              </p>
              <ImportPreview rows={state.valid} />
            </div>
          )}

          {/* Errors */}
          <ImportErrorTable errors={state.errors} />

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
            {state.valid.length > 0 && (
              <button
                onClick={handleImport}
                style={{
                  padding: '0.6rem 1.75rem', background: 'var(--text-primary)', color: 'var(--bg-base)',
                  border: 'none', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                  fontWeight: 600, cursor: 'pointer', letterSpacing: '0.05em',
                }}
              >
                Import {state.valid.length} Row{state.valid.length !== 1 ? 's' : ''}
              </button>
            )}
            <button
              onClick={() => setState({ stage: 'idle' })}
              style={{
                padding: '0.6rem 1.25rem', border: '1px solid var(--border-base)',
                background: 'transparent', color: 'var(--text-secondary)',
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* IMPORTING */}
      {state.stage === 'importing' && (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: 24, display: 'block', marginBottom: '1rem' }} />
          Importing {state.total} rows...
        </div>
      )}

      {/* DONE */}
      {state.stage === 'done' && (
        <div style={{ padding: '2rem', background: 'var(--bg-surface)', border: '1px solid var(--border-base)', textAlign: 'center' }}>
          <i className="fa-solid fa-circle-check" style={{ fontSize: 40, color: 'var(--color-success)', display: 'block', marginBottom: '1rem' }} />
          <p style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)', marginBottom: '0.5rem' }}>
            {state.imported} items imported successfully
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1.5rem' }}>
            <a
              href={`/invoices/${invoiceId}`}
              style={{ padding: '0.5rem 1.5rem', background: 'var(--text-primary)', color: 'var(--bg-base)', textDecoration: 'none', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600 }}
            >
              View Invoice
            </a>
            <button
              onClick={() => setState({ stage: 'idle' })}
              style={{ padding: '0.5rem 1.25rem', border: '1px solid var(--border-base)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', cursor: 'pointer' }}
            >
              Import More
            </button>
          </div>
        </div>
      )}

      {/* ERROR */}
      {state.stage === 'error' && (
        <div style={{ padding: '2rem', background: 'var(--bg-surface)', border: '1px solid var(--color-danger)', textAlign: 'center' }}>
          <i className="fa-solid fa-circle-exclamation" style={{ fontSize: 32, color: 'var(--color-danger)', display: 'block', marginBottom: '1rem' }} />
          <p style={{ color: 'var(--color-danger)', marginBottom: '1.5rem', fontSize: 'var(--text-sm)' }}>{state.message}</p>
          <button
            onClick={() => setState({ stage: 'idle' })}
            style={{ padding: '0.5rem 1.5rem', background: 'var(--text-primary)', color: 'var(--bg-base)', border: 'none', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', cursor: 'pointer' }}
          >
            Try Again
          </button>
        </div>
      )}
      </>}
    </div>
  )
}

export default function ImportPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading...</div>}>
      <ImportContent />
    </Suspense>
  )
}
