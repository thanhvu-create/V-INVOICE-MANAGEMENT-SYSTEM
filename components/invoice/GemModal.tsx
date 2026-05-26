'use client'

import { useState, useEffect } from 'react'
import { apiCall } from '@/lib/api'

interface GemForm {
  gem_type:            string
  shape:               string
  size_mm:             string
  qty_pcs:             string
  weight_ct_after:     string
  price_per_carat:     string
  setting_type:        string
  setting_fee_per_pcs: string
}

const EMPTY_FORM: GemForm = {
  gem_type: '', shape: '', size_mm: '', qty_pcs: '1',
  weight_ct_after: '', price_per_carat: '',
  setting_type: '', setting_fee_per_pcs: '0',
}

interface Props {
  open:      boolean
  invoiceId: string
  itemId:    string
  gem?:      any | null   // existing gem for edit, null/undefined for add
  onClose:   () => void
  onSaved:   () => void
}

export function GemModal({ open, invoiceId, itemId, gem, onClose, onSaved }: Props) {
  const [form,   setForm]   = useState<GemForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (gem) {
      setForm({
        gem_type:            gem.gem_type            ?? '',
        shape:               gem.shape               ?? '',
        size_mm:             gem.size_mm             ?? '',
        qty_pcs:             String(gem.qty_pcs      ?? 1),
        weight_ct_after:     String(gem.weight_ct_after ?? ''),
        price_per_carat:     String(gem.price_per_carat ?? ''),
        setting_type:        gem.setting_type        ?? '',
        setting_fee_per_pcs: String(gem.setting_fee_per_pcs ?? 0),
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [open, gem])

  if (!open) return null

  const f = (key: keyof GemForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(v => ({ ...v, [key]: e.target.value }))

  async function handleSave() {
    setSaving(true)
    const body = {
      gem_type:            form.gem_type.trim()  || null,
      shape:               form.shape.trim()     || null,
      size_mm:             form.size_mm.trim()   || null,
      qty_pcs:             parseInt(form.qty_pcs)     || 1,
      weight_ct_after:     parseFloat(form.weight_ct_after)     || 0,
      price_per_carat:     parseFloat(form.price_per_carat)     || 0,
      setting_type:        form.setting_type.trim()  || null,
      setting_fee_per_pcs: parseFloat(form.setting_fee_per_pcs) || 0,
    }

    const url    = gem ? `/api/invoices/${invoiceId}/items/${itemId}/gems/${gem.id}` : `/api/invoices/${invoiceId}/items/${itemId}/gems`
    const method = gem ? 'PATCH' : 'POST'

    const data = await apiCall(
      () => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      { successMsg: gem ? 'Gem updated.' : 'Gem added.' }
    )
    setSaving(false)
    if (data !== null) { onSaved(); onClose() }
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 'var(--text-xs)', textTransform: 'uppercase',
    letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 3, fontWeight: 500,
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', border: '1px solid var(--border-base)', borderRadius: 0,
    background: 'var(--bg-surface)', padding: '6px 8px',
    fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
    outline: 'none',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,24,20,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)', width: 520, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)', fontWeight: 400, margin: 0 }}>
            {gem ? 'Edit Gem' : 'Add Gem'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <label style={labelStyle}>Gem Type</label>
              <input style={inputStyle} placeholder="Diamond, Ruby…" value={form.gem_type} onChange={f('gem_type')} />
            </div>
            <div>
              <label style={labelStyle}>Shape</label>
              <input style={inputStyle} placeholder="Round, Oval…" value={form.shape} onChange={f('shape')} />
            </div>
            <div>
              <label style={labelStyle}>Size</label>
              <input style={inputStyle} placeholder="1.5mm, 3x4mm…" value={form.size_mm} onChange={f('size_mm')} />
            </div>
            <div>
              <label style={labelStyle}>Qty Pcs</label>
              <input type="number" min="1" step="1" style={inputStyle} value={form.qty_pcs} onChange={f('qty_pcs')} />
            </div>
            <div>
              <label style={labelStyle}>Weight After (ct) *</label>
              <input type="number" min="0" step="0.0001" style={inputStyle} placeholder="0.0000" value={form.weight_ct_after} onChange={f('weight_ct_after')} />
            </div>
            <div>
              <label style={labelStyle}>Price / ct (USD)</label>
              <input type="number" min="0" step="0.01" style={inputStyle} placeholder="0.00" value={form.price_per_carat} onChange={f('price_per_carat')} />
            </div>
            <div>
              <label style={labelStyle}>Setting Type</label>
              <input style={inputStyle} placeholder="Prong, Bezel, Pavé…" value={form.setting_type} onChange={f('setting_type')} />
            </div>
            <div>
              <label style={labelStyle}>Setting Fee / pcs (USD)</label>
              <input type="number" min="0" step="0.01" style={inputStyle} placeholder="0.00" value={form.setting_fee_per_pcs} onChange={f('setting_fee_per_pcs')} />
            </div>
          </div>

          {gem && (
            <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-light)', padding: '0.75rem', marginBottom: '1rem', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.5rem' }}>
              {[
                ['Weight (g)', gem.weight_gr != null ? gem.weight_gr.toFixed(4) : '—'],
                ['Total Price', gem.total_price != null ? `$${gem.total_price.toFixed(2)}` : '—'],
                ['Total Setting', gem.total_setting_fee != null ? `$${gem.total_setting_fee.toFixed(2)}` : '—'],
              ].map(([l, v]) => (
                <div key={l as string}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{l}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>{v}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '0.5rem 1.25rem', border: '1px solid var(--border-base)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', cursor: 'pointer', borderRadius: 0 }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 1.5rem', background: 'var(--text-primary)', color: 'var(--text-inverse)', border: 'none', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, borderRadius: 0 }}>
              {saving ? 'Saving…' : gem ? 'Update Gem' : 'Add Gem'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
