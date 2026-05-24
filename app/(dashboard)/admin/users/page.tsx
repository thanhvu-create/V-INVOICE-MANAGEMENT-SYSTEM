'use client'

import { useEffect, useState } from 'react'
import { AdminModal, fieldStyle, labelStyle, inputStyle, btnPrimary, btnSecondary } from '@/components/admin/AdminModal'
import { useUser } from '@/contexts/UserContext'

interface AppUser {
  id: string; auth_id: string; email: string; full_name: string
  role: 'admin' | 'manager' | 'user' | 'viewer'
  is_active: boolean; created_at: string; updated_at: string
}

const ROLES: { value: string; label: string; desc: string }[] = [
  { value: 'admin',   label: 'Admin',   desc: 'Full access including user management and settings' },
  { value: 'manager', label: 'Manager', desc: 'Approve/reject invoices, import, see prices' },
  { value: 'user',    label: 'User',    desc: 'Create and edit invoices, import data' },
  { value: 'viewer',  label: 'Viewer',  desc: 'Read-only access to invoices' },
]

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  admin:   { bg: 'rgba(180,60,60,0.1)',   color: '#B43C3C' },
  manager: { bg: 'rgba(60,100,180,0.1)',  color: '#3C64B4' },
  user:    { bg: 'rgba(60,150,100,0.1)',  color: '#3C9664' },
  viewer:  { bg: 'rgba(120,120,120,0.1)', color: '#787878' },
}

const EMPTY_FORM = { email: '', full_name: '', role: 'user', password: '' }

const th: React.CSSProperties = { padding: '0.5rem 0.6rem', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', borderBottom: '2px solid var(--border-base)', background: 'var(--bg-surface)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '0.55rem 0.6rem', borderBottom: '1px solid var(--border-light)', fontSize: 'var(--text-sm)', verticalAlign: 'middle' }

export default function UsersPage() {
  const { user: me } = useUser()
  const [users,   setUsers]   = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<AppUser | null>(null)
  const [form,    setForm]    = useState<Record<string, string>>(EMPTY_FORM)
  const [error,   setError]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const [showPwd, setShowPwd] = useState(false)

  async function fetchUsers() {
    setLoading(true)
    const res  = await fetch('/api/users')
    const json = await res.json()
    if (json.success) setUsers(json.data)
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, [])

  function openAdd() {
    setForm(EMPTY_FORM); setEditing(null); setError(''); setShowPwd(false); setModal('add')
  }
  function openEdit(u: AppUser) {
    setForm({ email: u.email, full_name: u.full_name, role: u.role, password: '' })
    setEditing(u); setError(''); setShowPwd(false); setModal('edit')
  }
  function closeModal() { setModal(null); setEditing(null) }

  async function handleSave() {
    setSaving(true); setError('')
    const body: Record<string, unknown> = {}
    if (modal === 'add') {
      body.email     = form.email.trim()
      body.full_name = form.full_name.trim()
      body.role      = form.role
      body.password  = form.password
    } else {
      body.full_name = form.full_name.trim()
      body.role      = form.role
      if (form.password.trim()) body.password = form.password.trim()
    }

    const url    = modal === 'edit' ? `/api/users/${editing!.id}` : '/api/users'
    const method = modal === 'edit' ? 'PATCH' : 'POST'
    const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json   = await res.json()
    if (!json.success) { setError(json.message); setSaving(false); return }
    closeModal(); fetchUsers()
    setSaving(false)
  }

  async function handleToggleActive(u: AppUser) {
    if (u.email === me?.email) return
    const res  = await fetch(`/api/users/${u.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !u.is_active }) })
    const json = await res.json()
    if (!json.success) alert(json.message)
    else fetchUsers()
  }

  async function handleDelete(u: AppUser) {
    if (u.email === me?.email) return
    if (!confirm(`Delete user "${u.full_name}" (${u.email})? This cannot be undone.`)) return
    const res  = await fetch(`/api/users/${u.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!json.success) alert(json.message)
    else fetchUsers()
  }

  const isSelf = (u: AppUser) => u.email === me?.email

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 400, margin: 0 }}>Users</h1>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>Manage team accounts and roles</p>
        </div>
        <button onClick={openAdd} style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i className="fa-solid fa-plus" style={{ fontSize: 11 }} /> Add User
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Email</th>
              <th style={th}>Role</th>
              <th style={{ ...th, textAlign: 'center' }}>Active</th>
              <th style={th}>Created</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Loading...</td></tr>}
            {!loading && users.map(u => {
              const self = isSelf(u)
              const rc   = ROLE_COLORS[u.role] ?? ROLE_COLORS.viewer
              return (
                <tr key={u.id} style={{ opacity: u.is_active ? 1 : 0.5 }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={{ ...td, fontFamily: 'var(--font-body)', fontWeight: 500 }}>
                    {u.full_name}
                    {self && <span style={{ marginLeft: 6, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>(you)</span>}
                  </td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{u.email}</td>
                  <td style={td}>
                    <span style={{ background: rc.bg, color: rc.color, fontSize: 'var(--text-xs)', fontWeight: 600, padding: '2px 8px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      {u.role}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <button onClick={() => handleToggleActive(u)} disabled={self}
                      style={{ background: 'none', border: 'none', cursor: self ? 'not-allowed' : 'pointer', fontSize: 16, color: u.is_active ? 'var(--color-success)' : 'var(--text-muted)' }}
                      title={self ? 'Cannot deactivate yourself' : u.is_active ? 'Deactivate' : 'Activate'}>
                      <i className={`fa-solid ${u.is_active ? 'fa-toggle-on' : 'fa-toggle-off'}`} />
                    </button>
                  </td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    {new Date(u.created_at).toLocaleDateString('en-CA')}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button onClick={() => openEdit(u)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', marginRight: 8, fontSize: 13 }} title="Edit"><i className="fa-solid fa-pen" /></button>
                    <button onClick={() => handleDelete(u)} disabled={self}
                      style={{ background: 'none', border: 'none', cursor: self ? 'not-allowed' : 'pointer', color: self ? 'var(--text-muted)' : 'var(--color-danger)', fontSize: 13 }}
                      title={self ? 'Cannot delete yourself' : 'Delete'}>
                      <i className="fa-solid fa-trash" />
                    </button>
                  </td>
                </tr>
              )
            })}
            {!loading && !users.length && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No users yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <AdminModal title={modal === 'add' ? 'Add User' : `Edit User — ${editing?.full_name}`} onClose={closeModal} width={480}>
          {modal === 'add' && (
            <div style={fieldStyle}>
              <label style={labelStyle}>Email *</label>
              <input type="email" style={inputStyle} placeholder="user@example.com" value={form.email}
                onChange={e => setForm(v => ({ ...v, email: e.target.value }))} />
            </div>
          )}
          <div style={fieldStyle}>
            <label style={labelStyle}>Full Name *</label>
            <input type="text" style={inputStyle} placeholder="Display name" value={form.full_name}
              onChange={e => setForm(v => ({ ...v, full_name: e.target.value }))} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Role *</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.role}
              onChange={e => setForm(v => ({ ...v, role: e.target.value }))}>
              {ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>{modal === 'add' ? 'Password *' : 'New Password'}</label>
            <div style={{ position: 'relative' }}>
              <input type={showPwd ? 'text' : 'password'} style={{ ...inputStyle, paddingRight: '2.5rem' }}
                placeholder={modal === 'edit' ? 'Leave blank to keep current' : 'Minimum 8 characters'}
                value={form.password} onChange={e => setForm(v => ({ ...v, password: e.target.value }))} />
              <button type="button" onClick={() => setShowPwd(v => !v)}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13 }}>
                <i className={`fa-solid ${showPwd ? 'fa-eye-slash' : 'fa-eye'}`} />
              </button>
            </div>
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
