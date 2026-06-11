'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@/contexts/UserContext'
import { StatCards } from './StatCards'
import { SummaryCards } from './SummaryCards'
import { RecentInvoices } from './RecentInvoices'
import { QuickLinks } from './QuickLinks'

interface Stats {
  by_status:            Record<string, number>
  by_template?:         Record<string, number>
  total_items:          number
  month_cif?:           number
  month_invoice_count?: number
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Chào buổi sáng'
  if (h < 18) return 'Chào buổi chiều'
  return 'Chào buổi tối'
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function DashboardClient() {
  const { user, canDo, loaded } = useUser()
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [recent,  setRecent]  = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard/stats').then(r => r.json()),
      fetch('/api/dashboard/recent').then(r => r.json()),
    ]).then(([statsRes, recentRes]) => {
      if (statsRes.success)  setStats(statsRes.data)
      if (recentRes.success) setRecent(recentRes.data)
    }).finally(() => setLoading(false))
  }, [])

  const canSeePrice = canDo('see_prices')
  const name        = loaded ? (user?.fullName?.split(' ').pop() ?? '') : ''

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2rem' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-3xl)', fontWeight: 400, color: 'var(--text-primary)', margin: 0 }}>
          {loaded ? `${greeting()}, ${name}.` : ' '}
        </h1>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          {formatDate(new Date())}
        </span>
      </div>

      {/* Status + Month counts */}
      <StatCards stats={stats} loading={loading} />

      {/* CIF / Items / Template breakdown — manager/admin only */}
      {canSeePrice && <SummaryCards stats={stats} loading={loading} />}

      {/* Recent invoices */}
      <RecentInvoices rows={recent} loading={loading} />

      {/* Quick links */}
      {loaded && <QuickLinks role={user?.role ?? 'viewer'} />}
    </div>
  )
}
