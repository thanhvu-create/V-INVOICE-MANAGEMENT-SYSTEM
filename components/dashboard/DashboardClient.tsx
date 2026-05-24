'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@/contexts/UserContext'
import { StatCards } from './StatCards'
import { SummaryCards } from './SummaryCards'
import { RecentInvoices } from './RecentInvoices'
import { QuickLinks } from './QuickLinks'

interface Stats {
  by_status: Record<string, number>
  total_items: number
  month_cif?: number
  month_invoice_count?: number
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export function DashboardClient() {
  const { user } = useUser()
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

  const canSeePrice = user?.role === 'admin' || user?.role === 'manager'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2rem' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-3xl)', fontWeight: 400, color: 'var(--text-primary)', margin: 0 }}>
          {greeting()}, {user?.fullName?.split(' ')[0] ?? ''}.
        </h1>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          {formatDate(new Date())}
        </span>
      </div>

      <StatCards stats={stats} loading={loading} />

      {canSeePrice && <SummaryCards stats={stats} loading={loading} />}

      <RecentInvoices rows={recent} loading={loading} />

      <QuickLinks role={user?.role ?? 'viewer'} />
    </div>
  )
}
