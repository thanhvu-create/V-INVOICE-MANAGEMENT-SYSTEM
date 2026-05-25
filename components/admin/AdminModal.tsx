'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  title:    string
  onClose:  () => void
  children: React.ReactNode
  width?:   number
}

export function AdminModal({ title, onClose, children, width = 520 }: Props) {
  const [mounted, setMounted] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  /* Mount after hydration (portal needs document.body) */
  useEffect(() => {
    setMounted(true)
    /* Lock body scroll */
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  /* Close on Escape */
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!mounted) return null

  return createPortal(
    <div
      ref={overlayRef}
      style={{
        position:        'fixed',
        inset:           0,
        background:      'rgba(42,39,37,0.6)',
        backdropFilter:  'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        zIndex:          9999,
        padding:         '1rem',
        animation:       'fadeIn 0.18s ease-out both',
      }}
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
    >
      <div
        className="modal-dialog"
        style={{
          maxWidth:  width,
          width:     '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          animation: 'slideUpFade 0.22s ease-out both',
        }}
      >
        {/* Modal header */}
        <div style={{
          display:        'flex',
          justifyContent: 'space-between',
          alignItems:     'center',
          padding:        '1.25rem 1.75rem',
          borderBottom:   '1px solid var(--border-light)',
          background:     'var(--bg-muted)',
          position:       'sticky',
          top:            0,
          zIndex:         1,
        }}>
          <h2 style={{
            fontFamily: 'var(--font-heading)',
            fontSize:   'var(--text-xl)',
            fontWeight: 400,
            color:      'var(--text-primary)',
            margin:     0,
          }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border:     'none',
              cursor:     'pointer',
              color:      'var(--text-muted)',
              fontSize:   16,
              lineHeight: 1,
              padding:    6,
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* Modal body */}
        <div style={{ padding: '1.75rem' }}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/* ── Shared style exports for admin form fields ─────────────────────────── */

export const fieldStyle: React.CSSProperties = { marginBottom: '1.25rem' }

export const labelStyle: React.CSSProperties = {
  display:        'block',
  fontFamily:     'var(--font-body)',
  fontSize:       'var(--text-xs)',
  fontWeight:     600,
  letterSpacing:  '0.12em',
  textTransform:  'uppercase',
  color:          'var(--text-muted)',
  marginBottom:   '5px',
}

export const inputStyle: React.CSSProperties = {
  width:        '100%',
  padding:      '7px 10px',
  border:       '1px solid var(--border-base)',
  borderRadius: 0,
  fontFamily:   'var(--font-body)',
  fontSize:     'var(--text-sm)',
  color:        'var(--text-primary)',
  background:   'var(--bg-base)',
  outline:      'none',
  transition:   'border-color 0.15s',
}

export const btnPrimary: React.CSSProperties = {
  padding:        '8px 22px',
  background:     'var(--border-strong)',
  color:          'var(--text-inverse)',
  border:         '1px solid var(--border-strong)',
  fontFamily:     'var(--font-body)',
  fontSize:       'var(--text-xs)',
  fontWeight:     600,
  letterSpacing:  '0.1em',
  textTransform:  'uppercase',
  cursor:         'pointer',
  borderRadius:   0,
  transition:     'background 0.15s, border-color 0.15s',
}

export const btnSecondary: React.CSSProperties = {
  padding:        '7px 18px',
  border:         '1px solid var(--border-base)',
  background:     'transparent',
  color:          'var(--text-secondary)',
  fontFamily:     'var(--font-body)',
  fontSize:       'var(--text-xs)',
  fontWeight:     500,
  letterSpacing:  '0.08em',
  textTransform:  'uppercase',
  cursor:         'pointer',
  borderRadius:   0,
  transition:     'background 0.15s, color 0.15s, border-color 0.15s',
}
