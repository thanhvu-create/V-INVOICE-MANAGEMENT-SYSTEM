'use client'

interface Props {
  open:        boolean
  title:       string
  message:     string
  okText?:     string
  cancelText?: string
  danger?:     boolean
  onOk:        () => void
  onCancel:    () => void
}

export function ConfirmDialog({ open, title, message, okText = 'Confirm', cancelText = 'Cancel', danger = false, onOk, onCancel }: Props) {
  if (!open) return null

  const okStyle: React.CSSProperties = {
    padding: '0.5rem 1.25rem',
    border: `1px solid ${danger ? 'var(--color-danger)' : 'var(--border-strong)'}`,
    background: danger ? 'var(--color-danger)' : 'var(--text-primary)',
    color: 'var(--text-inverse)',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    letterSpacing: '0.05em',
    borderRadius: 0,
  }
  const cancelStyle: React.CSSProperties = {
    padding: '0.5rem 1.25rem',
    border: '1px solid var(--border-base)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-sm)',
    cursor: 'pointer',
    borderRadius: 0,
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,24,20,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onCancel}
    >
      <div
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)', width: 380, padding: '1.5rem' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)', fontWeight: 400, margin: '0 0 0.75rem' }}>
          {title}
        </h3>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '0 0 1.5rem' }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button style={cancelStyle} onClick={onCancel}>{cancelText}</button>
          <button style={okStyle} onClick={onOk}>{okText}</button>
        </div>
      </div>
    </div>
  )
}
