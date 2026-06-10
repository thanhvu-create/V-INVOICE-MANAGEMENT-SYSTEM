'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'

const TEMPLATE_OPTIONS = ['CH1', 'CH2', 'ADM', 'CH1_AG3', 'VNSI_AG3']

interface NVLDefaults {
  gold_24k:  number | null
  pt_price:  number | null
  ag_price:  number | null
  pd_price:  number | null
  loss_gold: number | null
  loss_pt:   number | null
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
  const router    = useRouter()
  const { canDo, loaded } = useUser()

  const [nvlDefaults, setNvlDefaults] = useState<NVLDefaults | null>(null)
  const [form, setForm] = useState({
    invoice_code:  '',
    template_type: 'CH1',
    channel:       '',
  })
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/invoices/new-defaults')
      .then(r => r.json())
      .then(json => { if (json.success) setNvlDefaults(json.data.latestNVL) })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.invoice_code.trim()) { setError('Invoice code is required'); return }
    setLoading(true)
    try {
      const res  = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_code:  form.invoice_code.trim().toUpperCase(),
          template_type: form.template_type,
          channel:       form.channel.trim() || null,
        }),
      })
      const json = await res.json()
      if (!json.success) { setError(json.message); return }
      router.push(`/invoices/${json.data.id}`)
    } finally {
      setLoading(false)
    }
  }

  if (!loaded) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
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

          {/* Invoice Code */}
          <div style={field}>
            <label style={label}>Invoice Code (V-INV) *</label>
            <input style={{ ...input, fontFamily: 'var(--font-mono)', fontWeight: 600, textTransform: 'uppercase' }}
              type="text" required value={form.invoice_code} autoFocus
              onChange={e => setForm(f => ({ ...f, invoice_code: e.target.value }))}
              placeholder="e.g. P60501" />
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
              Mã invoice duy nhất — ví dụ: P60501, CH2-001
            </div>
          </div>

          {/* Template Type */}
          <div style={field}>
            <label style={label}>Template Type *</label>
            <select style={input} required value={form.template_type}
              onChange={e => setForm(f => ({ ...f, template_type: e.target.value }))}>
              {TEMPLATE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
              CH1/CH2 = 2F có xoàn · ADM = 2F có xoàn gộp · CH1_AG3/VNSI_AG3 = không xoàn
            </div>
          </div>

          {/* Channel */}
          <div style={field}>
            <label style={label}>Channel (TÊN KHÁCH)</label>
            <input style={input} type="text" value={form.channel}
              onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}
              placeholder="e.g. CH1-Khách, ADM1, CH2…" />
          </div>

          {/* NVL snapshot preview */}
          {nvlDefaults && (
            <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-light)', padding: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                NVL Snapshot (auto từ bảng giá mới nhất)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                {[
                  ['Gold 24K',  nvlDefaults.gold_24k,  '$/oz'],
                  ['Platinum',  nvlDefaults.pt_price,  '$/oz'],
                  ['Silver',    nvlDefaults.ag_price,  '$/oz'],
                  ['Palladium', nvlDefaults.pd_price,  '$/oz'],
                  ['Loss Gold', nvlDefaults.loss_gold != null ? `${(nvlDefaults.loss_gold * 100).toFixed(0)}%` : null, ''],
                  ['Loss Pt',   nvlDefaults.loss_pt   != null ? `${(nvlDefaults.loss_pt   * 100).toFixed(0)}%` : null, ''],
                ].map(([lbl, val, unit]) => (
                  <div key={String(lbl)}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{lbl}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                      {val != null ? `${val} ${unit}`.trim() : '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
