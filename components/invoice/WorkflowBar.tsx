'use client'

import { useState } from 'react'

const STEPS = ['draft', 'pending_approval', 'approved', 'invoiced'] as const

const STEP_LABELS: Record<string, string> = {
  draft:            'Draft',
  pending_approval: 'Pending',
  approved:         'Approved',
  invoiced:         'Invoiced',
}

function getActionLabel(from: string, to: string): string {
  if (from === 'draft'            && to === 'pending_approval') return 'Submit for Approval'
  if (from === 'pending_approval' && to === 'approved')         return 'Approve'
  if (from === 'pending_approval' && to === 'draft')            return 'Return to Draft'
  if (from === 'approved'         && to === 'invoiced')         return 'Mark as Invoiced'
  if (from === 'approved'         && to === 'pending_approval') return 'Return for Review'
  return to.replace(/_/g, ' ')
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

  const isReturnAction = target === 'draft' || target === 'pending_approval'

  return (
    <div className="workflow-bar-wrap">

      {/* Step indicators */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingBottom: '0.75rem' }}>
        {STEPS.map((step, i) => {
          const isCompleted = i < currentIndex
          const isCurrent   = i === currentIndex
          const canGo       = availableTransitions.includes(step)

          return (
            <div key={step} style={{ display: 'flex', alignItems: 'center', flex: i > 0 ? 1 : undefined }}>
              {i > 0 && (
                <div style={{
                  height:     '1px',
                  flex:       1,
                  background: isCompleted ? 'var(--color-success)' : 'var(--border-base)',
                  margin:     '0 4px',
                }} />
              )}
              <button
                onClick={() => canGo && initiateTransition(step)}
                disabled={!canGo}
                title={canGo ? `Move to ${STEP_LABELS[step]}` : undefined}
                style={{
                  padding:        '5px 16px',
                  border:         isCurrent ? '1px solid var(--border-strong)' : '1px solid var(--border-base)',
                  borderRadius:   0,
                  background:     isCurrent ? 'var(--border-strong)' : 'transparent',
                  color:          isCurrent   ? 'var(--text-inverse)'
                                : isCompleted ? 'var(--color-success)'
                                : canGo       ? 'var(--text-secondary)'
                                : 'var(--text-muted)',
                  fontSize:       'var(--text-xs)',
                  textTransform:  'uppercase',
                  letterSpacing:  '0.1em',
                  fontFamily:     'var(--font-body)',
                  fontWeight:     isCurrent ? 600 : 400,
                  cursor:         canGo ? 'pointer' : 'default',
                  whiteSpace:     'nowrap',
                  transition:     'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => {
                  if (!canGo) return
                  const b = e.currentTarget
                  if (!isCurrent) {
                    b.style.background = 'var(--color-accent)'
                    b.style.color      = 'var(--text-inverse)'
                    b.style.borderColor = 'var(--color-accent)'
                  }
                }}
                onMouseLeave={e => {
                  if (!canGo) return
                  const b = e.currentTarget
                  b.style.background  = isCurrent ? 'var(--border-strong)' : 'transparent'
                  b.style.color       = isCurrent   ? 'var(--text-inverse)'
                                      : isCompleted ? 'var(--color-success)'
                                      : 'var(--text-secondary)'
                  b.style.borderColor = isCurrent ? 'var(--border-strong)' : 'var(--border-base)'
                }}
              >
                {isCompleted && <i className="fa-solid fa-check" style={{ marginRight: 5, fontSize: 9 }} />}
                {STEP_LABELS[step]}
              </button>
            </div>
          )
        })}
      </div>

      {/* Confirm modal */}
      {showNote && (
        <div
          style={{
            position:   'fixed',
            inset:      0,
            background: 'rgba(42,39,37,0.5)',
            display:    'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex:     300,
          }}
          onClick={e => { if (e.target === e.currentTarget) { setShowNote(false); setTarget('') } }}
        >
          <div style={{
            background: 'var(--bg-surface)',
            border:     '1px solid var(--border-base)',
            padding:    '2rem 2.5rem',
            width:      460,
            maxWidth:   '92vw',
          }}>
            {/* Header */}
            <h3 style={{
              fontFamily:   'var(--font-heading)',
              fontSize:     'var(--text-2xl)',
              fontWeight:   400,
              color:        'var(--text-primary)',
              marginBottom: '0.25rem',
            }}>
              {getActionLabel(currentStatus, target)}
            </h3>

            {/* Hairline */}
            <div style={{ height: 1, background: 'var(--border-light)', margin: '1rem 0 1.5rem' }} />

            {/* Textarea — bottom-border only */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label className="form-label">Note (optional)</label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
                placeholder="Add a note for this transition…"
                style={{
                  width:         '100%',
                  background:    'transparent',
                  border:        'none',
                  borderBottom:  '1px solid var(--border-base)',
                  borderRadius:  0,
                  padding:       '6px 2px',
                  fontFamily:    'var(--font-body)',
                  fontSize:      'var(--text-sm)',
                  color:         'var(--text-primary)',
                  resize:        'vertical',
                  outline:       'none',
                  lineHeight:    1.6,
                  transition:    'border-color 0.15s',
                }}
                onFocus={e  => { e.currentTarget.style.borderBottomColor = 'var(--color-accent)'; e.currentTarget.style.borderBottomWidth = '2px' }}
                onBlur={e   => { e.currentTarget.style.borderBottomColor = 'var(--border-base)';  e.currentTarget.style.borderBottomWidth = '1px' }}
              />
            </div>

            {error && (
              <p style={{
                color:        'var(--color-accent)',
                fontSize:     'var(--text-xs)',
                marginBottom: '1rem',
                letterSpacing: '0.03em',
              }}>
                {error}
              </p>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={confirmTransition}
                disabled={pending}
                className={isReturnAction ? 'btn-outline' : 'btn-primary'}
                style={{ minWidth: 130 }}
              >
                {pending ? 'Processing…' : getActionLabel(currentStatus, target)}
              </button>
              <button
                onClick={() => { setShowNote(false); setTarget('') }}
                className="btn-outline"
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
