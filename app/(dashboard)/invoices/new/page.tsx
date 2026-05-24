'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'

interface Defaults {
  defaultRateId: string | null
  defaultRuleId: string | null
  rates: Array<{ id: string; rate_date: string }>
  rules: Array<{ id: string; name: string; is_active: boolean }>
}

const label: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
  fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
  color: 'var(--text-secondary)', marginBottom: '0.35rem',
}
const input: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--border-base)',
  borderRadius: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)', background: 'var(--bg-surface)', outline: 'none',
}
const field: React.CSSProperties = { marginBottom: '1.25rem' }

export default function NewInvoicePage() {
  const router     = useRouter()
  const { canDo }  = useUser()

  const [defaults, setDefaults] = useState<Defaults | null>(null)
  const [form, setForm] = useState({
    po_number:       '',
    mr_number:       '',
    metal_rate_id:   '',
    pricing_rule_id: '',
    store:           '',
    notes:           '',
  })
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/invoices/new-defaults')
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          setDefaults(json.data)
          setForm(f => ({
            ...f,
            metal_rate_id:   json.data.defaultRateId ?? '',
            pricing_rule_id: json.data.defaultRuleId ?? '',
          }))
        }
      })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res  = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const json = await res.json()
      if (!json.success) { setError(json.message); return }
      router.push(`/invoices/${json.data.id}`)
    } finally {
      setLoading(false)
    }
  }

  if (!canDo('create')) {
    return <p style={{ color: 'var(--color-danger)' }}>You don't have permission to create invoices.</p>
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <a href="/invoices" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: 'var(--text-sm)' }}>
          ← Invoices
        </a>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 400, margin: 0 }}>
          New Invoice
        </h1>
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)', padding: '2rem' }}>
        <form onSubmit={handleSubmit}>
          {/* PO Number */}
          <div style={field}>
            <label style={label}>PO Number *</label>
            <input style={input} type="text" required value={form.po_number}
              onChange={e => setForm(f => ({ ...f, po_number: e.target.value }))}
              placeholder="e.g. PO-2026-001" autoFocus />
          </div>

          {/* MR Number */}
          <div style={field}>
            <label style={label}>MR Number</label>
            <input style={input} type="text" value={form.mr_number}
              onChange={e => setForm(f => ({ ...f, mr_number: e.target.value }))}
              placeholder="Optional" />
          </div>

          {/* Metal Rate */}
          <div style={field}>
            <label style={label}>Metal Rate *</label>
            <select style={input} required value={form.metal_rate_id}
              onChange={e => setForm(f => ({ ...f, metal_rate_id: e.target.value }))}>
              <option value="">— Select rate date —</option>
              {defaults?.rates.map(r => (
                <option key={r.id} value={r.id}>{r.rate_date}</option>
              ))}
            </select>
          </div>

          {/* Pricing Rule */}
          <div style={field}>
            <label style={label}>Pricing Rule</label>
            <select style={input} value={form.pricing_rule_id}
              onChange={e => setForm(f => ({ ...f, pricing_rule_id: e.target.value }))}>
              <option value="">— None —</option>
              {defaults?.rules.map(r => (
                <option key={r.id} value={r.id}>{r.name}{r.is_active ? ' (active)' : ''}</option>
              ))}
            </select>
          </div>

          {/* Store */}
          <div style={field}>
            <label style={label}>Store</label>
            <input style={input} type="text" value={form.store}
              onChange={e => setForm(f => ({ ...f, store: e.target.value }))}
              placeholder="e.g. US ONL, VN SR" />
          </div>

          {/* Notes */}
          <div style={field}>
            <label style={label}>Notes</label>
            <textarea
              style={{ ...input, height: 80, resize: 'vertical' }}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>

          {error && (
            <p style={{ color: 'var(--color-danger)', fontSize: 'var(--text-sm)', marginBottom: '1rem' }}>{error}</p>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="submit" disabled={loading} style={{
              padding: '0.6rem 1.75rem', background: loading ? 'var(--text-muted)' : 'var(--text-primary)',
              color: 'var(--bg-base)', border: 'none', fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-sm)', fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
              letterSpacing: '0.05em',
            }}>
              {loading ? 'Creating...' : 'Create Invoice'}
            </button>
            <a href="/invoices" style={{
              padding: '0.6rem 1.25rem', border: '1px solid var(--border-base)',
              color: 'var(--text-secondary)', textDecoration: 'none',
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            }}>
              Cancel
            </a>
          </div>
        </form>
      </div>
    </div>
  )
}
