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
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>

        {/* Unified nav strip: ◀ [select] ▶ */}
        <div style={{
          display: 'inline-flex', alignItems: 'stretch',
          border: '1px solid var(--border-base)', background: 'var(--bg-surface)',
          overflow: 'hidden',
        }}>
          {/* Prev */}
          <button
            onClick={() => setSelected(m => shiftMonth(m, -1))}
            disabled={selectedMonth === monthOptions[monthOptions.length - 1].key}
            title="Tháng trước"
            style={{
              padding: '0.4rem 0.7rem',
              background: 'none', border: 'none', borderRight: '1px solid var(--border-base)',
              cursor: selectedMonth === monthOptions[monthOptions.length - 1].key ? 'not-allowed' : 'pointer',
              color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1,
              opacity: selectedMonth === monthOptions[monthOptions.length - 1].key ? 0.3 : 1,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--bg-muted)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
          >&#9664;</button>

          {/* Select */}
          <select
            value={selectedMonth}
            onChange={e => setSelected(e.target.value)}
            style={{
              padding: '0.4rem 0.5rem 0.4rem 0.75rem',
              background: 'transparent', border: 'none', outline: 'none',
              fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)', cursor: 'pointer',
              minWidth: 190, appearance: 'none',
            }}
          >
            {monthOptions.map(o => (
              <option key={o.key} value={o.key}>
                {o.label}{o.key === currentMonthKey() ? ' — Tháng này' : ''}
              </option>
            ))}
          </select>

          {/* Chevron icon for custom select */}
          <span style={{
            display: 'flex', alignItems: 'center', paddingRight: '0.5rem',
            color: 'var(--text-muted)', fontSize: 9, pointerEvents: 'none',
          }}>&#9660;</span>

          {/* Divider */}
          <span style={{ width: 1, background: 'var(--border-base)', flexShrink: 0 }} />

          {/* Next */}
          <button
            onClick={() => setSelected(m => shiftMonth(m, +1))}
            disabled={isCurrentMonth}
            title="Tháng sau"
            style={{
              padding: '0.4rem 0.7rem',
              background: 'none', border: 'none', borderLeft: 'none',
              cursor: isCurrentMonth ? 'not-allowed' : 'pointer',
              color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1,
              opacity: isCurrentMonth ? 0.3 : 1,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--bg-muted)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
          >&#9654;</button>
        </div>

        {/* Back to current month — subtle text link */}
        {!isCurrentMonth && (
          <button
            onClick={() => setSelected(currentMonthKey())}
            style={{
              padding: 0, background: 'none', border: 'none',
              cursor: 'pointer', color: 'var(--text-muted)',
              fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)',
              letterSpacing: '0.06em', textDecoration: 'underline',
              textDecorationColor: 'var(--border-base)',
              textUnderlineOffset: 3,
            }}
          >
            Tháng này →
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
