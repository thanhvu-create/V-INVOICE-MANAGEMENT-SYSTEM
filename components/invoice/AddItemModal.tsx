'use client'

import { useState, useEffect, useRef } from 'react'
import { apiCall } from '@/lib/api'
import { ModalPortal } from '@/components/ui/ModalPortal'

const LOAI_VANG_OPTIONS = ['24K', '23K', '22K', '18KW', '18KY', '17K', '16K', '15K', '14K', '10K', 'PT950', 'AG', 'PD']
const CLASS_OPTIONS     = ['24K', '18MTG', 'DIAJE', 'DIAMT', '18KJE', 'LGRI', 'SILJE']

interface Form {
  sku:          string
  vendor_model: string
  so_mo:        string
  description:  string
  class:        string
  sub_class:    string
  kich_thuoc:   string
  loai_vang:    string
  store:        string
  location:     string
  qt_pcs:       string
  wt_gr:        string
  gia_cong:     string
  duc:          string
  thiet_ke:     string
  resin:        string
  phi_phu_kien: string
  bao_hiem:     string
  nini_adm:     string
  image_url:    string
}

const EMPTY: Form = {
  sku: '', vendor_model: '', so_mo: '', description: '', class: '', sub_class: '',
  kich_thuoc: '', loai_vang: '', store: 'HP', location: 'Safe 1',
  qt_pcs: '1', wt_gr: '',
  gia_cong: '0', duc: '0', thiet_ke: '0', resin: '0', phi_phu_kien: '0',
  bao_hiem: '0',
  nini_adm: '', image_url: '',
}

interface Props {
  open:      boolean
  invoiceId: string
  onClose:   () => void
  onSaved:   () => void
}

export function AddItemModal({ open, invoiceId, onClose, onSaved }: Props) {
  const [form,   setForm]   = useState<Form>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const skuRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) { setForm(EMPTY); setError('') }
  }, [open])

  useEffect(() => {
    if (open) setTimeout(() => skuRef.current?.focus(), 50)
  }, [open])

  if (!open) return null

  const f = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(v => ({ ...v, [key]: e.target.value }))

  async function handleSave() {
    if (!form.sku.trim()) { setError('SKU is required'); return }
    setSaving(true)
    setError('')
    const wt = parseFloat(form.wt_gr) || 0
    const body = {
      sku:              form.sku.trim().toUpperCase(),
      vendor_model:     form.vendor_model.trim() || null,
      so_mo:            form.so_mo.trim()       || null,
      description:      form.description.trim() || null,
      class:            form.class.trim()        || null,
      sub_class:        form.sub_class.trim()    || null,
      kich_thuoc:       form.kich_thuoc.trim()   || null,
      loai_vang:        form.loai_vang           || null,
      store:            form.store.trim()        || null,
      location:         form.location.trim()     || null,
      qt_pcs:           parseInt(form.qt_pcs)    || 1,
      wt_gr:            wt,
      t_pham_co_nvl_da: wt,
      gia_cong:         parseFloat(form.gia_cong)     || 0,
      duc:              parseFloat(form.duc)           || 0,
      thiet_ke:         parseFloat(form.thiet_ke)      || 0,
      resin:            parseFloat(form.resin)         || 0,
      phi_phu_kien:     parseFloat(form.phi_phu_kien)  || 0,
      bao_hiem:         parseFloat(form.bao_hiem)      || null,
      nini_adm:         form.nini_adm.trim()    || null,
      image_url:        form.image_url.trim()   || null,
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
    <ModalPortal>
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,24,20,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)', width: 580, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)', fontWeight: 400, margin: 0 }}>Thêm SP</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem' }}>

          {/* SKU + SO-MO */}
          <div style={grid2}>
            <div>
              <label style={labelStyle}>SKU *</label>
              <input
                ref={skuRef}
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontWeight: 600, textTransform: 'uppercase' }}
                placeholder="RING-001"
                value={form.sku}
                onChange={e => { setForm(v => ({ ...v, sku: e.target.value.toUpperCase() })); setError('') }}
              />
              {error && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)', marginTop: 3 }}>{error}</div>}
            </div>
            <div>
              <label style={labelStyle}>SO-MO</label>
              <input style={inputStyle} placeholder="SO26.10628-MO26.36160" value={form.so_mo} onChange={f('so_mo')} />
            </div>
          </div>

          {/* Vendor Model# */}
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={labelStyle}>Vendor Model# (Mã mẫu)</label>
            <input style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} placeholder="e.g. L10437" value={form.vendor_model} onChange={f('vendor_model')} />
          </div>

          {/* Description */}
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={labelStyle}>Description</label>
            <input style={inputStyle} value={form.description} onChange={f('description')} />
          </div>

          <div style={grid2}>
            <div>
              <label style={labelStyle}>Store</label>
              <input style={inputStyle} placeholder="HP" value={form.store} onChange={f('store')} />
            </div>
            <div>
              <label style={labelStyle}>Location</label>
              <input style={inputStyle} placeholder="Safe 1" value={form.location} onChange={f('location')} />
            </div>

            <div>
              <label style={labelStyle}>Class</label>
              <select style={inputStyle} value={form.class} onChange={f('class')}>
                <option value="">—</option>
                {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="OTHER">Other…</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Sub Class</label>
              <input style={inputStyle} placeholder="BL, RI, ER, PD…" value={form.sub_class} onChange={f('sub_class')} />
            </div>

            <div>
              <label style={labelStyle}>Loại Vàng</label>
              <select style={inputStyle} value={form.loai_vang} onChange={f('loai_vang')}>
                <option value="">—</option>
                {LOAI_VANG_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Qty (pcs)</label>
              <input type="number" min="1" step="1" style={inputStyle} value={form.qt_pcs} onChange={f('qt_pcs')} />
            </div>

            <div>
              <label style={labelStyle}>T.Phẩm có NVL đá (g)</label>
              <input type="number" min="0" step="0.0001" style={inputStyle} placeholder="0.0000" value={form.wt_gr} onChange={f('wt_gr')} />
            </div>
            <div>
              <label style={labelStyle}>Kích Thước</label>
              <input style={inputStyle} placeholder='e.g. "8in", "Size 5"' value={form.kich_thuoc} onChange={f('kich_thuoc')} />
            </div>
          </div>

          {/* Fees */}
          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '0.75rem', marginBottom: '0.75rem' }}>
            <div style={{ fontSize: 'var(--text-xs)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Chi phí (USD)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem' }}>
              {(['gia_cong', 'duc', 'thiet_ke', 'resin', 'phi_phu_kien'] as const).map(key => (
                <div key={key}>
                  <label style={{ ...labelStyle, fontSize: 10 }}>{key.replace('_', ' ')}</label>
                  <input type="number" min="0" step="0.01" style={{ ...inputStyle, padding: '4px 6px' }} value={form[key]} onChange={f(key)} />
                </div>
              ))}
            </div>
          </div>

          {/* Bảo hiểm + Notes */}
          <div style={{ ...grid2, gridTemplateColumns: '1fr 2fr', marginBottom: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Bảo hiểm (AC)</label>
              <input type="number" min="0" step="0.01" style={inputStyle} placeholder="0.00" value={form.bao_hiem} onChange={f('bao_hiem')} />
            </div>
            <div>
              <label style={labelStyle}>Ghi chú</label>
              <input style={inputStyle} placeholder='e.g. "ba sao"' value={form.nini_adm} onChange={f('nini_adm')} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '0.5rem 1.25rem', border: '1px solid var(--border-base)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', cursor: 'pointer', borderRadius: 0 }}>Hủy</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 1.5rem', background: 'var(--text-primary)', color: 'var(--text-inverse)', border: 'none', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, borderRadius: 0 }}>
              {saving ? 'Đang thêm…' : 'Thêm SP'}
            </button>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
