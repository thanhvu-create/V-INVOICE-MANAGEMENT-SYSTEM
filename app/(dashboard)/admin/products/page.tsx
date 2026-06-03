'use client'

import { useEffect, useState } from 'react'
import { AdminModal, fieldStyle, labelStyle, inputStyle, btnPrimary, btnSecondary } from '@/components/admin/AdminModal'
import { Pagination } from '@/components/ui/Pagination'
import { toast } from '@/components/ui/Toast'
import { DriveImageInput } from '@/components/ui/DriveImageInput'
import { DriveImage } from '@/components/invoice/DriveImage'

interface Product {
  id: string; sku_jwmold: string; description: string | null
  class: string | null; sub_class: string | null; metal_type: string | null
  image_url: string | null
  labor_fee: number | null; casting_fee: number | null; design_fee: number | null
  resin_fee: number | null; misc_fee: number | null
  is_active: boolean; created_at: string
}

const FEE_FIELDS = [
  { key: 'labor_fee',   label: 'Labor Fee'   },
  { key: 'casting_fee', label: 'Casting Fee' },
  { key: 'design_fee',  label: 'Design Fee'  },
  { key: 'resin_fee',   label: 'Resin Fee'   },
  { key: 'misc_fee',    label: 'Misc Fee'    },
]

const EMPTY_FORM = { sku_jwmold: '', description: '', class: '', sub_class: '', metal_type: '', image_url: '', labor_fee: '', casting_fee: '', design_fee: '', resin_fee: '', misc_fee: '' }

const th: React.CSSProperties = { padding: '0.5rem 0.6rem', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', borderBottom: '2px solid var(--border-base)', background: 'var(--bg-surface)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '0.55rem 0.6rem', borderBottom: '1px solid var(--border-light)', fontSize: 'var(--text-sm)', verticalAlign: 'middle' }

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState<'add' | 'edit' | null>(null)
  const [editing,  setEditing]  = useState<Product | null>(null)
  const [form,     setForm]     = useState<Record<string, string>>(EMPTY_FORM)
  const [error,    setError]    = useState('')
  const [saving,   setSaving]   = useState(false)
  const [search,   setSearch]   = useState('')
  const [page,       setPage]       = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total,      setTotal]      = useState(0)

  async function fetchProducts(p = page, q = search) {
    setLoading(true)
    const params = new URLSearchParams({ page: String(p) })
    if (q.trim()) params.set('search', q.trim())
    const res  = await fetch(`/api/products?${params}`)
    const json = await res.json()
    if (json.success) { setProducts(json.data); setTotalPages(json.pagination?.totalPages ?? 1); setTotal(json.pagination?.total ?? 0) }
    setLoading(false)
  }

  useEffect(() => { fetchProducts(page, search) }, [page])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault(); setPage(1); fetchProducts(1, search)
  }

  function openAdd() {
    setForm(EMPTY_FORM); setEditing(null); setError(''); setModal('add')
  }
  function openEdit(p: Product) {
    setForm({
      sku_jwmold: p.sku_jwmold, description: p.description ?? '',
      class: p.class ?? '', sub_class: p.sub_class ?? '', metal_type: p.metal_type ?? '',
      image_url: p.image_url ?? '',
      ...Object.fromEntries(FEE_FIELDS.map(f => [f.key, p[f.key as keyof Product] != null ? String(p[f.key as keyof Product]) : ''])),
    })
    setEditing(p); setError(''); setModal('edit')
  }
  function closeModal() { setModal(null); setEditing(null) }

  async function handleSave() {
    setSaving(true); setError('')
    const body: Record<string, unknown> = {
      description: form.description.trim() || null,
      class: form.class.trim() || null,
      sub_class: form.sub_class.trim() || null,
      metal_type: form.metal_type.trim() || null,
      image_url: form.image_url.trim() || null,
    }
    if (modal === 'add') body.sku_jwmold = form.sku_jwmold.trim().toUpperCase()
    FEE_FIELDS.forEach(f => { body[f.key] = form[f.key] !== '' ? parseFloat(form[f.key]) : null })

    const url    = modal === 'edit' ? `/api/products/${editing!.id}` : '/api/products'
    const method = modal === 'edit' ? 'PATCH' : 'POST'
    const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json   = await res.json()
    if (!json.success) { setError(json.message); setSaving(false); return }
    toast(modal === 'edit' ? 'Product updated.' : 'Product added.', 'success')
    closeModal(); fetchProducts()
    setSaving(false)
  }

  async function handleToggleActive(p: Product) {
    const res  = await fetch(`/api/products/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !p.is_active }) })
    const json = await res.json()
    if (!json.success) toast(json.message || 'Failed to update product.', 'error')
    else { toast(p.is_active ? 'Product deactivated.' : 'Product activated.', 'success'); fetchProducts() }
  }

  async function handleDelete(p: Product) {
    if (!confirm(`Delete product "${p.sku_jwmold}"? This cannot be undone.`)) return
    const res  = await fetch(`/api/products/${p.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!json.success) toast(json.message || 'Failed to delete product.', 'error')
    else { toast('Product deleted.', 'success'); fetchProducts() }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 400, margin: 0 }}>Products</h1>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>SKU catalog with default fee rates</p>
        </div>
        <button onClick={openAdd} style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i className="fa-solid fa-plus" style={{ fontSize: 11 }} /> Add Product
        </button>
      </div>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
        <input type="text" placeholder="Search SKU or description…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, width: 280 }} />
        <button type="submit" style={{ ...btnSecondary, padding: '0.5rem 1rem' }}>Search</button>
        {search && <button type="button" onClick={() => { setSearch(''); setPage(1); fetchProducts(1, '') }} style={{ ...btnSecondary, padding: '0.5rem 1rem' }}>Clear</button>}
      </form>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 52 }}>Hình</th>
              <th style={th}>SKU</th>
              <th style={th}>Description</th>
              <th style={th}>Metal</th>
              {FEE_FIELDS.map(f => <th key={f.key} style={{ ...th, textAlign: 'right' }}>{f.label}</th>)}
              <th style={{ ...th, textAlign: 'center' }}>Active</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Loading...</td></tr>}
            {!loading && products.map(p => (
              <tr key={p.id} style={{ opacity: p.is_active ? 1 : 0.5 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <td style={{ ...td, padding: '4px 6px' }}>
                  <DriveImage url={p.image_url} alt={p.sku_jwmold} size={40} />
                </td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontWeight: 600, background: 'rgba(200,180,100,0.08)' }}>{p.sku_jwmold}</td>
                <td style={{ ...td, fontFamily: 'var(--font-body)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description ?? '—'}</td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{p.metal_type ?? '—'}</td>
                {FEE_FIELDS.map(f => (
                  <td key={f.key} style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {p[f.key as keyof Product] != null ? `$${Number(p[f.key as keyof Product]).toFixed(2)}` : '—'}
                  </td>
                ))}
                <td style={{ ...td, textAlign: 'center' }}>
                  <button onClick={() => handleToggleActive(p)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: p.is_active ? 'var(--color-success)' : 'var(--text-muted)' }}
                    title={p.is_active ? 'Deactivate' : 'Activate'}>
                    <i className={`fa-solid ${p.is_active ? 'fa-toggle-on' : 'fa-toggle-off'}`} />
                  </button>
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <button onClick={() => openEdit(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', marginRight: 8, fontSize: 13 }} title="Edit"><i className="fa-solid fa-pen" /></button>
                  <button onClick={() => handleDelete(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', fontSize: 13 }} title="Delete"><i className="fa-solid fa-trash" /></button>
                </td>
              </tr>
            ))}
            {!loading && !products.length && <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No products found.</td></tr>}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} pageSize={20} onPageChange={setPage} />

      {modal && (
        <AdminModal title={modal === 'add' ? 'Add Product' : `Edit Product — ${editing?.sku_jwmold}`} onClose={closeModal} width={580}>
          {/* Image preview at top when editing and has image */}
          {modal === 'edit' && form.image_url && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', background: 'var(--bg-base)', border: '1px solid var(--border-light)', marginBottom: '1rem' }}>
              <DriveImage url={form.image_url} alt={form.sku_jwmold} size={80} />
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Hình hiện tại</div>
                <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', wordBreak: 'break-all', maxWidth: 340 }}>{form.image_url}</div>
              </div>
            </div>
          )}

          {modal === 'add' && (
            <div style={fieldStyle}>
              <label style={labelStyle}>SKU (JWMold) *</label>
              <input type="text" style={inputStyle} placeholder="e.g. JW-1234" value={form.sku_jwmold}
                onChange={e => setForm(v => ({ ...v, sku_jwmold: e.target.value }))} />
            </div>
          )}
          <div style={fieldStyle}>
            <label style={labelStyle}>Description</label>
            <input type="text" style={inputStyle} placeholder="Product description" value={form.description}
              onChange={e => setForm(v => ({ ...v, description: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <label style={labelStyle}>Class</label>
              <input type="text" style={inputStyle} value={form.class} onChange={e => setForm(v => ({ ...v, class: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Sub Class</label>
              <input type="text" style={inputStyle} value={form.sub_class} onChange={e => setForm(v => ({ ...v, sub_class: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Metal Type</label>
              <input type="text" style={inputStyle} placeholder="18KY, PT950…" value={form.metal_type} onChange={e => setForm(v => ({ ...v, metal_type: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            {FEE_FIELDS.map(f => (
              <div key={f.key}>
                <label style={labelStyle}>{f.label} (USD)</label>
                <input type="number" step="0.01" min="0" style={inputStyle} placeholder="0.00"
                  value={form[f.key]} onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <DriveImageInput
              label="Hình ảnh (Google Drive link hoặc URL)"
              value={form.image_url}
              onChange={v => setForm(f => ({ ...f, image_url: v }))}
            />
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
