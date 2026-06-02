'use client'

import { useState, useEffect, useRef } from 'react'
import { apiCall } from '@/lib/api'

const METAL_TYPES = ['18KW', '18KY', '14KY', 'PT950', 'PT', '24K', 'AG', 'PD']

interface Form {
  sku_jwmold:            string
  qty_pcs:               string
  description:           string
  class:                 string
  sub_class:             string
  metal_type:            string
  weight_total_gr:       string
  weight_gold_actual_gr: string
  labor_fee:             string
  casting_fee:           string
  design_fee:            string
  resin_fee:             string
  misc_fee:              string
  notes:                 string
  image_url:             string
}

const EMPTY: Form = {
  sku_jwmold: '', qty_pcs: '1', description: '', class: '', sub_class: '',
  metal_type: '', weight_total_gr: '', weight_gold_actual_gr: '',
  labor_fee: '0', casting_fee: '0', design_fee: '0', resin_fee: '0', misc_fee: '0',
  notes: '', image_url: '',
}

interface Props {
  open:      boolean
  invoiceId: string
  onClose:   () => void
  onSaved:   () => void
}

export function AddItemModal({ open, invoiceId, onClose, onSaved }: Props) {
  const [form,        setForm]        = useState<Form>(EMPTY)
  const [saving,      setSaving]      = useState(false)
  const [looking,     setLooking]     = useState(false)
  const [skuError,    setSkuError]    = useState('')
  const [skuResolved, setSkuResolved] = useState(false)
  const skuRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) { setForm(EMPTY); setSkuError(''); setSkuResolved(false) }
  }, [open])

  useEffect(() => {
    if (open) setTimeout(() => skuRef.current?.focus(), 50)
  }, [open])

  if (!open) return null

  const f = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(v => ({ ...v, [key]: e.target.value }))

  async function lookupSku() {
    const sku = form.sku_jwmold.trim().toUpperCase()
    if (!sku) { setSkuError('SKU is required'); return }
    setLooking(true)
    setSkuError('')
    try {
      const res  = await fetch(`/api/products?skus=${encodeURIComponent(sku)}`)
      const json = await res.json()
      if (!json.success || !json.data?.length) {
        setSkuError(`SKU "${sku}" not found in product catalog`)
        setSkuResolved(false)
        return
      }
      const prod = json.data[0]
      setForm(v => ({
        ...v,
        sku_jwmold:  sku,
        description: prod.description ?? v.description,
        class:       prod.class       ?? v.class,
        sub_class:   prod.sub_class    ?? v.sub_class,
        metal_type:  prod.metal_type   ?? v.metal_type,
        labor_fee:   String(prod.labor_fee   ?? 0),
        casting_fee: String(prod.casting_fee ?? 0),
        design_fee:  String(prod.design_fee  ?? 0),
        resin_fee:   String(prod.resin_fee   ?? 0),
        misc_fee:    String(prod.misc_fee    ?? 0),
        image_url:   prod.image_url          ?? '',
      }))
      setSkuResolved(true)
    } finally {
      setLooking(false)
    }
  }

  async function handleSave() {
    if (!form.sku_jwmold.trim()) { setSkuError('SKU is required'); return }
    setSaving(true)
    const body = {
      sku_jwmold:            form.sku_jwmold.trim().toUpperCase(),
      qty_pcs:               parseInt(form.qty_pcs)              || 1,
      description:           form.description.trim()             || null,
      class:                 form.class.trim()                   || null,
      sub_class:             form.sub_class.trim()               || null,
      metal_type:            form.metal_type                     || null,
      weight_total_gr:       parseFloat(form.weight_total_gr)    || 0,
      weight_gold_actual_gr: parseFloat(form.weight_gold_actual_gr) || 0,
      labor_fee:             parseFloat(form.labor_fee)          || 0,
      casting_fee:           parseFloat(form.casting_fee)        || 0,
      design_fee:            parseFloat(form.design_fee)         || 0,
      resin_fee:             parseFloat(form.resin_fee)          || 0,
      misc_fee:              parseFloat(form.misc_fee)           || 0,
      notes:                 form.notes.trim()                   || null,
      image_url:             form.image_url                      || null,
    }
    const data = await apiCall(
      () => fetch(`/api/invoices/${invoiceId}/items`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
      { successMsg: 'Item added.' }
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
  const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,24,20,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)', width: 560, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)', fontWeight: 400, margin: 0 }}>Add Item</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem' }}>

          {/* SKU lookup row */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>SKU JWMold *</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                ref={skuRef}
                style={{ ...inputStyle, flex: 1, fontFamily: 'var(--font-mono)', fontWeight: 600, textTransform: 'uppercase' }}
                placeholder="RING-001"
                value={form.sku_jwmold}
                onChange={e => { setForm(v => ({ ...v, sku_jwmold: e.target.value.toUpperCase() })); setSkuResolved(false); setSkuError('') }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lookupSku() } }}
              />
              <button
                onClick={lookupSku}
                disabled={looking}
                style={{
                  padding: '6px 14px', border: '1px solid var(--border-base)', borderRadius: 0, background: 'var(--bg-base)',
                  cursor: looking ? 'not-allowed' : 'pointer', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)',
                  whiteSpace: 'nowrap',
                }}
              >
                {looking ? <i className="fa-solid fa-circle-notch fa-spin" /> : <><i className="fa-solid fa-magnifying-glass" style={{ marginRight: 4 }} />Lookup</>}
              </button>
            </div>
            {skuError && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)', marginTop: 4 }}>{skuError}</div>}
            {skuResolved && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success)', marginTop: 4 }}><i className="fa-solid fa-check" style={{ marginRight: 4 }} />SKU found — fields auto-filled from catalog</div>}
          </div>

          {/* Description */}
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={labelStyle}>Description</label>
            <input style={inputStyle} value={form.description} onChange={f('description')} />
          </div>

          <div style={grid2}>
            <div>
              <label style={labelStyle}>Class</label>
              <input style={inputStyle} value={form.class} onChange={f('class')} />
            </div>
            <div>
              <label style={labelStyle}>Sub Class</label>
              <input style={inputStyle} value={form.sub_class} onChange={f('sub_class')} />
            </div>
            <div>
              <label style={labelStyle}>Metal Type</label>
              <select style={inputStyle} value={form.metal_type} onChange={f('metal_type')}>
                <option value="">—</option>
                {METAL_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Qty Pcs</label>
              <input type="number" min="1" step="1" style={inputStyle} value={form.qty_pcs} onChange={f('qty_pcs')} />
            </div>
            <div>
              <label style={labelStyle}>Total Weight (g)</label>
              <input type="number" min="0" step="0.0001" style={inputStyle} placeholder="0.0000" value={form.weight_total_gr} onChange={f('weight_total_gr')} />
            </div>
            <div>
              <label style={labelStyle}>Gold Weight (g)</label>
              <input type="number" min="0" step="0.0001" style={inputStyle} placeholder="0.0000" value={form.weight_gold_actual_gr} onChange={f('weight_gold_actual_gr')} />
            </div>
          </div>

          {/* Fees */}
          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '0.75rem', marginBottom: '0.75rem' }}>
            <div style={{ fontSize: 'var(--text-xs)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Fees (USD)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem' }}>
              {(['labor_fee', 'casting_fee', 'design_fee', 'resin_fee', 'misc_fee'] as const).map(key => (
                <div key={key}>
                  <label style={{ ...labelStyle, fontSize: 10 }}>{key.replace('_fee', '')}</label>
                  <input type="number" min="0" step="0.01" style={{ ...inputStyle, padding: '4px 6px' }} value={form[key]} onChange={f(key)} />
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Notes</label>
            <input style={inputStyle} placeholder='e.g. "ba sao"' value={form.notes} onChange={f('notes')} />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '0.5rem 1.25rem', border: '1px solid var(--border-base)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', cursor: 'pointer', borderRadius: 0 }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 1.5rem', background: 'var(--text-primary)', color: 'var(--text-inverse)', border: 'none', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, borderRadius: 0 }}>
              {saving ? 'Adding…' : 'Add Item'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
