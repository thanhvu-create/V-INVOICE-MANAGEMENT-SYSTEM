'use client'

import { useState, useEffect } from 'react'
import { apiCall } from '@/lib/api'

interface GemForm {
  gem_code:            string   // NVL code: "RD B1", "BG3"… → auto-lookup price
  gem_type:            string
  quality:             string   // P.chất: VVS1, VS1, SI1, LG, F, VF…
  shape:               string
  size_mm:             string
  qty_pcs:             string
  weight_ct_before:    string
  weight_ct_after:     string
  unit_price_per_ct:   string
  setting_type:        string
  setting_fee_per_pcs: string
}

const EMPTY_FORM: GemForm = {
  gem_code: '', gem_type: '', quality: '', shape: '', size_mm: '',
  qty_pcs: '1', weight_ct_before: '', weight_ct_after: '',
  unit_price_per_ct: '', setting_type: '', setting_fee_per_pcs: '0',
}

interface Props {
  open:        boolean
  invoiceId:   string
  itemId:      string
  gem?:        any | null      // existing gem for edit
  onClose:     () => void
  onSaved:     (updatedItem: any) => void  // returns updated parent item for local state
}

export function GemModal({ open, invoiceId, itemId, gem, onClose, onSaved }: Props) {
  const [form,        setForm]        = useState<GemForm>(EMPTY_FORM)
  const [saving,      setSaving]      = useState(false)
  const [lookingUp,   setLookingUp]   = useState(false)
  const [lookupMsg,   setLookupMsg]   = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    if (!open) return
    setLookupMsg(null)
    if (gem) {
      setForm({
        gem_code:            gem.gem_code              ?? '',
        gem_type:            gem.gem_type             ?? '',
        quality:             gem.quality              ?? '',
        shape:               gem.shape                ?? '',
        size_mm:             gem.size_mm              ?? '',
        qty_pcs:             String(gem.qty_pcs       ?? 1),
        weight_ct_before:    String(gem.weight_ct_before ?? ''),
        weight_ct_after:     String(gem.weight_ct_after  ?? ''),
        unit_price_per_ct:   String(gem.unit_price_per_ct ?? ''),
        setting_type:        gem.setting_type         ?? '',
        setting_fee_per_pcs: String(gem.setting_fee_per_pcs ?? 0),
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [open, gem])

  if (!open) return null

  const f = (key: keyof GemForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(v => ({ ...v, [key]: e.target.value }))

  async function lookupGemCode() {
    const code = form.gem_code.trim().toUpperCase()
    if (!code) return
    setLookingUp(true)
    setLookupMsg(null)
    try {
      const res  = await fetch(`/api/gem-catalog?code=${encodeURIComponent(code)}`)
      const json = await res.json()
      if (!json.success) {
        setLookupMsg({ text: `Mã "${code}" không tìm thấy trong NVL catalog.`, ok: false })
        return
      }
      const catalog = json.data
      setForm(v => ({
        ...v,
        gem_type:          catalog.gem_type   || v.gem_type,
        unit_price_per_ct: String(catalog.mk_price ?? ''),
      }))
      setLookupMsg({ text: `✓ Found: ${catalog.gem_type} — MK Price $${Number(catalog.mk_price).toFixed(2)}/${catalog.price_unit === 'per_pcs' ? 'pcs' : 'ct'}`, ok: true })
    } finally {
      setLookingUp(false)
    }
  }

  function parseNum(s: string): number | null {
    const n = parseFloat(s)
    return isNaN(n) ? null : n
  }

  async function handleSave() {
    setSaving(true)
    const body = {
      gem_type:            form.gem_type.trim()   || null,
      quality:             form.quality.trim()    || null,
      shape:               form.shape.trim()      || null,
      size_mm:             form.size_mm.trim()    || null,
      qty_pcs:             parseInt(form.qty_pcs) || 1,
      weight_ct_before:    parseNum(form.weight_ct_before),
      weight_ct_after:     parseNum(form.weight_ct_after)    ?? 0,
      unit_price_per_ct:   parseNum(form.unit_price_per_ct)  ?? 0,
      setting_type:        form.setting_type.trim() || null,
      setting_fee_per_pcs: parseNum(form.setting_fee_per_pcs) ?? 0,
    }

    const url    = gem
      ? `/api/invoices/${invoiceId}/items/${itemId}/gems/${gem.id}`
      : `/api/invoices/${invoiceId}/items/${itemId}/gems`
    const method = gem ? 'PATCH' : 'POST'

    // API returns the recalculated parent item (with updated gems)
    const updatedItem = await apiCall<any>(
      () => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      { successMsg: gem ? 'Gem updated.' : 'Gem added.' }
    )
    setSaving(false)
    if (updatedItem !== null) {
      onSaved(updatedItem)
      onClose()
    }
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
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)', width: 560, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>

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

          {/* Row 0: NVL gem_code lookup */}
          <div style={{ marginBottom: '0.75rem', padding: '0.75rem', background: 'var(--bg-base)', border: '1px solid var(--border-light)' }}>
            <label style={labelStyle}>Mã NVL (Gem Code) — auto-fill giá MK</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontWeight: 600, flex: 1 }}
                placeholder="e.g. RD B1, BG3, MQ2…"
                value={form.gem_code}
                onChange={f('gem_code')}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lookupGemCode() } }}
              />
              <button
                onClick={lookupGemCode}
                disabled={lookingUp || !form.gem_code.trim()}
                style={{ padding: '6px 14px', background: 'var(--color-info)', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: 0, fontSize: 'var(--text-xs)', fontWeight: 600, whiteSpace: 'nowrap', opacity: lookingUp ? 0.7 : 1 }}
              >
                {lookingUp ? <i className="fa-solid fa-circle-notch fa-spin" /> : 'Lookup'}
              </button>
            </div>
            {lookupMsg && (
              <div style={{ marginTop: 5, fontSize: 'var(--text-xs)', color: lookupMsg.ok ? 'var(--color-success)' : 'var(--color-danger)', fontFamily: 'var(--font-mono)' }}>
                {lookupMsg.text}
              </div>
            )}
          </div>

          {/* Row 1: gem_type + quality */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Gem Type</label>
              <input style={inputStyle} placeholder="Diamond, Ruby, Sapphire…" value={form.gem_type} onChange={f('gem_type')} />
            </div>
            <div>
              <label style={labelStyle}>Quality (P. chất)</label>
              <input style={inputStyle} placeholder="VVS1, VS1, SI1, LG, F, VF…" value={form.quality} onChange={f('quality')} />
            </div>
          </div>

          {/* Row 2: shape + size_mm */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Shape</label>
              <input style={inputStyle} placeholder="Round, Oval, Princess…" value={form.shape} onChange={f('shape')} />
            </div>
            <div>
              <label style={labelStyle}>Size (mm)</label>
              <input style={inputStyle} placeholder="1.5mm, 3×4mm…" value={form.size_mm} onChange={f('size_mm')} />
            </div>
          </div>

          {/* Row 3: qty + weight_ct_before + weight_ct_after */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Qty (pcs)</label>
              <input type="number" min="1" step="1" style={inputStyle} value={form.qty_pcs} onChange={f('qty_pcs')} />
            </div>
            <div>
              <label style={labelStyle}>Wt Before (ct)</label>
              <input type="number" min="0" step="0.0001" style={inputStyle} placeholder="0.0000" value={form.weight_ct_before} onChange={f('weight_ct_before')} />
            </div>
            <div>
              <label style={labelStyle}>Wt After (ct) *</label>
              <input type="number" min="0" step="0.0001" style={inputStyle} placeholder="0.0000" value={form.weight_ct_after} onChange={f('weight_ct_after')} />
            </div>
          </div>

          {/* Row 4: unit_price_per_ct + setting_type + setting_fee_per_pcs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <label style={labelStyle}>Price / ct (USD)</label>
              <input type="number" min="0" step="0.01" style={inputStyle} placeholder="0.00" value={form.unit_price_per_ct} onChange={f('unit_price_per_ct')} />
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

          {/* Computed cols display (only when editing existing gem) */}
          {gem && (
            <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-light)', padding: '0.75rem', marginBottom: '1rem', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.5rem' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2, gridColumn: '1/-1' }}>
                Computed (PostgreSQL GENERATED)
              </div>
              {([
                ['Weight (g)',     gem.weight_gr         != null ? gem.weight_gr.toFixed(4)         : '—'],
                ['T. Giá Xoàn',   gem.total_price        != null ? `$${gem.total_price.toFixed(2)}`  : '—'],
                ['T. Phí Nhận Hột', gem.total_setting_fee != null ? `$${gem.total_setting_fee.toFixed(2)}` : '—'],
              ] as const).map(([l, v]) => (
                <div key={l}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{l}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>{v}</div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '0.5rem 1.25rem', border: '1px solid var(--border-base)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', cursor: 'pointer', borderRadius: 0 }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 1.5rem', background: 'var(--text-primary)', color: 'var(--text-inverse)', border: 'none', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, borderRadius: 0 }}>
              {saving ? 'Saving…' : gem ? 'Update Gem' : 'Add Gem'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
