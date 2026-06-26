'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

interface Stats {
  by_status:           Record<string, number>
  by_template?:        Record<string, number>
  total_items:         number
  month_cif?:          number
  month_invoice_count?: number
}

const STATUS_CARDS = [
  { key: 'draft',     label: 'Draft',     color: '#B45309',           href: '/invoices?status=draft'     },
  { key: 'finalized', label: 'Finalized', color: 'var(--text-primary)', href: '/invoices?status=finalized' },
]

function useCountUp(target: number, active: boolean, duration = 600) {
  const [display, setDisplay] = useState(0)
  const raf   = useRef<number>(0)
  const start = useRef<number>(0)

  useEffect(() => {
    if (!active) return
    start.current = 0
    cancelAnimationFrame(raf.current)
    function step(ts: number) {
      if (!start.current) start.current = ts
      const progress = Math.min((ts - start.current) / duration, 1)
      const eased    = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(target * eased))
      if (progress < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [target, active, duration])

  return display
}

function StatCard({ label, color, target, loading, href, delay }: {
  label: string; color: string; target: number
  loading: boolean; href: string; delay: number
}) {
  const count = useCountUp(target, !loading)
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div
        className="stat-card"
        style={{ padding: '1.5rem 1.5rem 1.25rem', background: 'var(--bg-surface)', height: '100%', transition: 'background 0.18s ease-out', animation: `fadeIn 0.35s ease-out ${delay}ms both` }}
        onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)')}
        onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = 'var(--bg-surface)')}
      >
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color, marginBottom: '0.75rem' }}>
          {label}
        </div>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-3xl)', fontWeight: 400, color: 'var(--text-primary)', lineHeight: 1 }}>
          {loading
            ? <span className="skeleton" style={{ width: 48, height: 36, display: 'inline-block' }} />
            : count.toLocaleString()
          }
        </div>
      </div>
    </Link>
  )
}

function MonthCard({ target, loading, delay, label }: { target: number; loading: boolean; delay: number; label: string }) {
  const count = useCountUp(target, !loading)
  return (
    <div style={{ padding: '1.5rem 1.5rem 1.25rem', background: 'var(--bg-surface)', animation: `fadeIn 0.35s ease-out ${delay}ms both` }}>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-info)', marginBottom: '0.75rem' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-3xl)', fontWeight: 400, color: 'var(--text-primary)', lineHeight: 1 }}>
        {loading
          ? <span className="skeleton" style={{ width: 48, height: 36, display: 'inline-block' }} />
          : count.toLocaleString()
        }
      </div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 6, fontFamily: 'var(--font-body)' }}>invoices created</div>
    </div>
  )
}

function monthDisplayLabel(selectedMonth: string): string {
  const now = new Date()
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  if (selectedMonth === cur) return 'Tháng này'
  const [y, m] = selectedMonth.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })
}

export function StatCards({ stats, loading, selectedMonth }: { stats: Stats | null; loading: boolean; selectedMonth: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1px', background: 'var(--border-light)', border: '1px solid var(--border-light)', marginBottom: '2rem' }}>
      {STATUS_CARDS.map(({ key, label, color, href }, i) => (
        <StatCard
          key={key} label={label} color={color}
          target={stats?.by_status?.[key] ?? 0}
          loading={loading} href={href} delay={i * 60}
        />
      ))}
      <MonthCard
        target={stats?.month_invoice_count ?? 0}
        loading={loading} delay={120}
        label={monthDisplayLabel(selectedMonth)}
      />
    </div>
  )
}
