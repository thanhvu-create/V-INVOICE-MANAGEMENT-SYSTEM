'use client'

import { useEffect, useState, useCallback } from 'react'
import { useUser } from '@/contexts/UserContext'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ModalPortal } from '@/components/ui/ModalPortal'

interface PricingRule {
  id:               string
  name:             string
  description:      string | null
  cif_multiplier:   number
  tag_multiplier:   number
  fr_multiplier:    number
  casting_loss_pct: number
  is_active:        boolean
  created_at:       string
}

const EMPTY = {
  name: '', description: '',
  cif_multiplier: '1.10', tag_multiplier: '1.20', fr_multiplier: '1.05',
  casting_loss_pct: '0',
}

const th: React.CSSProperties = {
  padding: '8px 12px', background: 'var(--bg-base)',
  fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--text-secondary)',
  borderBottom: '2px solid var(--border-base)', whiteSpace: 'nowrap', textAlign: 'left',
}
const td: React.CSSProperties = {
  padding: '10px 12px', borderBottom: '1px solid var(--border-light)',
  fontSize: 'var(--text-sm)', verticalAlign: 'middle',
}
const tdMono: React.CSSProperties = {
  ...td, fontFamily: 'var(--font-mono)', textAlign: 'right',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 'var(--text-xs)', textTransform: 'uppercase',
  letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 500,
}
const inputStyle: React.CSSProperties = {
  width: '100%', border: '1px solid var(--border-base)', borderRadius: 0,
  background: 'var(--bg-surface)', padding: '6px 8px',
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
  outline: 'none',
}

function pct(v: number) { return `${((v - 1) * 100).toFixed(1)}%` }

export default function PricingRulesPage() {
  const { canDo } = useUser()
  const router    = useRouter()

  const [rules,      setRules]      = useState<PricingRule[]>([])
  const [loading,    setLoading]    = useState(true)
  const [modal,      setModal]      = useState(false)
  const [editId,     setEditId]     = useState<string | null>(null)
  const [form,       setForm]       = useState(EMPTY)
  const [saving,     setSaving]     = useState(false)
  const [activating, setActivating] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<PricingRule | null>(null)
  const [deleting,   setDeleting]   = useState(false)

  useEffect(() => {
    if (!canDo('admin')) { router.push('/dashboard'); return }
  }, [canDo])

  const load = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/pricing-rules')
    const json = await res.json()
    if (json.success) setRules(json.data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd() {
    setForm(EMPTY)
    setEditId(null)
    setModal(true)
  }

  function openEdit(r: PricingRule) {
    setForm({
      name:             r.name,
      description:      r.description ?? '',
      cif_multiplier:   String(r.cif_multiplier),
      tag_multiplier:   String(r.tag_multiplier),
      fr_multiplier:    String(r.fr_multiplier),
      casting_loss_pct: String(r.casting_loss_pct),
    })
    setEditId(r.id)
    setModal(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast('Name is required.', 'warn'); return }
    setSaving(true)
    const body = {
      name:             form.name.trim(),
      description:      form.description.trim() || null,
      cif_multiplier:   parseFloat(form.cif_multiplier)   || 1.0,
      tag_multiplier:   parseFloat(form.tag_multiplier)   || 1.0,
      fr_multiplier:    parseFloat(form.fr_multiplier)    || 1.0,
      casting_loss_pct: parseFloat(form.casting_loss_pct) || 0,
    }
    const res  = await fetch(editId ? `/api/pricing-rules/${editId}` : '/api/pricing-rules', {
      method:  editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    const json = await res.json()
    setSaving(false)
    if (!json.success) { toast(json.message || 'Save failed.', 'error'); return }
    toast(editId ? 'Rule updated.' : 'Rule created.', 'success')
    setModal(false)
    load()
  }

  async function handleActivate(id: string) {
    setActivating(id)
    const res  = await fetch(`/api/pricing-rules/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'activate' }),
    })
    const json = await res.json()
    setActivating(null)
    if (!json.success) { toast(json.message || 'Failed.', 'error'); return }
    toast('Pricing rule activated.', 'success')
    load()
  }

  async function handleDelete() {
    if (!confirmDel) return
    setDeleting(true)
    const res  = await fetch(`/api/pricing-rules/${confirmDel.id}`, { method: 'DELETE' })
    const json = await res.json()
    setDeleting(false)
    setConfirmDel(null)
    if (!json.success) { toast(json.message || 'Delete failed.', 'error'); return }
    toast('Rule deleted.', 'success')
    load()
  }

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(v => ({ ...v, [k]: e.target.value }))

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: 960 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 400, margin: 0 }}>
            Pricing Rules
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Quản lý hệ số CIF / Tag / FR · Chỉ 1 rule có thể active tại một thời điểm
          </p>
        </div>
        <button
          onClick={openAdd}
          style={{ background: 'var(--text-primary)', color: 'var(--text-inverse)', border: 'none', padding: '8px 20px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: 0 }}
        >
          <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />Add Rule
        </button>
      </div>

      {/* Context box */}
      <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-light)', padding: '0.75rem 1rem', marginBottom: '1.5rem', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
        <strong>Công thức:</strong>&nbsp;
        <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
          CIF = HPUSA × cif_multiplier
        </code>
        &nbsp;·&nbsp;
        <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
          Tag = CIF × tag_multiplier
        </code>
        &nbsp;·&nbsp;
        <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
          FR = CIF × fr_multiplier
        </code>
        <br />
        <span style={{ color: 'var(--text-muted)' }}>
          CIF% = hệ số × 10% tương ứng F8 trong Excel SUMMARY. Tag và FR tự động tính — Excel để trống 2 cột này.
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 8 }} />Loading...
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={{ ...th, textAlign: 'right' }}>CIF %<span style={{ display: 'block', fontSize: 9, fontWeight: 400, color: 'var(--text-muted)' }}>multiplier</span></th>
              <th style={{ ...th, textAlign: 'right' }}>Tag %<span style={{ display: 'block', fontSize: 9, fontWeight: 400, color: 'var(--text-muted)' }}>multiplier</span></th>
              <th style={{ ...th, textAlign: 'right' }}>FR %<span style={{ display: 'block', fontSize: 9, fontWeight: 400, color: 'var(--text-muted)' }}>multiplier</span></th>
              <th style={th}>Status</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 && (
              <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '2.5rem' }}>No rules yet.</td></tr>
            )}
            {rules.map(r => (
              <tr key={r.id}
                style={{ background: r.is_active ? 'var(--bg-surface)' : '' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = r.is_active ? 'var(--bg-surface)' : '')}
              >
                <td style={td}>
                  <div style={{ fontWeight: r.is_active ? 600 : 400 }}>{r.name}</div>
                  {r.description && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>{r.description}</div>}
                </td>
                {/* CIF */}
                <td style={tdMono}>
                  <span style={{ color: 'var(--color-info)', fontWeight: 600 }}>{pct(r.cif_multiplier)}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginLeft: 4 }}>({r.cif_multiplier})</span>
                </td>
                {/* Tag */}
                <td style={tdMono}>
                  <span>{pct(r.tag_multiplier)}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginLeft: 4 }}>({r.tag_multiplier})</span>
                </td>
                {/* FR */}
                <td style={tdMono}>
                  <span>{pct(r.fr_multiplier)}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginLeft: 4 }}>({r.fr_multiplier})</span>
                </td>
                {/* Status */}
                <td style={td}>
                  {r.is_active ? (
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-success)', border: '1px solid var(--color-success)', padding: '2px 8px' }}>
                      Active
                    </span>
                  ) : (
                    <button
                      onClick={() => handleActivate(r.id)}
                      disabled={activating === r.id}
                      style={{ fontSize: 'var(--text-xs)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', border: '1px solid var(--border-base)', background: 'transparent', padding: '2px 8px', cursor: 'pointer', borderRadius: 0 }}
                    >
                      {activating === r.id ? <i className="fa-solid fa-circle-notch fa-spin" /> : 'Set Active'}
                    </button>
                  )}
                </td>
                {/* Actions */}
                <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                  <button
                    onClick={() => openEdit(r)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', marginRight: 8, fontSize: 13 }}
                    title="Edit"
                  >
                    <i className="fa-solid fa-pen" />
                  </button>
                  <button
                    onClick={() => setConfirmDel(r)}
                    disabled={r.is_active}
                    style={{ background: 'none', border: 'none', cursor: r.is_active ? 'not-allowed' : 'pointer', color: r.is_active ? 'var(--text-muted)' : 'var(--color-danger)', fontSize: 13 }}
                    title={r.is_active ? 'Cannot delete active rule' : 'Delete'}
                  >
                    <i className="fa-solid fa-trash-can" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Add / Edit Modal */}
      {modal && (
        <ModalPortal>
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(26,24,20,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setModal(false)}
          >
            <div
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)', width: 520, maxHeight: '90vh', overflowY: 'auto' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Modal header */}
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)', fontWeight: 400, margin: 0 }}>
                  {editId ? 'Edit Rule' : 'New Pricing Rule'}
                </h3>
                <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}>
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>

              {/* Modal body */}
              <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {/* Name */}
                <div>
                  <label style={labelStyle}>Name *</label>
                  <input style={inputStyle} placeholder='e.g. "Standard", "VIP", "Domestic"' value={form.name} onChange={f('name')} autoFocus />
                </div>

                {/* Description */}
                <div>
                  <label style={labelStyle}>Description</label>
                  <textarea
                    style={{ ...inputStyle, height: 56, resize: 'vertical', fontFamily: 'var(--font-body)' }}
                    placeholder="Mô tả ngắn..."
                    value={form.description}
                    onChange={f('description')}
                  />
                </div>

                {/* Multipliers */}
                <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '0.75rem' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.65rem' }}>
                    Hệ số nhân — nhập dạng decimal (VD: <strong>1.10</strong> = 10% markup)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={labelStyle}>
                        CIF Multiplier
                        <span style={{ color: 'var(--color-info)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 4 }}>
                          {form.cif_multiplier ? `(${pct(parseFloat(form.cif_multiplier) || 0)})` : ''}
                        </span>
                      </label>
                      <input
                        type="number" min="1" step="0.01" style={inputStyle}
                        placeholder="1.10"
                        value={form.cif_multiplier}
                        onChange={f('cif_multiplier')}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>
                        Tag Multiplier
                        <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 4 }}>
                          {form.tag_multiplier ? `(${pct(parseFloat(form.tag_multiplier) || 0)})` : ''}
                        </span>
                      </label>
                      <input
                        type="number" min="1" step="0.01" style={inputStyle}
                        placeholder="1.20"
                        value={form.tag_multiplier}
                        onChange={f('tag_multiplier')}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>
                        FR Multiplier
                        <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 4 }}>
                          {form.fr_multiplier ? `(${pct(parseFloat(form.fr_multiplier) || 0)})` : ''}
                        </span>
                      </label>
                      <input
                        type="number" min="1" step="0.01" style={inputStyle}
                        placeholder="1.05"
                        value={form.fr_multiplier}
                        onChange={f('fr_multiplier')}
                      />
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '0.25rem' }}>
                  <button
                    onClick={() => setModal(false)}
                    style={{ padding: '0.5rem 1.25rem', border: '1px solid var(--border-base)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', cursor: 'pointer', borderRadius: 0 }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{ padding: '0.5rem 1.5rem', background: 'var(--text-primary)', color: 'var(--text-inverse)', border: 'none', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, borderRadius: 0 }}
                  >
                    {saving ? 'Saving…' : editId ? 'Update' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!confirmDel}
        title="Delete Pricing Rule"
        message={`Delete "${confirmDel?.name}"? This cannot be undone.`}
        okText={deleting ? 'Deleting…' : 'Delete'}
        danger
        onOk={handleDelete}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  )
}
