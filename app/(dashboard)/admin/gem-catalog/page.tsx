'use client'

import { useState, useEffect } from 'react'
import { useUser } from '@/contexts/UserContext'
import { useRouter } from 'next/navigation'
import { apiCall } from '@/lib/api'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ModalPortal } from '@/components/ui/ModalPortal'
import { ComboInput } from '@/components/ui/ComboInput'

const STONE_TYPE_SUGGESTIONS = ['RD', 'PR', 'BG', 'MQ', 'OV', 'PS', 'RDL', 'RD-LG', 'EM', 'SAP', 'RUB', 'CZ']

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

const EMPTY = { stone_type: '', grade: '', size_range: '', size_min: '', size_max: '', size_unit: 'mm', mk_price: '' }
const UNIT_OPTIONS = ['mm', 'ct', 'pcs']

export default function GemCatalogPage() {
  const { canDo } = useUser()
  const router = useRouter()
  const [gems,       setGems]       = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)
  const [filterType, setFilterType] = useState('')
  const [modal,      setModal]      = useState<{ open: boolean; gem?: any }>({ open: false })
  const [form,       setForm]       = useState<Record<string, string>>(EMPTY)
  const [saving,     setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState<any | null>(null)
  const [deleting,   setDeleting]   = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const url = filterType ? `/api/admin/gem-catalog?type=${filterType}` : '/api/admin/gem-catalog'
    const res  = await fetch(url)
    const json = await res.json()
    if (json.success) setGems(json.data)
    setLoading(false)
  }

  useEffect(() => { if (!loading) load() }, [filterType])

  function openAdd() { setForm(EMPTY); setModal({ open: true }) }
  function openEdit(gem: any) {
    setForm({
      stone_type: gem.stone_type ?? '',
      grade:      gem.grade      ?? '',
      size_range: gem.size_range ?? '',
      size_min:   gem.size_min != null ? String(gem.size_min) : '',
      size_max:   gem.size_max != null ? String(gem.size_max) : '',
      size_unit:  gem.size_unit ?? 'mm',
      mk_price:   gem.mk_price   != null ? String(gem.mk_price) : '',
    })
    setModal({ open: true, gem })
  }

  async function handleSave() {
    setSaving(true)
    const isEdit = !!modal.gem
    const payload = {
      stone_type: form.stone_type,
      grade:      form.grade.trim() || null,
      size_range: form.size_range.trim() || null,
      size_min:   form.size_min !== '' ? parseFloat(form.size_min) : null,
      size_max:   form.size_max !== '' ? parseFloat(form.size_max) : null,
      size_unit:  form.size_unit || 'mm',
      mk_price:   form.mk_price !== '' ? parseFloat(form.mk_price) : null,
    }
    const data = await apiCall<any>(
      () => fetch('/api/admin/gem-catalog', {
        method:  isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(isEdit ? { id: modal.gem.id, ...payload } : payload),
      }),
      { successMsg: isEdit ? 'NVL Hột updated.' : 'NVL Hột added.' }
    )
    setSaving(false)
    if (data !== null) { setModal({ open: false }); load() }
  }

  async function handleDelete() {
    if (!confirmDel) return
    setDeleting(true)
    await apiCall(
      () => fetch(`/api/admin/gem-catalog?id=${confirmDel.id}`, { method: 'DELETE' }),
      { successMsg: 'Deleted.' }
    )
    setDeleting(false)
    setConfirmDel(null)
    load()
  }

  const f = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(v => ({ ...v, [key]: e.target.value }))

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: 1000 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 400 }}>NVL Hột (Gem Prices)</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 4 }}>
            Bảng giá xoàn theo size range — MK Price dùng cho tính T.Giá Xoàn
          </div>
        </div>
        {canDo('manage_products') && <button onClick={openAdd} style={{ background: 'var(--text-primary)', color: 'var(--text-inverse)', border: 'none', padding: '8px 20px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: 0 }}>
          <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />Add Row
        </button>}
      </div>

      {/* Filter by type */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '1rem', flexWrap: 'wrap' }}>
        {['', ...STONE_TYPE_SUGGESTIONS].map(t => (
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
                {['Stone Type', 'Grade', 'Size Range', 'Min', 'Max', 'Unit', 'MK Price ($/ct)', ''].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gems.length === 0 ? (
                <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                  No data. Run <code>fix_v2_logic.sql</code> on Supabase to seed nvl_hot.
                </td></tr>
              ) : gems.map(g => (
                <tr key={g.id}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--color-info)' }}>{g.stone_type}</td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontWeight: 600, background: 'var(--sku-highlight-bg)', color: '#92400E' }}>{g.grade ?? '—'}</td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)' }}>{g.size_range ?? '—'}</td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{g.size_min != null ? Number(g.size_min) : '—'}</td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{g.size_max != null ? Number(g.size_max) : '—'}</td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{g.size_unit ?? '—'}</td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontWeight: 700, textAlign: 'right' }}>
                    {g.mk_price != null ? `$${Number(g.mk_price).toFixed(2)}` : '—'}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    {canDo('manage_products') && <><button onClick={() => openEdit(g)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', marginRight: 6 }} title="Edit"><i className="fa-solid fa-pen" /></button>
                    <button onClick={() => setConfirmDel(g)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)' }} title="Delete"><i className="fa-solid fa-trash" /></button></>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal.open && (
        <ModalPortal>
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,24,20,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-surface)', width: 440, border: '1px solid var(--border-base)' }}>
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-base)' }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)' }}>{modal.gem ? 'Edit NVL Hột' : 'Add NVL Hột'}</span>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={labelStyle}>Stone Type *</label>
                <ComboInput
                  value={form.stone_type}
                  onChange={v => setForm(prev => ({ ...prev, stone_type: v }))}
                  options={STONE_TYPE_SUGGESTIONS}
                  placeholder="RD, PR, BG, EM…"
                  uppercase
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Grade</label>
                <input style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} value={form.grade} onChange={f('grade')} placeholder="e.g. RD B1" />
              </div>
              <div style={{ gridColumn: '1/-1', display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: '0.5rem' }}>
                <div>
                  <label style={labelStyle}>Size Min</label>
                  <input type="number" min="0" step="0.001" style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} value={form.size_min} onChange={f('size_min')} placeholder="0.7" />
                </div>
                <div>
                  <label style={labelStyle}>Size Max</label>
                  <input type="number" min="0" step="0.001" style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} value={form.size_max} onChange={f('size_max')} placeholder="2.0" />
                </div>
                <div>
                  <label style={labelStyle}>Unit</label>
                  <select style={inputStyle} value={form.size_unit} onChange={f('size_unit')}>
                    {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Display Label <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(auto-generated if blank)</span></label>
                <input style={{ ...inputStyle, color: 'var(--text-muted)' }} value={form.size_range} onChange={f('size_range')} placeholder="e.g. RD1 0.7 - 2.0" />
              </div>
              <div>
                <label style={labelStyle}>MK Price ($/ct) *</label>
                <input type="number" min="0" step="0.01" style={{ ...inputStyle, fontWeight: 700 }} value={form.mk_price} onChange={f('mk_price')} placeholder="0.00" />
              </div>
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-light)', background: 'var(--bg-base)', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setModal({ open: false })} style={{ padding: '7px 18px', border: '1px solid var(--border-base)', background: 'transparent', cursor: 'pointer', borderRadius: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.stone_type}
                style={{ padding: '7px 22px', background: 'var(--text-primary)', color: 'var(--text-inverse)', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, borderRadius: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        title="Delete NVL Hột Row"
        message={`Delete "${confirmDel?.grade ?? confirmDel?.size_range}"? This cannot be undone.`}
        okText={deleting ? 'Deleting…' : 'Delete'}
        danger
        onOk={handleDelete}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  )
}
