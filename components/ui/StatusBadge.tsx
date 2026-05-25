import type { InvoiceStatus } from '@/types'

/* HP UX/UI badge pattern:
 * draft            → outline gray (muted)
 * pending_approval → outline amber
 * approved         → outline green
 * invoiced         → filled black (terminal state)
 */
const STATUS_CONFIG: Record<string, {
  label:   string
  color:   string
  filled?: boolean
}> = {
  draft:            { label: 'Draft',            color: 'var(--text-muted)' },
  pending_approval: { label: 'Pending Approval', color: 'var(--color-warning)' },
  approved:         { label: 'Approved',         color: 'var(--color-success)' },
  invoiced:         { label: 'Invoiced',         color: 'var(--text-primary)', filled: true },
}

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft
  return (
    <span
      style={{
        display:        'inline-block',
        padding:        '2px 10px',
        background:     cfg.filled ? cfg.color : 'transparent',
        color:          cfg.filled ? 'var(--text-inverse)' : cfg.color,
        border:         `1px solid ${cfg.color}`,
        borderRadius:   0,
        fontFamily:     'var(--font-body)',
        fontSize:       '10px',
        fontWeight:     600,
        letterSpacing:  '0.1em',
        textTransform:  'uppercase',
        whiteSpace:     'nowrap',
      }}
    >
      {cfg.label}
    </span>
  )
}
