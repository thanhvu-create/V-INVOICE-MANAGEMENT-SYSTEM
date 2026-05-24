'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { useUser } from '@/contexts/UserContext'
import { FilterBar } from '@/components/invoice/FilterBar'
import { InvoiceTable } from '@/components/invoice/InvoiceTable'
import { Pagination } from '@/components/ui/Pagination'
import type { InvoiceFilters } from '@/types'

export const metadata = { title: 'Invoices — V-Invoice' }

function InvoiceListContent() {
  const { user, canDo } = useUser()
  const router          = useRouter()
  const searchParams    = useSearchParams()

  const [rows,       setRows]       = useState<any[]>([])
  const [total,      setTotal]      = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading,    setLoading]    = useState(false)

  const page    = parseInt(searchParams.get('page') ?? '1')
  const filters: InvoiceFilters = {
    search:   searchParams.get('search')   ?? '',
    status:   searchParams.get('status')   ?? '',
    dateFrom: searchParams.get('dateFrom') ?? '',
    dateTo:   searchParams.get('dateTo')   ?? '',
    rateId:   searchParams.get('rateId')   ?? '',
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(page) })
      if (filters.search)   p.set('search',   filters.search)
      if (filters.status)   p.set('status',   filters.status)
      if (filters.dateFrom) p.set('dateFrom', filters.dateFrom)
      if (filters.dateTo)   p.set('dateTo',   filters.dateTo)

      const res  = await fetch(`/api/invoices?${p}`)
      const json = await res.json()
      if (json.success) {
        setRows(json.data)
        setTotal(json.pagination.total)
        setTotalPages(json.pagination.totalPages)
      }
    } finally {
      setLoading(false)
    }
  }, [searchParams])

  useEffect(() => { fetchData() }, [fetchData])

  function applyFilters(next: InvoiceFilters) {
    const p = new URLSearchParams()
    if (next.search)   p.set('search',   next.search)
    if (next.status)   p.set('status',   next.status)
    if (next.dateFrom) p.set('dateFrom', next.dateFrom)
    if (next.dateTo)   p.set('dateTo',   next.dateTo)
    p.set('page', '1')
    router.push(`/invoices?${p}`)
  }

  async function handleDelete(id: string, po: string) {
    if (!confirm(`Delete invoice "${po}"? This cannot be undone.`)) return
    const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE' })
    const json = await res.json()
    if (json.success) fetchData()
    else alert(json.message)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 400, margin: 0 }}>
          Invoices
        </h1>
        {canDo('create') && (
          <a
            href="/invoices/new"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 1.25rem', background: 'var(--text-primary)', color: 'var(--bg-base)',
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 500,
              letterSpacing: '0.05em', textDecoration: 'none', borderRadius: 0,
            }}
          >
            <i className="fa-solid fa-plus" /> New Invoice
          </a>
        )}
      </div>

      <FilterBar filters={filters} onApply={applyFilters} />

      {!loading && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
          {total.toLocaleString()} invoice{total !== 1 ? 's' : ''}
        </p>
      )}

      <InvoiceTable rows={rows} loading={loading} role={user.role} onDelete={handleDelete} />

      <Pagination
        page={page} totalPages={totalPages} total={total} pageSize={20}
        onPageChange={p => {
          const params = new URLSearchParams(searchParams.toString())
          params.set('page', String(p))
          router.push(`/invoices?${params}`)
        }}
      />
    </div>
  )
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading...</div>}>
      <InvoiceListContent />
    </Suspense>
  )
}
