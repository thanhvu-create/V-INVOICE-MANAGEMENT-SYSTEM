'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

interface Stats {
  by_status: Record<string, number>
  total_items: number
  month_cif?: number
  month_invoice_count?: number
}

const STATUS_CARDS = [
  { key: 'draft',            label: 'Draft',            color: 'var(--text-muted)' },
  { key: 'pending_approval', label: 'Pending Approval', color: 'var(--color-warning)' },
  { key: 'approved',         label: 'Approved',         color: 'var(--color-success)' },
  { key: 'invoiced',         label: 'Invoiced',         color: 'var(--text-primary)' },
]

/* Count-up number hook */
function useCountUp(target: number, active: boolean, duration = 600) {
  const [display, setDisplay] = useState(0)
  const raf     = useRef<number>(0)
  const start   = useRef<number>(0)
  const from    = useRef<number>(0)

  useEffect(() => {
    if (!active) return
    from.current  = 0
    start.current = 0
    cancelAnimationFrame(raf.current)

    function step(ts: number) {
      if (!start.current) start.current = ts
      const progress = Math.min((ts - start.current) / duration, 1)
      /* ease-out cubic */
      const eased   = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(from.current + (target - from.current) * eased))
      if (progress < 1) raf.current = requestAnimationFrame(step)
    }

    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [target, active, duration])

  return display
}

function StatCard({
  label, color, target, loading, href, delay,
}: {
  label:   string
  color:   string
  target:  number
  loading: boolean
  href:    string
  delay:   number
}) {
  const count = useCountUp(target, !loading)

  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div
        className="stat-card"
        style={{
          padding:    '1.5rem 1.5rem 1.25rem',
          background: 'var(--bg-surface)',
          height:     '100%',
          transition: 'background 0.18s ease-out',
          animation:  `fadeIn 0.35s ease-out ${delay}ms both`,
        }}
        onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)')}
        onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = 'var(--bg-surface)')}
      >
        {/* Eyebrow */}
        <div style={{
          fontFamily:    'var(--font-body)',
          fontSize:      'var(--text-xs)',
          fontWeight:    600,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color,
          marginBottom:  '0.75rem',
          transition:    'color 0.15s',
        }}>
          {label}
        </div>

        {/* Count */}
        <div style={{
          fontFamily: 'var(--font-heading)',
          fontSize:   'var(--text-3xl)',
          fontWeight: 400,
          color:      'var(--text-primary)',
          lineHeight: 1,
          transition: 'color 0.2s',
        }}>
          {loading
            ? <span className="skeleton" style={{ width: 48, height: 36, display: 'inline-block' }} />
            : count.toLocaleString()
          }
        </div>
      </div>
    </Link>
  )
}

export function StatCards({ stats, loading }: { stats: Stats | null; loading: boolean }) {
  return (
    <div style={{
      display:             'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap:                 '1px',
      background:          'var(--border-light)',
      border:              '1px solid var(--border-light)',
      marginBottom:        '2rem',
    }}>
      {STATUS_CARDS.map(({ key, label, color }, i) => (
        <StatCard
          key={key}
          label={label}
          color={color}
          target={stats?.by_status?.[key] ?? 0}
          loading={loading}
          href={`/invoices?status=${key}`}
          delay={i * 60}
        />
      ))}
    </div>
  )
}
