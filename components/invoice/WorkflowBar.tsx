'use client'

import { useState } from 'react'

const STEPS = ['draft', 'pending_approval', 'approved', 'invoiced'] as const
const STEP_LABELS: Record<string, string> = {
  draft: 'Draft', pending_approval: 'Pending', approved: 'Approved', invoiced: 'Invoiced',
}

interface Props {
  invoiceId:            string
  currentStatus:        string
  availableTransitions: string[]
  onTransitioned:       () => void
}

export function WorkflowBar({ invoiceId, currentStatus, availableTransitions, onTransitioned }: Props) {
  const [pending,  setPending]  = useState(false)
  const [note,     setNote]     = useState('')
  const [showNote, setShowNote] = useState(false)
  const [target,   setTarget]   = useState('')
  const [error,    setError]    = useState('')

  const currentIndex = STEPS.indexOf(currentStatus as typeof STEPS[number])

  function initiateTransition(step: string) {
    setTarget(step)
    setNote('')
    setShowNote(true)
    setError('')
  }

  async function confirmTransition() {
    if (!target) return
    setPending(true)
    setError('')
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/status`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ to_status: target, note: note || undefined }),
      })
      const json = await res.json()
      if (!json.success) { setError(json.message); return }
      setShowNote(false)
      setTarget('')
      onTransitioned()
    } finally {
      setPending(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.75rem 0' }}>
        {STEPS.map((step, i) => {
          const isCompleted = i < currentIndex
          const isCurrent   = i === currentIndex
          const canGo       = availableTransitions.includes(step)

          return (
            <div key={step} style={{ display: 'flex', alignItems: 'center', flex: i > 0 ? 1 : undefined }}>
              {i > 0 && (
                <div style={{
                  height: '1px', flex: 1,
                  background: isCompleted ? 'var(--color-success)' : 'var(--border-base)',
                }} />
              )}
              <button
                onClick={() => canGo && initiateTransition(step)}
                disabled={!canGo}
                style={{
                  padding:       '5px 14px',
                  border:        isCurrent ? '1px solid var(--border-strong)' : '1px solid var(--border-base)',
                  borderRadius:  0,
                  background:    isCurrent ? 'var(--text-primary)' : 'transparent',
                  color:         isCurrent ? 'var(--text-inverse)'
                               : isCompleted ? 'var(--color-success)'
                               : canGo ? 'var(--text-secondary)'
                               : 'var(--text-muted)',
                  fontSize:      'var(--text-xs)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontFamily:    'var(--font-body)',
                  fontWeight:    isCurrent ? 600 : 400,
                  cursor:        canGo ? 'pointer' : 'default',
                  whiteSpace:    'nowrap',
                }}
              >
                {isCompleted ? '✓ ' : ''}{STEP_LABELS[step]}
              </button>
            </div>
          )
        })}
      </div>

      {/* Note modal */}
      {showNote && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(26,24,20,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
        }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)', padding: '2rem', width: 440 }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)', fontWeight: 400, marginBottom: '1rem' }}>
              Move to {STEP_LABELS[target]}
            </h3>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Note (optional)
              </label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--border-base)', borderRadius: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', resize: 'vertical', outline: 'none' }}
                placeholder="Add a note for this transition..."
              />
            </div>
            {error && <p style={{ color: 'var(--color-danger)', fontSize: 'var(--text-sm)', marginBottom: '1rem' }}>{error}</p>}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={confirmTransition}
                disabled={pending}
                style={{ padding: '0.5rem 1.5rem', background: 'var(--text-primary)', color: 'var(--bg-base)', border: 'none', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: pending ? 'wait' : 'pointer' }}
              >
                {pending ? 'Processing...' : 'Confirm'}
              </button>
              <button
                onClick={() => { setShowNote(false); setTarget('') }}
                style={{ padding: '0.5rem 1.25rem', border: '1px solid var(--border-base)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
