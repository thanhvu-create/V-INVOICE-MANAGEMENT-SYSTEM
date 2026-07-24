'use client'

import { useEffect, useState } from 'react'
import { AdminModal, fieldStyle, labelStyle, inputStyle, btnPrimary, btnSecondary } from '@/components/admin/AdminModal'
import { toast } from '@/components/ui/Toast'
import { resolveMetalPricePerGram, type NVLSnapshot, type MetalTypeRule } from '@/lib/formulas/pricing'

interface Row extends MetalTypeRule {
  id: string
  label: string | null
}

const EMPTY: Record<string, string> = {
  code: '', label: '', price_mode: 'fixed',
  base_kind: 'karat', karat: '', surcharge_per_gram: '0', fixed_per_gram: '',
}

const th: React.CSSProperties = {
  padding: '0.45rem 0.75rem', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
  fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase',
  color: 'var(--text-secondary)', borderBottom: '2px solid var(--border-base)',
  background: 'var(--bg-base)', whiteSpace: 'nowrap', textAlign: 'left',
}
const td: React.CSSProperties = {
  padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)',
  fontSize: 'var(--text-sm)', verticalAlign: 'middle',
}

function describe(r: Row): string {
  if (r.price_mode === 'fixed') return 'cố định $/gram'
  const base = r.base_kind === 'karat' ? `${r.karat}K` : (r.base_kind ?? '').toUpperCase()
  const s = r.surcharge_per_gram ?? 0
  return s ? `${base} ${s > 0 ? '+' : ''}${s}` : base
}

export function MetalTypeRegistry({ nvlSnap, canEdit }: { nvlSnap: NVLSnapshot | null; canEdit: boolean }) {
  const [rows,    setRows]    = useState<Row[]>([])
  const [modal,   setModal]   = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Row | null>(null)
  const [form,    setForm]    = useState<Record<string, string>>(EMPTY)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  async function fetchRows() {
    const res = await fetch('/api/admin/metal-types')
    const json = await res.json()
    if (json.success) setRows(json.data)
  }
  useEffect(() => { fetchRows() }, [])

  function openAdd() { setForm(EMPTY); setEditing(null); setError(''); setModal('add') }
  function openEdit(r: Row) {
    setForm({
      code: r.code, label: r.label ?? '', price_mode: r.price_mode,
      base_kind: r.base_kind ?? 'karat',
      karat: r.karat != null ? String(r.karat) : '',
      surcharge_per_gram: r.surcharge_per_gram != null ? String(r.surcharge_per_gram) : '0',
      fixed_per_gram: r.fixed_per_gram != null ? String(r.fixed_per_gram) : '',
    })
    setEditing(r); setError(''); setModal('edit')
  }
  function close() { setModal(null); setEditing(null) }

  async function save() {
    setSaving(true); setError('')
    const body: Record<string, unknown> = {
      code: form.code.trim().toUpperCase(),
      label: form.label.trim() || null,
      price_mode: form.price_mode,
    }
    if (form.price_mode === 'dynamic') {
      body.base_kind = form.base_kind
      body.karat = form.base_kind === 'karat' && form.karat !== '' ? parseInt(form.karat) : null
      body.surcharge_per_gram = form.surcharge_per_gram !== '' ? parseFloat(form.surcharge_per_gram) : 0
    } else {
      body.fixed_per_gram = form.fixed_per_gram !== '' ? parseFloat(form.fixed_per_gram) : null
    }
    if (modal === 'edit') body.id = editing!.id
    const res = await fetch('/api/admin/metal-types', {
      method: modal === 'edit' ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!json.success) { setError(json.message); setSaving(false); return }
    toast(modal === 'edit' ? 'Đã cập nhật.' : 'Đã thêm loại đặc biệt.', 'success')
    close(); fetchRows(); setSaving(false)
  }

  async function remove(r: Row) {
    if (!confirm(`Xóa loại "${r.code}"?`)) return
    const res = await fetch(`/api/admin/metal-types?id=${r.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!json.success) toast(json.message || 'Xóa thất bại.', 'error')
    else { toast('Đã xóa.', 'success'); fetchRows() }
  }

  return (
    <div style={{ marginTop: '2.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            Loại đặc biệt (Override)
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 3 }}>
            Mã khớp chính xác được ưu tiên hơn công thức mặc định · $/gram theo LATEST spot
          </div>
        </div>
        {canEdit && <button onClick={openAdd} style={{ ...btnPrimary, padding: '0.35rem 0.9rem', fontSize: 'var(--text-xs)' }}>+ Thêm loại đặc biệt</button>}
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--border-light)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr>
              {['Mã', 'Tên', 'Cách tính', '$/gram', 'Active', ''].map((h, i) => (
                <th key={i} style={{ ...th, textAlign: i === 3 ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const price = nvlSnap ? resolveMetalPricePerGram(r.code, nvlSnap, rows) : null
              return (
                <tr key={r.id}>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{r.code}</td>
                  <td style={{ ...td, color: 'var(--text-muted)' }}>{r.label ?? '—'}</td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{describe(r)}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{price != null ? `$${price.toFixed(4)}` : '—'}</td>
                  <td style={{ ...td }}>{r.active === false ? '✕' : '✓'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {canEdit && <>
                      <button onClick={() => openEdit(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', marginRight: 8 }} title="Edit"><i className="fa-solid fa-pen" /></button>
                      <button onClick={() => remove(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)' }} title="Delete"><i className="fa-solid fa-trash" /></button>
                    </>}
                  </td>
                </tr>
              )
            })}
            {!rows.length && (
              <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>
                Chưa có loại đặc biệt. Thêm SV925 / 18KW… để định giá chính xác khi import.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <AdminModal title={modal === 'add' ? 'Thêm loại đặc biệt' : 'Sửa loại đặc biệt'} onClose={close} width={480}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Mã (code)</label>
              <input style={inputStyle} placeholder="SV925" value={form.code}
                onChange={e => setForm(v => ({ ...v, code: e.target.value }))} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Tên (label)</label>
              <input style={inputStyle} placeholder="Silver 925" value={form.label}
                onChange={e => setForm(v => ({ ...v, label: e.target.value }))} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Kiểu giá</label>
              <select style={inputStyle} value={form.price_mode}
                onChange={e => setForm(v => ({ ...v, price_mode: e.target.value }))}>
                <option value="fixed">Cố định $/gram</option>
                <option value="dynamic">Theo công thức (động)</option>
              </select>
            </div>
            {form.price_mode === 'fixed' ? (
              <div style={fieldStyle}>
                <label style={labelStyle}>Giá $/gram</label>
                <input type="number" step="0.01" min="0" style={inputStyle} placeholder="3.20" value={form.fixed_per_gram}
                  onChange={e => setForm(v => ({ ...v, fixed_per_gram: e.target.value }))} />
              </div>
            ) : (<>
              <div style={fieldStyle}>
                <label style={labelStyle}>Gốc</label>
                <select style={inputStyle} value={form.base_kind}
                  onChange={e => setForm(v => ({ ...v, base_kind: e.target.value }))}>
                  <option value="karat">Tuổi vàng (karat)</option>
                  <option value="ag">AG (bạc)</option>
                  <option value="pt">PT (platinum)</option>
                  <option value="pd">PD (palladium)</option>
                </select>
              </div>
              {form.base_kind === 'karat' && (
                <div style={fieldStyle}>
                  <label style={labelStyle}>Karat</label>
                  <input type="number" step="1" min="1" max="24" style={inputStyle} placeholder="18" value={form.karat}
                    onChange={e => setForm(v => ({ ...v, karat: e.target.value }))} />
                </div>
              )}
              <div style={fieldStyle}>
                <label style={labelStyle}>Phụ phí $/gram (±)</label>
                <input type="number" step="0.01" style={inputStyle} placeholder="0" value={form.surcharge_per_gram}
                  onChange={e => setForm(v => ({ ...v, surcharge_per_gram: e.target.value }))} />
              </div>
            </>)}
          </div>
          {error && <p style={{ color: 'var(--color-danger)', fontSize: 'var(--text-sm)', marginBottom: '1rem' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
            <button onClick={close} style={btnSecondary}>Hủy</button>
          </div>
        </AdminModal>
      )}
    </div>
  )
}
