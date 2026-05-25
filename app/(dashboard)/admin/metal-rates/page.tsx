'use client'

import { useEffect, useState } from 'react'
import { AdminModal, fieldStyle, labelStyle, inputStyle, btnPrimary, btnSecondary } from '@/components/admin/AdminModal'
import { Pagination } from '@/components/ui/Pagination'

interface Rate {
  id: string; rate_date: string
  gold_24k: number|null; gold_18kw: number|null; gold_18ky: number|null
  gold_14ky: number|null; platinum: number|null; silver: number|null; palladium: number|null
  created_at: string
}

const RATE_FIELDS = [
  { key: 'gold_24k',  label: '24K Gold'   },
  { key: 'gold_18kw', label: '18KW Gold'  },
  { key: 'gold_18ky', label: '18KY Gold'  },
  { key: 'gold_14ky', label: '14KY Gold'  },
  { key: 'platinum',  label: 'Platinum'   },
  { key: 'silver',    label: 'Silver'     },
  { key: 'palladium', label: 'Palladium'  },
]

const EMPTY_FORM = { rate_date: '', gold_24k: '', gold_18kw: '', gold_18ky: '', gold_14ky: '', platinum: '', silver: '', palladium: '' }

const th: React.CSSProperties = { padding: '0.5rem 0.6rem', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', borderBottom: '2px solid var(--border-base)', background: 'var(--bg-surface)', whiteSpace: 'nowrap', textAlign: 'right' }
const td: React.CSSProperties = { padding: '0.55rem 0.6rem', borderBottom: '1px solid var(--border-light)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', textAlign: 'right', verticalAlign: 'middle' }

export default function MetalRatesPage() {
  const [rates,   setRates]   = useState<Rate[]>([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Rate | null>(null)
  const [form,    setForm]    = useState<Record<string, string>>(EMPTY_FORM)
  const [error,   setError]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const [page,       setPage]       = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total,      setTotal]      = useState(0)

  async function fetchRates(p = page) {
    setLoading(true)
    const res  = await fetch(`/api/metal-rates?page=${p}`)
    const json = await res.json()
    if (json.success) { setRates(json.data); setTotalPages(json.pagination.totalPages); setTotal(json.pagination.total) }
    setLoading(false)
  }

  useEffect(() => { fetchRates() }, [page])

  function openAdd() {
    setForm({ ...EMPTY_FORM, rate_date: new Date().toISOString().slice(0, 10) })
    setEditing(null); setError(''); setModal('add')
  }
  function openEdit(r: Rate) {
    setForm(Object.fromEntries(RATE_FIELDS.map(f => [f.key, String(r[f.key as keyof Rate] ?? '')])))
    setForm(prev => ({ ...prev, rate_date: r.rate_date }))
    setEditing(r); setError(''); setModal('edit')
  }
  function closeModal() { setModal(null); setEditing(null) }

  async function handleSave() {
    setSaving(true); setError('')
    const body: Record<string, unknown> = { rate_date: form.rate_date }
    RATE_FIELDS.forEach(f => { if (form[f.key] !== '') body[f.key] = parseFloat(form[f.key]) })

    const url    = modal === 'edit' ? `/api/metal-rates/${editing!.id}` : '/api/metal-rates'
    const method = modal === 'edit' ? 'PATCH' : 'POST'
    const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json   = await res.json()
    if (!json.success) { setError(json.message); setSaving(false); return }
    closeModal(); fetchRates()
    setSaving(false)
  }

  async function handleDelete(r: Rate) {
    if (!confirm(`Delete rate for ${r.rate_date}?`)) return
    const res  = await fetch(`/api/metal-rates/${r.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!json.success) alert(json.message)
    else fetchRates()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 400, margin: 0 }}>Metal Rates</h1>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>Daily USD/gram prices for gold, platinum, silver</p>
        </div>
        <button onClick={openAdd} style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i className="fa-solid fa-plus" style={{ fontSize: 11 }} /> Add Rate
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Date</th>
              {RATE_FIELDS.map(f => <th key={f.key} style={th}>{f.label}</th>)}
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Loading...</td></tr>}
            {!loading && rates.map(r => (
              <tr key={r.id} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{r.rate_date}</td>
                {RATE_FIELDS.map(f => <td key={f.key} style={td}>{r[f.key as keyof Rate] != null ? `$${Number(r[f.key as keyof Rate]).toFixed(4)}` : '—'}</td>)}
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <button onClick={() => openEdit(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', marginRight: 8, fontSize: 13 }} title="Edit"><i className="fa-solid fa-pen" /></button>
                  <button onClick={() => handleDelete(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', fontSize: 13 }} title="Delete"><i className="fa-solid fa-trash" /></button>
                </td>
              </tr>
            ))}
            {!loading && !rates.length && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No rates yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} pageSize={20} onPageChange={setPage} />

      {modal && (
        <AdminModal title={modal === 'add' ? 'Add Metal Rate' : `Edit Rate — ${editing?.rate_date}`} onClose={closeModal}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Date *</label>
            <input type="date" style={inputStyle} value={form.rate_date} onChange={e => setForm(v => ({ ...v, rate_date: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            {RATE_FIELDS.map(f => (
              <div key={f.key}>
                <label style={labelStyle}>{f.label} (USD/g)</label>
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
