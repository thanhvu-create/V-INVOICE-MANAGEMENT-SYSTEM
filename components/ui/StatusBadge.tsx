import type { InvoiceStatus } from '@/types'

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  draft:            { label: 'Draft',           bg: 'var(--status-draft-bg)',    color: 'var(--status-draft-text)'    },
  pending_approval: { label: 'Pending Approval', bg: 'var(--status-pending-bg)',  color: 'var(--status-pending-text)'  },
  approved:         { label: 'Approved',         bg: 'var(--status-approved-bg)', color: 'var(--status-approved-text)' },
  invoiced:         { label: 'Invoiced',         bg: 'var(--status-invoiced-bg)', color: 'var(--status-invoiced-text)' },
}

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft
  return (
    <span
      style={{
        display:       'inline-block',
        padding:       '2px 8px',
        background:    cfg.bg,
        color:         cfg.color,
        border:        `1px solid ${cfg.color}`,
        borderRadius:  0,
        fontFamily:    'var(--font-body)',
        fontSize:      '11px',
        fontWeight:    600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        whiteSpace:    'nowrap',
      }}
    >
      {cfg.label}
    </span>
  )
}
