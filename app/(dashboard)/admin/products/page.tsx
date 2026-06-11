'use client'

import { useEffect, useState, useRef } from 'react'
import { AdminModal, fieldStyle, labelStyle, inputStyle, btnPrimary, btnSecondary } from '@/components/admin/AdminModal'
import { toast } from '@/components/ui/Toast'
import { goldPricePerGram, type NVLSnapshot } from '@/lib/formulas/pricing'

const LS_KEY = 'nvl_custom_karats'

const DEFAULT_KARATS = ['24K','23K','22K','18K','17K','16K','15K','14K','10K','AG','PD','PT950']

function loadCustomKarats(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
function saveCustomKarats(list: string[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(list))
}

interface NVLPrice {
  id:             string
  gold_24k:       number | null
  pt_price:       number | null
  ag_price:       number | null
  pd_price:       number | null
  loss_gold:      number | null
  loss_pt:        number | null
  tag_multiplier: number | null
  fr_multiplier:  number | null
  updated_at:     string
}

const FIELDS: { key: keyof Omit<NVLPrice, 'id' | 'created_at'>; label: string; unit: string; step: string }[] = [
  { key: 'gold_24k',       label: 'Gold 24K',          unit: '$/oz', step: '0.01'  },
  { key: 'pt_price',       label: 'Platinum',          unit: '$/oz', step: '0.01'  },
  { key: 'ag_price',       label: 'Silver',            unit: '$/oz', step: '0.01'  },
  { key: 'pd_price',       label: 'Palladium',         unit: '$/oz', step: '0.01'  },
  { key: 'loss_gold',      label: 'Loss Gold',         unit: '%',    step: '0.001' },
  { key: 'loss_pt',        label: 'Loss Pt/Ag/Pd',     unit: '%',    step: '0.001' },
  { key: 'tag_multiplier', label: 'Tag Multiplier',    unit: '×',    step: '0.01'  },
  { key: 'fr_multiplier',  label: 'FB/FR Multiplier',  unit: '×',    step: '0.01'  },
]

const EMPTY_FORM: Record<string, string> = {
  gold_24k: '', pt_price: '', ag_price: '', pd_price: '',
  loss_gold: '0.06', loss_pt: '0.17',
  tag_multiplier: '', fr_multiplier: '',
}

function karatFormula(loai: string): string {
  const k = loai.substring(0, 2).toUpperCase()
  if (k === 'AG')  return 'spot_ag × (1+loss_gold) × (1+loss_pt) ÷ 31.103'
  if (k === 'PD')  return 'spot_pd × (1+loss_pt) ÷ 31.103'
  if (k === 'PT')  return 'spot_pt × (1+loss_pt) ÷ 31.103'
  const num = parseInt(k)
  if (!isNaN(num)) {
    if (num >= 23) return `spot × (${num}/24) ÷ 31.103`
    if (num === 24) return 'spot ÷ 31.103'
    return `spot × (1+loss) × (${num}/24) ÷ 31.103`
  }
  return ''
}

const th: React.CSSProperties = { padding: '0.5rem 0.75rem', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', borderBottom: '2px solid var(--border-base)', background: 'var(--bg-surface)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '0.55rem 0.75rem', borderBottom: '1px solid var(--border-light)', fontSize: 'var(--text-sm)', verticalAlign: 'middle' }

export default function NVLPricesPage() {
  const [rows,         setRows]         = useState<NVLPrice[]>([])
  const [loading,      setLoading]      = useState(true)
  const [modal,        setModal]        = useState<'add' | 'edit' | null>(null)
  const [editing,      setEditing]      = useState<NVLPrice | null>(null)
  const [form,         setForm]         = useState<Record<string, string>>(EMPTY_FORM)
  const [error,        setError]        = useState('')
  const [saving,       setSaving]       = useState(false)
  const [customKarats, setCustomKarats] = useState<string[]>([])
  const [newKarat,     setNewKarat]     = useState('')
  const newKaratRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setCustomKarats(loadCustomKarats())
  }, [])

  function addKarat() {
    const raw = newKarat.trim().toUpperCase().replace(/\s/g, '')
    if (!raw) return
    // Normalize: "8" → "8K", "8k" → "8K", "8K" → "8K"
    const label = /^\d+$/.test(raw) ? `${raw}K` : raw
    const allKarats = [...DEFAULT_KARATS, ...customKarats]
    if (allKarats.some(k => k.toUpperCase() === label)) {
      toast('Karat này đã có trong danh sách.', 'warn'); setNewKarat(''); return
    }
    const updated = [...customKarats, label]
    setCustomKarats(updated)
    saveCustomKarats(updated)
    setNewKarat('')
    newKaratRef.current?.focus()
  }

  function removeKarat(label: string) {
    const updated = customKarats.filter(k => k !== label)
    setCustomKarats(updated)
    saveCustomKarats(updated)
  }

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

  // Build NVL snapshot from latest row for derived prices
  const latest = rows[0] ?? null
  const nvlSnap: NVLSnapshot | null = latest ? {
    spot_gold_24k:  latest.gold_24k  ?? 0,
    spot_pt:        latest.pt_price  ?? 0,
    spot_ag:        latest.ag_price  ?? 0,
    spot_pd:        latest.pd_price  ?? 0,
    loss_gold:      latest.loss_gold ?? 0.06,
    loss_pt:        latest.loss_pt   ?? 0.17,
    tag_multiplier: latest.tag_multiplier ?? 0,
    fr_multiplier:  latest.fr_multiplier  ?? 0,
  } : null

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 400, margin: 0 }}>NVL Prices</h1>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>Bảng giá nguyên vật liệu — snapshot cho invoice mới</p>
        </div>
        <button onClick={openAdd} style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i className="fa-solid fa-plus" style={{ fontSize: 11 }} /> Add Row
        </button>
      </div>

      {/* Spot price table */}
      <div style={{ overflowX: 'auto', marginBottom: '2.5rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {FIELDS.map(f => (
                <th key={f.key} style={{ ...th, textAlign: 'right' }}>
                  {f.label} <span style={{ fontWeight: 400, opacity: 0.6 }}>({f.unit})</span>
                </th>
              ))}
              <th style={th}>Updated</th>
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
                        : f.unit === '×'
                          ? `${Number(r[f.key]).toFixed(2)}×`
                          : `$${Number(r[f.key]).toFixed(2)}`
                      : '—'}
                  </td>
                ))}
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {(r.updated_at ?? '').slice(0, 10)}
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

      {/* Derived $/gram section */}
      {nvlSnap && (
        <div>
          {/* Section header + spot summary */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                Giá $/gram (tính từ spot LATEST)
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                Gold: ${nvlSnap.spot_gold_24k.toFixed(2)}/oz · Loss Gold: {(nvlSnap.loss_gold * 100).toFixed(1)}% · Loss Pt: {(nvlSnap.loss_pt * 100).toFixed(1)}%
              </span>
            </div>

            {/* Add custom karat */}
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <input
                ref={newKaratRef}
                type="text"
                value={newKarat}
                onChange={e => setNewKarat(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addKarat() }}
                placeholder="VD: 8K, 9K, 12K"
                style={{
                  padding: '0.3rem 0.6rem', border: '1px solid var(--border-base)',
                  fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
                  background: 'var(--bg-surface)', color: 'var(--text-primary)',
                  width: 120, outline: 'none',
                }}
              />
              <button
                onClick={addKarat}
                style={{ padding: '0.3rem 0.75rem', background: 'var(--text-primary)', color: 'var(--bg-base)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.06em' }}
              >
                + Thêm
              </button>
            </div>
          </div>

          {/* Karat grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '1px', background: 'var(--border-light)', border: '1px solid var(--border-light)' }}>
            {[...DEFAULT_KARATS, ...customKarats].map(label => {
              const loai          = label === 'PT950' ? 'PT' : label
              const pricePerGram  = goldPricePerGram(loai, nvlSnap)
              const isCustom      = customKarats.includes(label)
              return (
                <div key={label} style={{ background: 'var(--bg-surface)', padding: '0.9rem 1rem', position: 'relative' }}>
                  {/* Remove button for custom karats */}
                  {isCustom && (
                    <button
                      onClick={() => removeKarat(label)}
                      title="Xóa karat này"
                      style={{ position: 'absolute', top: 4, right: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', fontSize: 10, lineHeight: 1, padding: 2 }}
                    >
                      ✕
                    </button>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.08em', color: isCustom ? '#6B21A8' : 'var(--text-primary)' }}>
                      {label}
                      {isCustom && <span style={{ fontSize: 8, marginLeft: 4, color: '#6B21A8', fontWeight: 400 }}>custom</span>}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {pricePerGram != null ? `$${pricePerGram.toFixed(4)}` : '—'}
                    </span>
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 0 }}>
                    {karatFormula(loai)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <AdminModal title={modal === 'add' ? 'Add NVL Prices' : 'Edit NVL Prices'} onClose={closeModal} width={480}>
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
