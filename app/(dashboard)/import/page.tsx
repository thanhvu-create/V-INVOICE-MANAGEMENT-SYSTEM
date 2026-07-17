'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { useUser } from '@/contexts/UserContext'
import { toast } from '@/components/ui/Toast'
import { SPHTImport } from '@/components/import/SPHTImport'

function ImportContent() {
  const { canDo, loaded } = useUser()
  const router    = useRouter()
  const sp        = useSearchParams()
  const invoiceId = sp.get('invoiceId') ?? ''

  const [invoice, setInvoice] = useState<{ invoice_code: string; status: string; template_type: string } | null>(null)

  useEffect(() => {
    if (!invoiceId) return
    fetch(`/api/invoices/${invoiceId}`)
      .then(r => r.json())
      .then(json => {
        if (json.success) setInvoice({
          invoice_code:  json.data.header.invoice_code,
          status:        json.data.header.status,
          template_type: json.data.header.template_type ?? 'CH1',
        })
      })
  }, [invoiceId])

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

      <SPHTImport
        invoiceId={invoiceId}
        template={invoice?.template_type ?? 'CH1'}
        locked={!!locked}
        onDone={(count, gemSummary) => {
          toast(`${count} sản phẩm đã import${gemSummary ? ` · ${gemSummary}` : ''}`, 'success')
          router.push(`/invoices/${invoiceId}`)
        }}
      />
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
