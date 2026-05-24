'use client'

import { useState } from 'react'
import type { AuditLogEntry } from '@/types'

const ACTION_CFG: Record<string, { label: string; color: string }> = {
  created:          { label: 'Created',         color: 'var(--text-muted)'      },
  updated:          { label: 'Updated',         color: 'var(--text-secondary)'  },
  submitted:        { label: 'Submitted',       color: 'var(--color-info)'      },
  approved:         { label: 'Approved',        color: 'var(--color-success)'   },
  rejected:         { label: 'Rejected',        color: 'var(--color-danger)'    },
  invoiced:         { label: 'Invoiced',        color: 'var(--text-primary)'    },
  items_imported:   { label: 'Items Imported',  color: 'var(--color-info)'      },
  item_added:       { label: 'Item Added',      color: 'var(--text-secondary)'  },
  item_updated:     { label: 'Item Updated',    color: 'var(--text-secondary)'  },
  item_deleted:     { label: 'Item Deleted',    color: 'var(--color-danger)'    },
  discount_applied: { label: 'Discount Applied',color: 'var(--color-warning)'   },
}

function formatDt(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(iso))
}

function metaNote(action: string, meta: Record<string, unknown>): string {
  if (action === 'items_imported') return `${meta.count ?? ''} rows${meta.errors ? ` · ${meta.errors} errors` : ''}`
  if (action === 'item_added' || action === 'item_deleted' || action === 'item_updated') return meta.sku ? `SKU: ${meta.sku}` : ''
  return ''
}

export function AuditTimeline({ invoiceId }: { invoiceId: string }) {
  const [expanded, setExpanded] = useState(false)
  const [logs,     setLogs]     = useState<AuditLogEntry[]>([])
  const [loading,  setLoading]  = useState(false)
  const [loaded,   setLoaded]   = useState(false)

  async function load() {
    if (loaded) return
    setLoading(true)
    try {
      const res  = await fetch(`/api/invoices/${invoiceId}/audit-log`)
      const json = await res.json()
      if (json.success) setLogs(json.data)
    } finally { setLoading(false); setLoaded(true) }
  }

  function toggle() {
    if (!expanded) load()
    setExpanded(v => !v)
  }

  return (
    <section style={{ borderTop: '1px solid var(--border-base)', marginTop: '2rem', paddingTop: '1.5rem' }}>
      <button
        onClick={toggle}
        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: expanded ? '1.25rem' : 0 }}
      >
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
          History
        </span>
        <i className={`fa-solid fa-chevron-${expanded ? 'up' : 'down'}`} style={{ fontSize: 9, color: 'var(--text-muted)' }} />
      </button>

      {expanded && (
        <div>
          {loading && <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}><i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 6 }} />Loading...</p>}
          {!loading && logs.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>No history.</p>}
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, position: 'relative' }}>
            <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 1, background: 'var(--border-base)' }} />
            {logs.map(log => {
              const cfg  = ACTION_CFG[log.action] ?? ACTION_CFG.updated
              const note = metaNote(log.action, log.metadata)
              return (
                <li key={log.id} style={{ display: 'flex', gap: '1rem', paddingBottom: '1.1rem', position: 'relative' }}>
                  <div style={{ width: 15, height: 15, borderRadius: '50%', background: cfg.color, border: '2px solid var(--bg-surface)', flexShrink: 0, marginTop: 2, position: 'relative', zIndex: 1 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: cfg.color, marginBottom: 2 }}>
                      {cfg.label}
                      {log.from_status && log.to_status && (
                        <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, textTransform: 'none', letterSpacing: 0 }}>
                          {log.from_status} → {log.to_status}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: note || log.note ? 3 : 0 }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{(log.app_users as any)?.full_name ?? '—'}</strong> · {formatDt(log.created_at)}
                    </div>
                    {note && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: log.note ? 3 : 0 }}>{note}</div>}
                    {log.note && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontStyle: 'italic', borderLeft: '2px solid var(--border-base)', paddingLeft: 8, marginTop: 3 }}>"{log.note}"</div>}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </section>
  )
}
