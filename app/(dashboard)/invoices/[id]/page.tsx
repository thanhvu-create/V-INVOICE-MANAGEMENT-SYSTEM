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

type InvoiceView = 'jm-form' | 'detail'

const ALLOWED_TRANSITIONS: Record<string, Record<string, string[]>> = {
  user:    { draft: ['pending_approval'] },
  manager: { pending_approval: ['approved', 'draft'] },
  admin:   { draft: ['pending_approval'], pending_approval: ['approved', 'draft'], approved: ['invoiced', 'pending_approval'] },
}

export default function InvoiceDetailPage() {
  const { id }          = useParams<{ id: string }>()
  const { user, canDo } = useUser()
  const router          = useRouter()

  const [data,         setData]         = useState<{ header: any; items: any[] } | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [view,         setView]         = useState<InvoiceView>('jm-form')
  const [addItemOpen,  setAddItemOpen]  = useState(false)

  const canSeePrice = canDo('see_prices')
  const canEdit     = canDo('edit')
  const isLocked    = data?.header?.is_locked ?? false
  const availTrans  = ALLOWED_TRANSITIONS[user.role]?.[data?.header?.status ?? ''] ?? []

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/invoices/${id}`)
      const json = await res.json()
      if (json.success) setData(json.data)
      else router.push('/invoices')
    } finally { setLoading(false) }
  }, [id])

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
      {/* Locked banner */}
      {header.is_locked && (
        <div style={{ background: '#1A1814', color: '#FAFAF7', padding: '8px 16px', textAlign: 'center', fontSize: 'var(--text-xs)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '1rem' }}>
          <i className="fa-solid fa-lock" style={{ marginRight: 6 }} />
          Invoiced — This invoice is locked and cannot be modified
        </div>
      )}

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ marginBottom: '0.25rem' }}>
            <a href="/invoices" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: 'var(--text-sm)' }}>← Invoices</a>
          </div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 400, margin: '0 0 0.5rem' }}>
            {header.po_number}
          </h1>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusBadge status={header.status} />
            {header.store && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', border: '1px solid var(--border-base)', padding: '2px 8px' }}>{header.store}</span>}
            {header.mr_number && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>MR: {header.mr_number}</span>}
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Rate: {header.daily_metal_rates?.rate_date ?? '—'}</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Rule: {header.pricing_rules?.name ?? '—'}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {canEdit && !isLocked && (
            <button
              onClick={() => setAddItemOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.45rem 1rem', border: '1px solid var(--border-strong)', background: 'var(--text-primary)', color: 'var(--text-inverse)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)', fontWeight: 600, cursor: 'pointer', borderRadius: 0 }}
            >
              <i className="fa-solid fa-plus" style={{ fontSize: 11 }} /> Add Item
            </button>
          )}
          {canEdit && !isLocked && canDo('import') && (
            <a href={`/import?invoiceId=${id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.45rem 1rem', border: '1px solid var(--border-base)', color: 'var(--text-primary)', textDecoration: 'none', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)' }}>
              <i className="fa-solid fa-file-import" style={{ fontSize: 11 }} /> Import
            </a>
          )}
          <a href={`/api/invoices/${id}/export`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.45rem 1rem', border: '1px solid var(--border-base)', color: 'var(--text-primary)', textDecoration: 'none', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)' }}>
            <i className="fa-solid fa-file-export" style={{ fontSize: 11 }} /> Export
          </a>
          <a href={`/invoices/${id}/print`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.45rem 1rem', border: '1px solid var(--border-base)', color: 'var(--text-primary)', textDecoration: 'none', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)' }}>
            <i className="fa-solid fa-print" style={{ fontSize: 11 }} /> Print
          </a>
        </div>
      </div>

      {/* Workflow bar */}
      {!header.is_locked && availTrans.length > 0 && (
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

      {/* Items */}
      {view === 'jm-form' ? (
        <JMFormView
          invoiceId={id}
          items={items}
          canSeePrice={canSeePrice}
          canEdit={canEdit}
          isLocked={isLocked}
          onRefresh={fetchData}
        />
      ) : (
        <DetailView
          invoiceId={id}
          items={items}
          canSeePrice={canSeePrice}
          canEdit={canEdit}
          isLocked={isLocked}
          onRefresh={fetchData}
        />
      )}

      {/* Add item modal */}
      <AddItemModal
        open={addItemOpen}
        invoiceId={id}
        onClose={() => setAddItemOpen(false)}
        onSaved={fetchData}
      />

      {/* Audit timeline */}
      <AuditTimeline invoiceId={id} />
    </div>
  )
}
