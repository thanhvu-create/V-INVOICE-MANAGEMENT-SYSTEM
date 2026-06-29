'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { WorkflowBar } from '@/components/invoice/WorkflowBar'
import { AuditTimeline } from '@/components/invoice/AuditTimeline'
import { JMFormView } from '@/components/invoice/JMFormView'
import { DetailView } from '@/components/invoice/DetailView'
import { templateLabel, TEMPLATE_LABELS } from '@/lib/templates'
import { AddItemModal } from '@/components/invoice/AddItemModal'
import { XoanUrlConfig } from '@/components/invoice/XoanUrlConfig'
import { ExportFolderConfig } from '@/components/invoice/ExportFolderConfig'

type InvoiceView = 'jm-form' | 'detail'

// New workflow: draft ↔ finalized (manager/admin only)
const ALLOWED_TRANSITIONS: Record<string, Record<string, string[]>> = {
  manager: { draft: ['finalized'] },
  admin:   { draft: ['finalized'], finalized: ['draft'] },
}

export default function InvoiceDetailPage() {
  const { id }          = useParams<{ id: string }>()
  const { user, canDo } = useUser()
  const router          = useRouter()

  useEffect(() => {
    sessionStorage.setItem('lastInvoicePath', `/invoices/${id}`)
  }, [id])

  const cacheKey = `inv_${id}`
  const cached   = typeof window !== 'undefined' ? (() => { try { return JSON.parse(sessionStorage.getItem(cacheKey) ?? 'null') } catch { return null } })() : null

  const [data,            setData]         = useState<{ header: any; items: any[] } | null>(cached)
  const [loading,         setLoading]      = useState(!cached)
  const [view,            setView]         = useState<InvoiceView>('detail')
  const [addItemOpen,     setAddItemOpen]  = useState(false)
  const [exportingSheets, setExportingSheets] = useState(false)
  const [syncingNVL,      setSyncingNVL]      = useState(false)

  // Inline-edit state for invoice_code, invoice_date, and template_type
  const [editingCode,     setEditingCode]     = useState(false)
  const [codeVal,         setCodeVal]         = useState('')
  const [editingDate,     setEditingDate]     = useState(false)
  const [dateVal,         setDateVal]         = useState('')
  const [editingTemplate, setEditingTemplate] = useState(false)
  const [savingField,     setSavingField]     = useState<string | null>(null)

  const canSeePrice   = canDo('see_prices')
  const isLocked      = data?.header?.status === 'finalized'
  const status        = data?.header?.status ?? ''
  const isManagerPlus = user.role === 'manager' || user.role === 'admin'
  // manager/admin can edit even when finalized; regular user/viewer cannot
  const canEdit       = canDo('edit') && (!isLocked || isManagerPlus)
  const availTrans    = ALLOWED_TRANSITIONS[user.role]?.[status] ?? []

  async function patchHeader(fields: Record<string, unknown>) {
    setSavingField(Object.keys(fields)[0])
    try {
      const res  = await fetch(`/api/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      const json = await res.json()
      if (json.success) {
        setData(prev => {
          if (!prev) return prev
          const next = { ...prev, header: { ...prev.header, ...fields } }
          try { sessionStorage.setItem(cacheKey, JSON.stringify(next)) } catch {}
          return next
        })
      } else {
        alert(json.message ?? 'Lỗi khi lưu')
      }
    } catch { alert('Lỗi kết nối') }
    finally { setSavingField(null) }
  }

  async function handleTemplateChange(newTemplate: string) {
    const oldTemplate = data?.header?.template_type ?? 'CH1'
    if (newTemplate === oldTemplate) { setEditingTemplate(false); return }

    // Warn when switching between incompatible families (AG3 ↔ non-AG3)
    const isAG3 = (t: string) => t === 'CH1_AG3' || t === 'VNSI_AG3'
    if (isAG3(oldTemplate) !== isAG3(newTemplate) && items.length > 0) {
      const direction = isAG3(oldTemplate)
        ? 'AG3 → CH1/CH2/ADM: items sẽ không có gems và gia công → giá tính thiếu.'
        : 'CH1/CH2/ADM → AG3: gems và gia công sẽ bị bỏ qua khi tính giá.'
      const ok = confirm(
        `⚠️ Đổi template không tương thích!\n\n${direction}\n\nDữ liệu gốc KHÔNG bị xóa nhưng giá sẽ tính lại theo cấu trúc mới — có thể ra số sai.\n\nTiếp tục?`
      )
      if (!ok) { setEditingTemplate(false); return }
    }

    setSavingField('template_type')
    try {
      const res  = await fetch(`/api/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_type: newTemplate }),
      })
      const json = await res.json()
      if (json.success) {
        await fetchData()  // refetch — all item prices recalculated server-side
      } else {
        alert(json.message ?? 'Lỗi khi đổi template')
      }
    } catch { alert('Lỗi kết nối') }
    finally { setSavingField(null); setEditingTemplate(false) }
  }

  async function handleSyncNVL() {
    if (!confirm('Cập nhật giá NVL mới nhất cho invoice này và tính lại toàn bộ sản phẩm?')) return
    setSyncingNVL(true)
    try {
      const res  = await fetch(`/api/invoices/${id}/sync-nvl`, { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        await fetchData()
        alert(json.message)
      } else {
        alert(json.message ?? 'Không thể sync NVL.')
      }
    } catch {
      alert('Lỗi kết nối.')
    } finally {
      setSyncingNVL(false)
    }
  }

  async function handleExportSheets() {
    setExportingSheets(true)
    try {
      const res  = await fetch(`/api/invoices/${id}/export-sheets`, { method: 'POST' })
      const json = await res.json()
      if (json.success && json.spreadsheetUrl) {
        if (json.warning) alert(json.warning)
        window.open(json.spreadsheetUrl, '_blank')
      } else {
        alert(json.message ?? 'Không thể export lên Google Sheets.')
      }
    } catch {
      alert('Lỗi kết nối.')
    } finally {
      setExportingSheets(false)
    }
  }

  const setDataAndCache = useCallback((d: { header: any; items: any[] } | null) => {
    setData(d)
    if (d) try { sessionStorage.setItem(cacheKey, JSON.stringify(d)) } catch {}
  }, [cacheKey])

  const fetchData = useCallback(async () => {
    try {
      const res  = await fetch(`/api/invoices/${id}`)
      const json = await res.json()
      if (json.success) setDataAndCache(json.data)
      else router.push('/invoices')
    } finally { setLoading(false) }
  }, [id, setDataAndCache])

  const updateItemInState = useCallback((itemId: string, updatedItem: any) => {
    setData(prev => {
      if (!prev) return prev
      const next = {
        ...prev,
        items: prev.items.map(item =>
          item.id === itemId ? { ...item, ...updatedItem } : item
        ),
      }
      try { sessionStorage.setItem(cacheKey, JSON.stringify(next)) } catch {}
      return next
    })
  }, [cacheKey])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return (
    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
      <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 8 }} />Loading...
    </div>
  )
  if (!data) return null

  const { header, items } = data

  return (
    <div>
      {/* Finalized banner */}
      {isLocked && (
        <div style={{ background: '#e91d79', color: '#FAFAF7', padding: '8px 16px', textAlign: 'center', fontSize: 'var(--text-xs)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '1rem' }}>
          <i className="fa-solid fa-lock" style={{ marginRight: 6 }} />
          Finalized — This invoice is locked and cannot be modified
        </div>
      )}

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ marginBottom: '0.25rem' }}>
            <a href="/invoices" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: 'var(--text-sm)' }}>← Invoices</a>
          </div>

          {/* Invoice Code — inline edit */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.4rem' }}>
            {editingCode ? (
              <form
                onSubmit={async e => {
                  e.preventDefault()
                  const v = codeVal.trim().toUpperCase()
                  if (v && v !== header.invoice_code) await patchHeader({ invoice_code: v })
                  setEditingCode(false)
                }}
                onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setEditingCode(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <input
                  autoFocus
                  value={codeVal}
                  onChange={e => setCodeVal(e.target.value)}
                  style={{
                    fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 400,
                    border: 'none', borderBottom: '2px solid var(--text-primary)',
                    background: 'transparent', outline: 'none', padding: '0 2px',
                    width: `${Math.max(8, codeVal.length + 2)}ch`,
                    color: 'var(--text-primary)', textTransform: 'uppercase',
                  }}
                />
                <button type="submit" disabled={!!savingField} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, padding: 4 }}>
                  {savingField === 'invoice_code' ? '...' : '✓'}
                </button>
              </form>
            ) : (
              <>
                <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 400, margin: 0 }}>
                  {header.invoice_code}
                </h1>
                {canEdit && (
                  <button
                    onClick={() => { setCodeVal(header.invoice_code ?? ''); setEditingCode(true) }}
                    title="Đổi Invoice Code"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, padding: '2px 4px', opacity: 0.6 }}
                  >
                    <i className="fa-regular fa-pen-to-square" />
                  </button>
                )}
              </>
            )}
          </div>

          {/* Status + Template + Invoice Date */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusBadge status={header.status} />
            {header.template_type && (
              editingTemplate ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <select
                    autoFocus
                    defaultValue={header.template_type}
                    onChange={e => handleTemplateChange(e.target.value)}
                    onBlur={() => setEditingTemplate(false)}
                    disabled={savingField === 'template_type'}
                    style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', border: '1px solid var(--border-strong)', background: 'var(--bg-surface)', color: 'var(--text-primary)', padding: '2px 6px', outline: 'none', cursor: 'pointer' }}
                  >
                    {Object.entries(TEMPLATE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                  {savingField === 'template_type' && (
                    <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: 10, color: 'var(--text-muted)' }} />
                  )}
                </div>
              ) : (
                <span
                  onClick={canEdit ? () => setEditingTemplate(true) : undefined}
                  title={canEdit ? 'Click để đổi template — sẽ tính lại giá toàn bộ SP' : undefined}
                  style={{
                    fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
                    border: `1px ${canEdit ? 'dashed' : 'solid'} var(--border-base)`,
                    padding: '2px 8px',
                    cursor: canEdit ? 'pointer' : 'default',
                  }}
                >
                  {templateLabel(header.template_type)}
                  {canEdit && <i className="fa-regular fa-pen-to-square" style={{ marginLeft: 5, opacity: 0.5, fontSize: 9 }} />}
                </span>
              )
            )}

            {/* Invoice Date — inline edit */}
            {editingDate ? (
              <form
                onSubmit={async e => {
                  e.preventDefault()
                  if (dateVal) await patchHeader({ invoice_date: dateVal })
                  setEditingDate(false)
                }}
                onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setEditingDate(false) }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <input
                  autoFocus type="date"
                  value={dateVal}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={e => setDateVal(e.target.value)}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
                    border: 'none', borderBottom: '1px solid var(--border-base)',
                    background: 'transparent', outline: 'none', padding: '1px 2px',
                    color: 'var(--text-secondary)',
                  }}
                />
                <button type="submit" disabled={!!savingField} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 10, padding: 2 }}>
                  {savingField === 'invoice_date' ? '...' : '✓'}
                </button>
              </form>
            ) : (
              <span
                onClick={canEdit ? () => { setDateVal(header.invoice_date ?? ''); setEditingDate(true) } : undefined}
                title={canEdit ? 'Đổi ngày invoice' : undefined}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
                  cursor: canEdit ? 'pointer' : 'default',
                  borderBottom: canEdit ? '1px dashed var(--border-base)' : 'none',
                }}
              >
                {(header.invoice_date ?? header.created_at)?.slice(0, 10)}
                {canEdit && <i className="fa-regular fa-pen-to-square" style={{ marginLeft: 5, opacity: 0.5, fontSize: 10 }} />}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {canEdit && (
            <button
              onClick={() => setAddItemOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.45rem 1rem', border: '1px solid var(--border-strong)', background: 'var(--text-primary)', color: 'var(--text-inverse)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)', fontWeight: 600, cursor: 'pointer', borderRadius: 0 }}
            >
              <i className="fa-solid fa-plus" style={{ fontSize: 11 }} /> Add Item
            </button>
          )}
          {/* Secondary actions — icon-only on narrow screens */}
          {canEdit && canDo('import') && (
            <a href={`/import?invoiceId=${id}`} title="Import items from Excel" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.45rem 0.75rem', border: '1px solid var(--border-base)', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}>
              <i className="fa-solid fa-file-import" style={{ fontSize: 12 }} />
            </a>
          )}
          {canEdit && (
            <button
              onClick={handleSyncNVL}
              disabled={syncingNVL}
              title="Sync NVL — cập nhật giá mới nhất và tính lại"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0.45rem 0.75rem', border: '1px solid var(--border-base)', background: 'transparent', color: syncingNVL ? 'var(--text-muted)' : 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)', cursor: syncingNVL ? 'not-allowed' : 'pointer', opacity: syncingNVL ? 0.6 : 1 }}
            >
              <i className={`fa-solid ${syncingNVL ? 'fa-circle-notch fa-spin' : 'fa-rotate'}`} style={{ fontSize: 12 }} />
            </button>
          )}
          <div style={{ display: 'inline-flex', alignItems: 'stretch' }}>
            <button
              onClick={handleExportSheets}
              disabled={exportingSheets}
              title="Export lên Google Sheets"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.45rem 0.75rem', border: '1px solid var(--border-base)', borderRight: 'none', background: 'transparent', color: exportingSheets ? 'var(--text-muted)' : 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)', cursor: exportingSheets ? 'not-allowed' : 'pointer', opacity: exportingSheets ? 0.6 : 1 }}
            >
              <i className={`${exportingSheets ? 'fa-solid fa-circle-notch fa-spin' : 'fa-brands fa-google-drive'}`} style={{ fontSize: 12, color: exportingSheets ? undefined : '#34A853' }} />
            </button>
            <ExportFolderConfig />
          </div>
          <XoanUrlConfig template={header.template_type ?? 'CH1'} />
        </div>
      </div>

      {/* NVL Info Strip */}
      {canSeePrice && header.nvl_gold_24k != null && (
        <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.5rem', padding: '8px 14px', marginBottom: '1rem', background: 'var(--bg-base)', border: '1px solid var(--border-light)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginRight: 4 }}>NVL Snapshot</span>
          <span>Au: <b style={{ color: 'var(--text-primary)' }}>${Number(header.nvl_gold_24k).toLocaleString()}</b>/oz</span>
          {header.nvl_pt_price != null && <span>Pt: <b>${Number(header.nvl_pt_price).toLocaleString()}</b></span>}
          {header.nvl_ag_price != null && <span>Ag: <b>${Number(header.nvl_ag_price).toLocaleString()}</b></span>}
          <span>Loss: <b>{((header.nvl_loss_gold ?? 0.06) * 100).toFixed(0)}%</b></span>
          <span>Loss Pt: <b>{((header.nvl_loss_pt ?? 0.17) * 100).toFixed(0)}%</b></span>
          {header.nvl_cif_rate != null && <span>CIF: <b>{(header.nvl_cif_rate * 100).toFixed(0)}%</b></span>}
        </div>
      )}

      {/* Workflow bar (manager/admin only) */}
      {availTrans.length > 0 && (
        <div className="no-print" style={{ marginBottom: '1.5rem' }}>
          <WorkflowBar invoiceId={id} currentStatus={header.status} availableTransitions={availTrans} onTransitioned={fetchData} />
        </div>
      )}

      {/* View toggle */}
      <div className="no-print" style={{ display: 'flex', borderBottom: '1px solid var(--border-base)', marginBottom: '1.5rem' }}>
        {(['detail', 'jm-form'] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            padding: '10px 24px', border: 'none', background: 'transparent',
            borderBottom: view === v ? '2px solid var(--border-strong)' : '2px solid transparent',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: view === v ? 600 : 400,
            textTransform: 'uppercase', letterSpacing: '0.1em',
            color: view === v ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: 'pointer',
          }}>
            {v === 'jm-form' ? (
              <><i className="fa-solid fa-table" style={{ marginRight: 6 }} />JM Form View</>
            ) : (
              <><i className="fa-solid fa-list" style={{ marginRight: 6 }} />Detail View</>
            )}
          </button>
        ))}
      </div>

      {view === 'jm-form' ? (
        <JMFormView
          invoiceId={id}
          items={items}
          canSeePrice={canSeePrice}
          canEdit={canEdit}
          isLocked={isLocked}
          template={header.template_type ?? 'CH1'}
          onRefresh={fetchData}
          onItemUpdate={updateItemInState}
        />
      ) : (
        <DetailView
          invoiceId={id}
          items={items}
          canSeePrice={canSeePrice}
          canEdit={canEdit}
          isLocked={isLocked}
          template={header.template_type ?? 'CH1'}
          onRefresh={fetchData}
          onItemUpdate={updateItemInState}
        />
      )}

      <AddItemModal
        open={addItemOpen}
        invoiceId={id}
        template={data?.header?.template_type}
        onClose={() => setAddItemOpen(false)}
        onSaved={fetchData}
      />

      <AuditTimeline invoiceId={id} />
    </div>
  )
}
