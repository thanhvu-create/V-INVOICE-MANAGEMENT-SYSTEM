'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { WorkflowBar } from '@/components/invoice/WorkflowBar'
import { AuditTimeline } from '@/components/invoice/AuditTimeline'
import { JMFormView } from '@/components/invoice/JMFormView'
import { DetailView } from '@/components/invoice/DetailView'
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

  const [data,            setData]         = useState<{ header: any; items: any[] } | null>(null)
  const [loading,         setLoading]      = useState(true)
  const [view,            setView]         = useState<InvoiceView>('jm-form')
  const [addItemOpen,     setAddItemOpen]  = useState(false)
  const [exportingSheets, setExportingSheets] = useState(false)

  const canSeePrice = canDo('see_prices')
  const isLocked    = data?.header?.status === 'finalized'
  const status      = data?.header?.status ?? ''
  const canEdit     = canDo('edit') && !isLocked
  const availTrans  = ALLOWED_TRANSITIONS[user.role]?.[status] ?? []

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

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/invoices/${id}`)
      const json = await res.json()
      if (json.success) setData(json.data)
      else router.push('/invoices')
    } finally { setLoading(false) }
  }, [id])

  const updateItemInState = useCallback((itemId: string, updatedItem: any) => {
    setData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        items: prev.items.map(item =>
          item.id === itemId ? { ...item, ...updatedItem } : item
        ),
      }
    })
  }, [])

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
        <div style={{ background: '#1A1814', color: '#FAFAF7', padding: '8px 16px', textAlign: 'center', fontSize: 'var(--text-xs)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '1rem' }}>
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
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 400, margin: '0 0 0.5rem' }}>
            {header.invoice_code}
          </h1>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusBadge status={header.status} />
            {header.template_type && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', border: '1px solid var(--border-base)', padding: '2px 8px' }}>{header.template_type}</span>}
            {header.channel && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{header.channel}</span>}
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
          {canEdit && canDo('import') && (
            <a href={`/import?invoiceId=${id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.45rem 1rem', border: '1px solid var(--border-base)', color: 'var(--text-primary)', textDecoration: 'none', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)' }}>
              <i className="fa-solid fa-file-import" style={{ fontSize: 11 }} /> Import
            </a>
          )}
          <div style={{ display: 'inline-flex', alignItems: 'stretch' }}>
            <button
              onClick={handleExportSheets}
              disabled={exportingSheets}
              title="Tạo Google Sheet mới với cấu trúc JM FORM + SUMMARY"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.45rem 1rem', border: '1px solid var(--border-base)', borderRight: 'none', background: 'transparent', color: exportingSheets ? 'var(--text-muted)' : 'var(--text-primary)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)', cursor: exportingSheets ? 'not-allowed' : 'pointer', opacity: exportingSheets ? 0.6 : 1 }}
            >
              {exportingSheets
                ? <><i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: 11 }} /> Đang tạo…</>
                : <><i className="fa-brands fa-google-drive" style={{ fontSize: 11, color: '#34A853' }} /> Google Sheets</>
              }
            </button>
            <ExportFolderConfig />
          </div>
          <a href={`/invoices/${id}/print`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.45rem 1rem', border: '1px solid var(--border-base)', color: 'var(--text-primary)', textDecoration: 'none', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)' }}>
            <i className="fa-solid fa-print" style={{ fontSize: 11 }} /> Print
          </a>
          <XoanUrlConfig template={header.template_type ?? 'CH1'} />
        </div>
      </div>

      {/* Workflow bar (manager/admin only) */}
      {availTrans.length > 0 && (
        <div className="no-print" style={{ marginBottom: '1.5rem' }}>
          <WorkflowBar invoiceId={id} currentStatus={header.status} availableTransitions={availTrans} onTransitioned={fetchData} />
        </div>
      )}

      {/* View toggle */}
      <div className="no-print" style={{ display: 'flex', borderBottom: '1px solid var(--border-base)', marginBottom: '1.5rem' }}>
        {(['jm-form', 'detail'] as const).map(v => (
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
