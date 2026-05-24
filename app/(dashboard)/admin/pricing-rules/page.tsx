'use client'

import { useEffect, useState } from 'react'
import { AdminModal, fieldStyle, labelStyle, inputStyle, btnPrimary, btnSecondary } from '@/components/admin/AdminModal'

interface Rule {
  id: string; name: string; description: string | null
  cif_multiplier: number; tag_multiplier: number; fr_multiplier: number; casting_loss_pct: number
  is_active: boolean; created_at: string
}

const MULTIPLIER_FIELDS = [
  { key: 'cif_multiplier', label: 'CIF Multiplier' },
  { key: 'tag_multiplier', label: 'TAG Multiplier' },
  { key: 'fr_multiplier',  label: 'FR Multiplier'  },
  { key: 'casting_loss_pct', label: 'Casting Loss %' },
]

const EMPTY_FORM = { name: '', description: '', cif_multiplier: '', tag_multiplier: '', fr_multiplier: '', casting_loss_pct: '' }

const th: React.CSSProperties = { padding: '0.5rem 0.6rem', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', borderBottom: '2px solid var(--border-base)', background: 'var(--bg-surface)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '0.55rem 0.6rem', borderBottom: '1px solid var(--border-light)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', verticalAlign: 'middle' }

export default function PricingRulesPage() {
  const [rules,   setRules]   = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Rule | null>(null)
  const [form,    setForm]    = useState<Record<string, string>>(EMPTY_FORM)
  const [error,   setError]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const [activating, setActivating] = useState<string | null>(null)

  async function fetchRules() {
    setLoading(true)
    const res  = await fetch('/api/pricing-rules')
    const json = await res.json()
    if (json.success) setRules(json.data)
    setLoading(false)
  }

  useEffect(() => { fetchRules() }, [])

  function openAdd() {
    setForm(EMPTY_FORM); setEditing(null); setError(''); setModal('add')
  }
  function openEdit(r: Rule) {
    setForm({
      name: r.name, description: r.description ?? '',
      cif_multiplier: String(r.cif_multiplier), tag_multiplier: String(r.tag_multiplier),
      fr_multiplier: String(r.fr_multiplier), casting_loss_pct: String(r.casting_loss_pct),
    })
    setEditing(r); setError(''); setModal('edit')
  }
  function closeModal() { setModal(null); setEditing(null) }

  async function handleSave() {
    setSaving(true); setError('')
    const body: Record<string, unknown> = { name: form.name.trim(), description: form.description.trim() || null }
    MULTIPLIER_FIELDS.forEach(f => { if (form[f.key] !== '') body[f.key] = parseFloat(form[f.key]) })

    const url    = modal === 'edit' ? `/api/pricing-rules/${editing!.id}` : '/api/pricing-rules'
    const method = modal === 'edit' ? 'PATCH' : 'POST'
    const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json   = await res.json()
    if (!json.success) { setError(json.message); setSaving(false); return }
    closeModal(); fetchRules()
    setSaving(false)
  }

  async function handleActivate(r: Rule) {
    if (r.is_active) return
    setActivating(r.id)
    const res  = await fetch(`/api/pricing-rules/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'activate' }) })
    const json = await res.json()
    if (!json.success) alert(json.message)
    else fetchRules()
    setActivating(null)
  }

  async function handleDelete(r: Rule) {
    if (!confirm(`Delete rule "${r.name}"?`)) return
    const res  = await fetch(`/api/pricing-rules/${r.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!json.success) alert(json.message)
    else fetchRules()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 400, margin: 0 }}>Pricing Rules</h1>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>CIF / TAG / FR multipliers and casting loss. Only one rule is active at a time.</p>
        </div>
        <button onClick={openAdd} style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i className="fa-solid fa-plus" style={{ fontSize: 11 }} /> Add Rule
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={{ ...th, textAlign: 'right' }}>CIF ×</th>
              <th style={{ ...th, textAlign: 'right' }}>TAG ×</th>
              <th style={{ ...th, textAlign: 'right' }}>FR ×</th>
              <th style={{ ...th, textAlign: 'right' }}>Casting %</th>
              <th style={{ ...th, textAlign: 'center' }}>Status</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Loading...</td></tr>}
            {!loading && rules.map(r => (
              <tr key={r.id} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = r.is_active ? 'rgba(180,160,110,0.07)' : '')}>
                <td style={{ ...td, fontFamily: 'var(--font-body)', fontWeight: r.is_active ? 600 : 400 }}>
                  {r.name}
                  {r.description && <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 400 }}>{r.description}</span>}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>{r.cif_multiplier.toFixed(4)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{r.tag_multiplier.toFixed(4)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{r.fr_multiplier.toFixed(4)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{r.casting_loss_pct.toFixed(2)}%</td>
                <td style={{ ...td, textAlign: 'center' }}>
                  {r.is_active
                    ? <span style={{ background: 'var(--status-approved-bg)', color: 'var(--status-approved-text)', fontSize: 'var(--text-xs)', fontWeight: 600, padding: '2px 8px', letterSpacing: '0.06em' }}>ACTIVE</span>
                    : <button onClick={() => handleActivate(r)} disabled={activating === r.id} style={{ ...btnSecondary, padding: '2px 10px', fontSize: 'var(--text-xs)' }}>
                        {activating === r.id ? '...' : 'Activate'}
                      </button>
                  }
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <button onClick={() => openEdit(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', marginRight: 8, fontSize: 13 }} title="Edit"><i className="fa-solid fa-pen" /></button>
                  <button onClick={() => handleDelete(r)} disabled={r.is_active} style={{ background: 'none', border: 'none', cursor: r.is_active ? 'not-allowed' : 'pointer', color: r.is_active ? 'var(--text-muted)' : 'var(--color-danger)', fontSize: 13 }} title={r.is_active ? 'Cannot delete active rule' : 'Delete'}><i className="fa-solid fa-trash" /></button>
                </td>
              </tr>
            ))}
            {!loading && !rules.length && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No rules yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <AdminModal title={modal === 'add' ? 'Add Pricing Rule' : `Edit Rule — ${editing?.name}`} onClose={closeModal}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Name *</label>
            <input type="text" style={inputStyle} placeholder="e.g. Standard 2024" value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Description</label>
            <input type="text" style={inputStyle} placeholder="Optional notes" value={form.description} onChange={e => setForm(v => ({ ...v, description: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            {MULTIPLIER_FIELDS.map(f => (
              <div key={f.key}>
                <label style={labelStyle}>{f.label}</label>
                <input type="number" step="0.0001" min="0" style={inputStyle} placeholder="0.0000"
                  value={form[f.key]} onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))} />
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
