'use client'

interface Props {
  title:    string
  onClose:  () => void
  children: React.ReactNode
  width?:   number
}

export function AdminModal({ title, onClose, children, width = 480 }: Props) {
  return (
    <div
      className="modal-overlay"
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,24,20,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: '1rem' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal-dialog" style={{ maxWidth: width }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-base)' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)', fontWeight: 400, margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: '1.5rem' }}>{children}</div>
      </div>
    </div>
  )
}

export const fieldStyle: React.CSSProperties = { marginBottom: '1.1rem' }
export const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
  fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
  color: 'var(--text-secondary)', marginBottom: '0.35rem',
}
export const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.6rem', border: '1px solid var(--border-base)',
  borderRadius: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)', background: 'var(--bg-base)', outline: 'none',
}
export const btnPrimary: React.CSSProperties = {
  padding: '0.55rem 1.5rem', background: 'var(--text-primary)', color: 'var(--bg-base)',
  border: 'none', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
  fontWeight: 600, cursor: 'pointer', letterSpacing: '0.05em',
}
export const btnSecondary: React.CSSProperties = {
  padding: '0.55rem 1.1rem', border: '1px solid var(--border-base)', background: 'transparent',
  color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', cursor: 'pointer',
}
