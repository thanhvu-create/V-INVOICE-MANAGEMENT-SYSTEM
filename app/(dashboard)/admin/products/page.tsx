'use client'

import { useEffect, useState } from 'react'
import { AdminModal, fieldStyle, labelStyle, inputStyle, btnPrimary, btnSecondary } from '@/components/admin/AdminModal'
import { toast } from '@/components/ui/Toast'

interface NVLPrice {
  id:         string
  gold_24k:   number | null
  pt_price:   number | null
  ag_price:   number | null
  pd_price:   number | null
  loss_gold:  number | null
  loss_pt:    number | null
  created_at: string
}

const FIELDS: { key: keyof Omit<NVLPrice, 'id' | 'created_at'>; label: string; unit: string; step: string }[] = [
  { key: 'gold_24k',  label: 'Gold 24K',  unit: '$/oz',  step: '0.01'   },
  { key: 'pt_price',  label: 'Platinum',  unit: '$/oz',  step: '0.01'   },
  { key: 'ag_price',  label: 'Silver',    unit: '$/oz',  step: '0.01'   },
  { key: 'pd_price',  label: 'Palladium', unit: '$/oz',  step: '0.01'   },
  { key: 'loss_gold', label: 'Loss Gold', unit: '%',     step: '0.001'  },
  { key: 'loss_pt',   label: 'Loss Pt',   unit: '%',     step: '0.001'  },
]

const EMPTY_FORM: Record<string, string> = {
  gold_24k: '', pt_price: '', ag_price: '', pd_price: '', loss_gold: '0.06', loss_pt: '0.17',
}

const th: React.CSSProperties = { padding: '0.5rem 0.75rem', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', borderBottom: '2px solid var(--border-base)', background: 'var(--bg-surface)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '0.55rem 0.75rem', borderBottom: '1px solid var(--border-light)', fontSize: 'var(--text-sm)', verticalAlign: 'middle' }

export default function NVLPricesPage() {
  const [rows,   setRows]   = useState<NVLPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]  = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<NVLPrice | null>(null)
  const [form,    setForm]   = useState<Record<string, string>>(EMPTY_FORM)
  const [error,   setError]  = useState('')
  const [saving,  setSaving] = useState(false)

  async function fetchRows() {
    setLoading(true)
    const res  = await fetch('/api/metal-rates')
    const json = await res.json()
    if (json.success) setRows(json.data)
    setLoading(false)
  }

  useEffect(() => { fetchRows() }, [])

  function openAdd() {
    setForm(EMPTY_FORM); setEditing(null); setError(''); setModal('add')
  }
  function openEdit(r: NVLPrice) {
    setForm(Object.fromEntries(FIELDS.map(f => [f.key, r[f.key] != null ? String(r[f.key]) : ''])))
    setEditing(r); setError(''); setModal('edit')
  }
  function closeModal() { setModal(null); setEditing(null) }

  async function handleSave() {
    setSaving(true); setError('')
    const body: Record<string, unknown> = {}
    FIELDS.forEach(f => { body[f.key] = form[f.key] !== '' ? parseFloat(form[f.key]) : null })

    const url    = modal === 'edit' ? `/api/metal-rates/${editing!.id}` : '/api/metal-rates'
    const method = modal === 'edit' ? 'PATCH' : 'POST'
    const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json   = await res.json()
    if (!json.success) { setError(json.message); setSaving(false); return }
    toast(modal === 'edit' ? 'NVL prices updated.' : 'NVL row added.', 'success')
    closeModal(); fetchRows(); setSaving(false)
  }

  async function handleDelete(r: NVLPrice) {
    if (!confirm(`Delete this NVL price row? This cannot be undone.`)) return
    const res  = await fetch(`/api/metal-rates/${r.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!json.success) toast(json.message || 'Failed to delete.', 'error')
    else { toast('NVL row deleted.', 'success'); fetchRows() }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 400, margin: 0 }}>NVL Prices</h1>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>Bảng giá nguyên vật liệu — snapshot cho invoice mới</p>
        </div>
        <button onClick={openAdd} style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i className="fa-solid fa-plus" style={{ fontSize: 11 }} /> Add Row
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {FIELDS.map(f => (
                <th key={f.key} style={{ ...th, textAlign: 'right' }}>
                  {f.label} <span style={{ fontWeight: 400, opacity: 0.6 }}>({f.unit})</span>
                </th>
              ))}
              <th style={th}>Created</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={FIELDS.length + 2} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Loading...</td></tr>
            )}
            {!loading && rows.map((r, i) => (
              <tr key={r.id}
                style={{ background: i === 0 ? 'var(--bg-base)' : undefined }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = i === 0 ? 'var(--bg-base)' : '')}
              >
                {FIELDS.map(f => (
                  <td key={f.key} style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {r[f.key] != null
                      ? f.unit === '%'
                        ? `${(Number(r[f.key]) * 100).toFixed(1)}%`
                        : `$${Number(r[f.key]).toFixed(2)}`
                      : '—'}
                  </td>
                ))}
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {r.created_at.slice(0, 10)}
                  {i === 0 && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--color-success)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>LATEST</span>}
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <button onClick={() => openEdit(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', marginRight: 8, fontSize: 13 }} title="Edit">
                    <i className="fa-solid fa-pen" />
                  </button>
                  <button onClick={() => handleDelete(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', fontSize: 13 }} title="Delete">
                    <i className="fa-solid fa-trash" />
                  </button>
                </td>
              </tr>
            ))}
            {!loading && !rows.length && (
              <tr><td colSpan={FIELDS.length + 2} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No NVL price rows. Add one to enable invoice creation.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <AdminModal title={modal === 'add' ? 'Add NVL Prices' : `Edit NVL Prices`} onClose={closeModal} width={480}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            {FIELDS.map(f => (
              <div key={f.key} style={fieldStyle}>
                <label style={labelStyle}>{f.label} ({f.unit})</label>
                <input type="number" step={f.step} min="0" style={inputStyle} placeholder="0.00"
                  value={form[f.key]}
                  onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))} />
              </div>
            ))}
          </div>
          {error && <p style={{ color: 'var(--color-danger)', fontSize: 'var(--text-sm)', marginBottom: '1rem' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={handleSave} disabled={saving} style={btnPrimary}>{saving ? 'Saving...' : 'Save'}</button>
            <button onClick={closeModal} style={btnSecondary}>Cancel</button>
          </div>
        </AdminModal>
      )}
    </div>
  )
}
