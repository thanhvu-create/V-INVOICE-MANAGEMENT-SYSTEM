'use client'

import { useEffect, useState, useCallback } from 'react'

export type ToastType = 'success' | 'error' | 'warn' | 'info'

interface ToastItem {
  id:       number
  message:  string
  type:     ToastType
  exiting:  boolean
  duration: number
}

let _add: ((msg: string, type?: ToastType, duration?: number) => void) | null = null

/* Call this anywhere: toast('Invoice approved', 'success') */
/* Pass duration=0 for persistent (no auto-dismiss) */
export function toast(message: string, type: ToastType = 'success', duration = 3500) {
  _add?.(message, type, duration)
}

const ICONS: Record<ToastType, string> = {
  success: 'fa-circle-check',
  error:   'fa-circle-xmark',
  warn:    'fa-triangle-exclamation',
  info:    'fa-circle-info',
}

const COLORS: Record<ToastType, string> = {
  success: 'var(--color-success)',
  error:   'var(--color-danger)',
  warn:    'var(--color-warning)',
  info:    'var(--color-info)',
}

export function ToastProvider() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  let counter = 0

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 220)
  }, [])

  const add = useCallback((message: string, type: ToastType = 'success', duration = 3500) => {
    const id = ++counter
    setToasts(prev => [...prev, { id, message, type, exiting: false, duration }])
    if (duration > 0) setTimeout(() => remove(id), duration)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remove])

  useEffect(() => {
    _add = add
    return () => { _add = null }
  }, [add])

  if (!toasts.length) return null

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`toast toast-${t.type}${t.exiting ? ' toast-exit' : ''}`}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <i
              className={`fa-solid ${ICONS[t.type]}`}
              style={{ color: COLORS[t.type], fontSize: 13, flexShrink: 0 }}
            />
            <span style={{ flex: 1 }}>{t.message}</span>
            <button
              onClick={() => remove(t.id)}
              style={{
                background: 'none',
                border:     'none',
                cursor:     'pointer',
                color:      'var(--text-muted)',
                padding:    '0 0 0 4px',
                fontSize:   11,
                flexShrink: 0,
              }}
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
