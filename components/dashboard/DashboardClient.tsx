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

// Returns "YYYY-MM" for a given year+month
function toMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

// Current month as "YYYY-MM"
function currentMonthKey(): string {
  const now = new Date()
  return toMonthKey(now.getFullYear(), now.getMonth() + 1)
}

// Build list of last N months (most recent first)
function buildMonthOptions(n = 18): { key: string; label: string }[] {
  const options: { key: string; label: string }[] = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key   = toMonthKey(d.getFullYear(), d.getMonth() + 1)
    const label = d.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })
    options.push({ key, label })
  }
  return options
}

// Human-readable label for a "YYYY-MM" key
function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })
}

// Navigate month: direction = -1 (prev) or +1 (next)
function shiftMonth(key: string, direction: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + direction, 1)
  return toMonthKey(d.getFullYear(), d.getMonth() + 1)
}

export function DashboardClient() {
  const { user, canDo, loaded }        = useUser()
  const [stats,          setStats]     = useState<Stats | null>(null)
  const [recent,         setRecent]    = useState<any[]>([])
  const [loading,        setLoading]   = useState(true)
  const [selectedMonth,  setSelected]  = useState<string>(currentMonthKey)

  const monthOptions  = buildMonthOptions(18)
  const isCurrentMonth = selectedMonth === currentMonthKey()

  useEffect(() => {
    setLoading(true)
    setStats(null)
    Promise.all([
      fetch(`/api/dashboard/stats?month=${selectedMonth}`).then(r => r.json()),
      fetch('/api/dashboard/recent').then(r => r.json()),
    ]).then(([statsRes, recentRes]) => {
      if (statsRes.success)  setStats(statsRes.data)
      if (recentRes.success) setRecent(recentRes.data)
    }).finally(() => setLoading(false))
  }, [selectedMonth])

  const canSeePrice = canDo('see_prices')
  const name        = loaded ? (user?.fullName?.split(' ').pop() ?? '') : ''

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.5rem' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-3xl)', fontWeight: 400, color: 'var(--text-primary)', margin: 0 }}>
          {loaded ? `${greeting()}, ${name}.` : ' '}
        </h1>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          {formatDate(new Date())}
        </span>
      </div>

      {/* Month selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {/* Prev month */}
        <button
          onClick={() => setSelected(m => shiftMonth(m, -1))}
          disabled={selectedMonth === monthOptions[monthOptions.length - 1].key}
          style={{
            padding: '0.3rem 0.65rem', background: 'var(--bg-surface)',
            border: '1px solid var(--border-base)', borderRadius: 4,
            cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1,
            opacity: selectedMonth === monthOptions[monthOptions.length - 1].key ? 0.35 : 1,
          }}
        >◀</button>

        {/* Dropdown */}
        <select
          value={selectedMonth}
          onChange={e => setSelected(e.target.value)}
          style={{
            padding: '0.3rem 0.6rem', background: 'var(--bg-surface)',
            border: '1px solid var(--border-base)', borderRadius: 4,
            fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)', cursor: 'pointer', outline: 'none',
            minWidth: 160,
          }}
        >
          {monthOptions.map(o => (
            <option key={o.key} value={o.key}>
              {o.label}{o.key === currentMonthKey() ? ' (Tháng này)' : ''}
            </option>
          ))}
        </select>

        {/* Next month */}
        <button
          onClick={() => setSelected(m => shiftMonth(m, +1))}
          disabled={isCurrentMonth}
          style={{
            padding: '0.3rem 0.65rem', background: 'var(--bg-surface)',
            border: '1px solid var(--border-base)', borderRadius: 4,
            cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1,
            opacity: isCurrentMonth ? 0.35 : 1,
          }}
        >▶</button>

        {/* Back to current month shortcut */}
        {!isCurrentMonth && (
          <button
            onClick={() => setSelected(currentMonthKey())}
            style={{
              padding: '0.3rem 0.75rem', background: 'none',
              border: '1px solid var(--border-base)', borderRadius: 4,
              cursor: 'pointer', color: 'var(--text-muted)',
              fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)',
            }}
          >
            Về tháng này
          </button>
        )}
      </div>

      {/* Status + Month counts */}
      <StatCards stats={stats} loading={loading} selectedMonth={selectedMonth} />

      {/* CIF / Items / Template breakdown — manager/admin only */}
      {canSeePrice && <SummaryCards stats={stats} loading={loading} selectedMonth={selectedMonth} />}

      {/* Recent invoices */}
      <RecentInvoices rows={recent} loading={loading} />

      {/* Quick links */}
      {loaded && <QuickLinks role={user?.role ?? 'viewer'} />}
    </div>
  )
}
