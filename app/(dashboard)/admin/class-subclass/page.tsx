'use client'

import { useState, useEffect } from 'react'
import { useUser } from '@/contexts/UserContext'
import { useRouter } from 'next/navigation'
import { apiCall } from '@/lib/api'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ModalPortal } from '@/components/ui/ModalPortal'

interface Rule {
  id:                 string
  description_prefix: string
  class:              string
  sub_class:          string
}

const EMPTY = { description_prefix: '', class: '', sub_class: '' }

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 'var(--text-xs)', textTransform: 'uppercase',
  letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 3, fontWeight: 500,
}
const inputStyle: React.CSSProperties = {
  width: '100%', border: '1px solid var(--border-base)', borderRadius: 0,
  background: 'var(--bg-surface)', padding: '5px 8px',
  fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)', outline: 'none',
}
const thStyle: React.CSSProperties = {
  padding: '8px 12px', background: 'var(--bg-base)', fontSize: 'var(--text-xs)',
  fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'var(--text-secondary)', borderBottom: '2px solid var(--border-base)',
  textAlign: 'left', whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = {
  padding: '7px 12px', borderBottom: '1px solid var(--border-light)',
  fontSize: 'var(--text-sm)', verticalAlign: 'middle',
}

// Group rules by Class for display
function groupByClass(rules: Rule[]): Map<string, Rule[]> {
  const map = new Map<string, Rule[]>()
  for (const r of rules) {
    const list = map.get(r.class) ?? []
    list.push(r)
    map.set(r.class, list)
  }
  return map
}

export default function ClassSubClassPage() {
  const { canDo } = useUser()
  const router    = useRouter()
  const [rules,      setRules]      = useState<Rule[]>([])
  const [loading,    setLoading]    = useState(true)
  const [filter,     setFilter]     = useState('')
  const [modal,      setModal]      = useState<{ open: boolean; rule?: Rule }>({ open: false })
  const [form,       setForm]       = useState<typeof EMPTY>(EMPTY)
  const [saving,     setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState<Rule | null>(null)
  const [deleting,   setDeleting]   = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const res  = await fetch('/api/admin/class-subclass')
    const json = await res.json()
    if (json.success) setRules(json.data)
    setLoading(false)
  }

  function openAdd() { setForm(EMPTY); setModal({ open: true }) }
  function openEdit(rule: Rule) {
    setForm({ description_prefix: rule.description_prefix, class: rule.class, sub_class: rule.sub_class })
    setModal({ open: true, rule })
  }

  async function handleSave() {
    const prefix = form.description_prefix.trim().toUpperCase()
    const cls    = form.class.trim().toUpperCase()
    const sub    = form.sub_class.trim().toUpperCase()
    if (!prefix || !cls || !sub) return

    setSaving(true)
    const isEdit  = !!modal.rule
    const payload = { description_prefix: prefix, class: cls, sub_class: sub }
    const data = await apiCall<Rule>(
      () => fetch('/api/admin/class-subclass', {
        method:  isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(isEdit ? { id: modal.rule!.id, ...payload } : payload),
      }),
      { successMsg: isEdit ? 'Rule updated.' : 'Rule added.' }
    )
    setSaving(false)
    if (data !== null) { setModal({ open: false }); load() }
  }

  async function handleDelete() {
    if (!confirmDel) return
    setDeleting(true)
    await apiCall(
      () => fetch(`/api/admin/class-subclass?id=${confirmDel.id}`, { method: 'DELETE' }),
      { successMsg: 'Deleted.' }
    )
    setDeleting(false)
    setConfirmDel(null)
    load()
  }

  const f = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(v => ({ ...v, [key]: e.target.value }))

  const filtered = filter
    ? rules.filter(r =>
        r.description_prefix.includes(filter.toUpperCase()) ||
        r.class.includes(filter.toUpperCase()) ||
        r.sub_class.includes(filter.toUpperCase())
      )
    : rules

  const grouped = groupByClass(filtered)

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 400 }}>
            Class / Sub-Class Rules
          </div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 4 }}>
            Mapping Description prefix → Class + Sub-Class — dùng để auto-fill khi nhập invoice
          </div>
        </div>
        {canDo('manage_products') && <button
          onClick={openAdd}
          style={{ background: 'var(--text-primary)', color: 'var(--text-inverse)', border: 'none', padding: '8px 20px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: 0 }}
        >
          <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />Add Rule
        </button>}
      </div>

      {/* Search */}
      <div style={{ marginBottom: '1rem' }}>
        <input
          placeholder="Tìm prefix, class, sub class…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ ...inputStyle, width: 280, fontFamily: 'var(--font-body)' }}
        />
        {filter && (
          <span style={{ marginLeft: 10, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {filtered.length} / {rules.length} rules
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 8 }} />Loading…
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr>
                {['Description Prefix', 'Class', 'Sub Class', ''].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                    {rules.length === 0
                      ? <>Chưa có dữ liệu. Chạy <code>class_subclass_rules.sql</code> trên Supabase để seed data.</>
                      : 'Không tìm thấy rule nào.'}
                  </td>
                </tr>
              ) : (
                Array.from(grouped.entries()).map(([cls, rows]) => (
                  rows.map((r, i) => (
                    <tr
                      key={r.id}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--sku-highlight-color, #92400E)', background: 'var(--sku-highlight-bg)' }}>
                        {r.description_prefix}
                      </td>
                      {/* Merge-like: show class only on first row of group */}
                      <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-info)' }}>
                        {i === 0 ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {r.class}
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>
                              ({rows.length})
                            </span>
                          </span>
                        ) : r.class}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)' }}>
                        <span style={{ display: 'inline-block', padding: '1px 8px', background: 'var(--bg-base)', border: '1px solid var(--border-base)', fontSize: 'var(--text-xs)', letterSpacing: '0.08em', fontWeight: 600 }}>
                          {r.sub_class}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {canDo('manage_products') && <><button onClick={() => openEdit(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', marginRight: 6 }} title="Edit">
                          <i className="fa-solid fa-pen" />
                        </button>
                        <button onClick={() => setConfirmDel(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)' }} title="Delete">
                          <i className="fa-solid fa-trash" />
                        </button></>}
                      </td>
                    </tr>
                  ))
                ))
              )}
            </tbody>
          </table>

          {!filter && rules.length > 0 && (
            <div style={{ padding: '0.5rem 12px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              {rules.length} rules · {grouped.size} nhóm class
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Modal */}
      {modal.open && (
        <ModalPortal>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,24,20,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--bg-surface)', width: 400, border: '1px solid var(--border-base)' }}>
              <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-base)' }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)' }}>
                  {modal.rule ? 'Edit Rule' : 'Add Rule'}
                </span>
              </div>
              <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div>
                  <label style={labelStyle}>Description Prefix *</label>
                  <input
                    style={{ ...inputStyle, fontWeight: 700 }}
                    placeholder="e.g. DPDMT, 18KRI, PT900BL"
                    value={form.description_prefix}
                    onChange={e => setForm(v => ({ ...v, description_prefix: e.target.value.toUpperCase() }))}
                    autoFocus
                  />
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 3 }}>
                    Prefix phải khớp phần đầu của Description (case-insensitive)
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={labelStyle}>Class *</label>
                    <input
                      style={inputStyle}
                      placeholder="e.g. DIAMT, 18KJE, ACC"
                      value={form.class}
                      onChange={e => setForm(v => ({ ...v, class: e.target.value.toUpperCase() }))}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Sub Class *</label>
                    <input
                      style={inputStyle}
                      placeholder="e.g. RI, ER, BL, ACC"
                      value={form.sub_class}
                      onChange={e => setForm(v => ({ ...v, sub_class: e.target.value.toUpperCase() }))}
                    />
                  </div>
                </div>
              </div>
              <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-light)', background: 'var(--bg-base)', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setModal({ open: false })}
                  style={{ padding: '7px 18px', border: '1px solid var(--border-base)', background: 'transparent', cursor: 'pointer', borderRadius: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
                >Cancel</button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.description_prefix.trim() || !form.class.trim() || !form.sub_class.trim()}
                  style={{ padding: '7px 22px', background: 'var(--text-primary)', color: 'var(--text-inverse)', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, borderRadius: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600 }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        title="Delete Rule"
        message={`Xóa rule "${confirmDel?.description_prefix}"? Không thể hoàn tác.`}
        okText={deleting ? 'Deleting…' : 'Delete'}
        danger
        onOk={handleDelete}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  )
}
