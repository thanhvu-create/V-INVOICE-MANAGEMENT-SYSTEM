'use client'

import { useState, useEffect } from 'react'
import { useUser } from '@/contexts/UserContext'
import { useRouter } from 'next/navigation'
import { apiCall } from '@/lib/api'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

const GEM_TYPES = ['RD', 'PR', 'BG', 'MQ', 'OV', 'PS', 'RDL', 'XC', 'PL']
const PRICE_UNITS = [
  { value: 'per_ct',  label: '$/ct (carat)' },
  { value: 'per_pcs', label: '$/pcs (piece)' },
]

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 'var(--text-xs)', textTransform: 'uppercase',
  letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 3, fontWeight: 500,
}
const inputStyle: React.CSSProperties = {
  width: '100%', border: '1px solid var(--border-base)', borderRadius: 0,
  background: 'var(--bg-surface)', padding: '5px 8px',
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)', outline: 'none',
}
const thStyle: React.CSSProperties = {
  padding: '8px 10px', background: 'var(--bg-base)', fontSize: 'var(--text-xs)',
  fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'var(--text-secondary)', borderBottom: '2px solid var(--border-base)',
  textAlign: 'left', whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = {
  padding: '7px 10px', borderBottom: '1px solid var(--border-light)',
  fontSize: 'var(--text-sm)', verticalAlign: 'middle',
}

const EMPTY = { gem_code: '', gem_type: 'RD', size_range: '', cost_price: '', mk_price: '', price_unit: 'per_ct', notes: '', is_active: true }

export default function GemCatalogPage() {
  const { canDo } = useUser()
  const router = useRouter()
  const [gems, setGems]           = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [filterType, setFilterType] = useState('')
  const [modal, setModal]         = useState<{ open: boolean; gem?: any }>({ open: false })
  const [form, setForm]           = useState(EMPTY)
  const [saving, setSaving]       = useState(false)
  const [confirmDel, setConfirmDel] = useState<any | null>(null)
  const [deleting, setDeleting]   = useState(false)

  useEffect(() => {
    if (!canDo('manage_products')) { router.push('/dashboard'); return }
    load()
  }, [])

  async function load() {
    setLoading(true)
    const url = filterType ? `/api/admin/gem-catalog?type=${filterType}` : '/api/admin/gem-catalog'
    const res = await fetch(url)
    const json = await res.json()
    if (json.success) setGems(json.data)
    setLoading(false)
  }

  useEffect(() => { if (!loading) load() }, [filterType])

  function openAdd() { setForm(EMPTY); setModal({ open: true }) }
  function openEdit(gem: any) {
    setForm({
      gem_code:   gem.gem_code   ?? '',
      gem_type:   gem.gem_type   ?? 'RD',
      size_range: gem.size_range ?? '',
      cost_price: gem.cost_price != null ? String(gem.cost_price) : '',
      mk_price:   gem.mk_price   != null ? String(gem.mk_price)   : '',
      price_unit: gem.price_unit ?? 'per_ct',
      notes:      gem.notes      ?? '',
      is_active:  gem.is_active  ?? true,
    })
    setModal({ open: true, gem })
  }

  async function handleSave() {
    setSaving(true)
    const isEdit = !!modal.gem
    const data = await apiCall<any>(
      () => fetch('/api/admin/gem-catalog', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { id: modal.gem.id, ...form } : form),
      }),
      { successMsg: isEdit ? 'Gem updated.' : 'Gem added.' }
    )
    setSaving(false)
    if (data !== null) { setModal({ open: false }); load() }
  }

  async function handleDelete() {
    if (!confirmDel) return
    setDeleting(true)
    await apiCall(
      () => fetch(`/api/admin/gem-catalog?id=${confirmDel.id}`, { method: 'DELETE' }),
      { successMsg: 'Gem deleted.' }
    )
    setDeleting(false)
    setConfirmDel(null)
    load()
  }

  const f = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(v => ({ ...v, [key]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }))

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 400 }}>Gem Price Catalog</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 4 }}>
            NVL gem pricing — MK Price is used to calculate gem value (T.Giá Xoàn)
          </div>
        </div>
        <button onClick={openAdd} style={{ background: 'var(--text-primary)', color: 'var(--text-inverse)', border: 'none', padding: '8px 20px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: 0 }}>
          <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />Add Gem
        </button>
      </div>

      {/* Filter by type */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '1rem', flexWrap: 'wrap' }}>
        {['', ...GEM_TYPES].map(t => (
          <button key={t} onClick={() => setFilterType(t)}
            style={{ padding: '4px 12px', border: '1px solid var(--border-base)', borderRadius: 0, background: filterType === t ? 'var(--text-primary)' : 'transparent', color: filterType === t ? 'var(--text-inverse)' : 'var(--text-primary)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.06em', cursor: 'pointer' }}>
            {t || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 8 }} />Loading...
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr>
                {['Type', 'Code', 'Size Range', 'Cost Price', 'MK Price', 'Unit', 'Active', 'Notes', ''].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gems.length === 0 ? (
                <tr><td colSpan={9} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                  No data. Run <code>gem_price_catalog.sql</code> on Supabase first.
                </td></tr>
              ) : gems.map(g => (
                <tr key={g.id}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--color-info)' }}>{g.gem_type}</td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontWeight: 600, background: 'var(--sku-highlight-bg)', color: '#92400E' }}>{g.gem_code}</td>
                  <td style={tdStyle}>{g.size_range ?? '—'}</td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{g.cost_price != null ? `$${Number(g.cost_price).toFixed(2)}` : '—'}</td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontWeight: 700, textAlign: 'right' }}>{g.mk_price != null ? `$${Number(g.mk_price).toFixed(2)}` : '—'}</td>
                  <td style={{ ...tdStyle, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{g.price_unit === 'per_pcs' ? '$/pcs' : '$/ct'}</td>
                  <td style={tdStyle}>{g.is_active ? <span style={{ color: 'var(--color-success)', fontSize: 11 }}>✓</span> : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>✗</span>}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.notes ?? ''}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    <button onClick={() => openEdit(g)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', marginRight: 6 }} title="Edit"><i className="fa-solid fa-pen" /></button>
                    <button onClick={() => setConfirmDel(g)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)' }} title="Delete"><i className="fa-solid fa-trash" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      {modal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,24,20,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-surface)', width: 520, border: '1px solid var(--border-base)' }}>
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-base)' }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)' }}>{modal.gem ? 'Edit Gem' : 'Add Gem'}</span>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={labelStyle}>Gem Type *</label>
                <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.gem_type} onChange={f('gem_type')}>
                  {GEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Gem Code *</label>
                <input style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} value={form.gem_code} onChange={f('gem_code')} placeholder="e.g. RD B1" />
              </div>
              <div>
                <label style={labelStyle}>Size Range</label>
                <input style={inputStyle} value={form.size_range} onChange={f('size_range')} placeholder="e.g. 0.7-2.0mm" />
              </div>
              <div>
                <label style={labelStyle}>Price Unit</label>
                <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.price_unit} onChange={f('price_unit')}>
                  {PRICE_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Cost Price (internal)</label>
                <input type="number" min="0" step="0.01" style={inputStyle} value={form.cost_price} onChange={f('cost_price')} placeholder="0.00" />
              </div>
              <div>
                <label style={labelStyle}>MK Price * (gem value calc)</label>
                <input type="number" min="0" step="0.01" style={{ ...inputStyle, fontWeight: 700 }} value={form.mk_price} onChange={f('mk_price')} placeholder="0.00" />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Notes</label>
                <input style={inputStyle} value={form.notes} onChange={f('notes')} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="is_active" checked={form.is_active as boolean} onChange={f('is_active')} />
                <label htmlFor="is_active" style={{ fontSize: 'var(--text-sm)', cursor: 'pointer' }}>Active</label>
              </div>
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-light)', background: 'var(--bg-base)', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setModal({ open: false })} style={{ padding: '7px 18px', border: '1px solid var(--border-base)', background: 'transparent', cursor: 'pointer', borderRadius: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.gem_code || !form.gem_type}
                style={{ padding: '7px 22px', background: 'var(--text-primary)', color: 'var(--text-inverse)', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, borderRadius: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        title="Delete Gem"
        message={`Delete gem "${confirmDel?.gem_code}" (${confirmDel?.gem_type})? This cannot be undone.`}
        okText={deleting ? 'Deleting…' : 'Delete'}
        danger
        onOk={handleDelete}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  )
}
