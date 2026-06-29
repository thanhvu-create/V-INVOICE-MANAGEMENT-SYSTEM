'use client'

import { useEffect, useState, useRef } from 'react'
import { AdminModal, fieldStyle, labelStyle, inputStyle, btnPrimary, btnSecondary } from '@/components/admin/AdminModal'
import { toast } from '@/components/ui/Toast'
import { goldPricePerGram, type NVLSnapshot } from '@/lib/formulas/pricing'
import { useUser } from '@/contexts/UserContext'

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
  { key: 'gold_24k',       label: 'Gold 24K',         unit: '$/oz', step: '0.01'  },
  { key: 'pt_price',       label: 'Platinum',         unit: '$/oz', step: '0.01'  },
  { key: 'ag_price',       label: 'Silver',           unit: '$/oz', step: '0.01'  },
  { key: 'pd_price',       label: 'Palladium',        unit: '$/oz', step: '0.01'  },
  { key: 'loss_gold',      label: 'Loss Gold',        unit: '%',    step: '0.001' },
  { key: 'loss_pt',        label: 'Loss Pt/Ag/Pd',    unit: '%',    step: '0.001' },
  { key: 'tag_multiplier', label: 'Tag Multiplier',   unit: '×',    step: '0.01'  },
  { key: 'fr_multiplier',  label: 'FB/FR Multiplier', unit: '×',    step: '0.01'  },
]

const EMPTY_FORM: Record<string, string> = {
  gold_24k: '', pt_price: '', ag_price: '', pd_price: '',
  loss_gold: '0.06', loss_pt: '0.17',
  tag_multiplier: '', fr_multiplier: '',
}

// ─── Custom karat localStorage ───────────────────────────────────────────────
const LS_KEY = 'nvl_custom_karats'
function loadCustomKarats(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') } catch { return [] }
}
function saveCustomKarats(list: string[]) { localStorage.setItem(LS_KEY, JSON.stringify(list)) }

// ─── Default karat groups ────────────────────────────────────────────────────
const GOLD_KARATS  = ['24K','23K','22K','18K','17K','16K','15K','14K','10K']
const METAL_KARATS = ['PT950','AG','PD']

function karatFormula(loai: string): string {
  const k = loai.substring(0, 2).toUpperCase()
  if (k === 'AG')  return 'spot_ag × (1+loss_g) × (1+loss_pt) ÷ 31.103'
  if (k === 'PD')  return 'spot_pd × (1+loss_pt) ÷ 31.103'
  if (k === 'PT')  return 'spot_pt × (1+loss_pt) ÷ 31.103'
  const num = parseInt(k)
  if (!isNaN(num) && num >= 23) return `spot × (${num}/24) ÷ 31.103`
  if (!isNaN(num) && num === 24) return 'spot ÷ 31.103'
  if (!isNaN(num)) return `spot × (1+loss) × (${num}/24) ÷ 31.103`
  return ''
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const sectionLabel: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600,
  letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-secondary)',
}
const th: React.CSSProperties = {
  padding: '0.45rem 0.75rem', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
  fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase',
  color: 'var(--text-secondary)', borderBottom: '2px solid var(--border-base)',
  background: 'var(--bg-base)', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)',
  fontSize: 'var(--text-sm)', verticalAlign: 'middle',
}

// ─── KaratCard ───────────────────────────────────────────────────────────────
function KaratCard({ label, loai, price, isCustom, onRemove }: {
  label: string; loai: string; price: number | null
  isCustom: boolean; onRemove?: () => void
}) {
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
      padding: '0.85rem 1rem', position: 'relative',
      borderLeft: isCustom ? '3px solid #6B21A8' : '3px solid var(--border-light)',
    }}>
      {isCustom && onRemove && (
        <button onClick={onRemove} title="Xóa" style={{
          position: 'absolute', top: 4, right: 5, background: 'none', border: 'none',
          cursor: 'pointer', color: 'var(--color-danger)', fontSize: 11, lineHeight: 1, padding: 2,
        }}>✕</button>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 700,
          letterSpacing: '0.08em', color: isCustom ? '#6B21A8' : 'var(--text-primary)',
        }}>
          {label}
          {isCustom && <span style={{ fontSize: 8, marginLeft: 5, fontWeight: 400, color: '#6B21A8' }}>custom</span>}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-primary)' }}>
          {price != null ? `$${price.toFixed(4)}` : '—'}
        </span>
      </div>
      <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.4 }}>
        {karatFormula(loai)}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function NVLPricesPage() {
  const { canDo } = useUser()
  const canEdit   = canDo('manage_rates')
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

  async function fetchRows() {
    setLoading(true)
    const res  = await fetch('/api/metal-rates')
    const json = await res.json()
    if (json.success) setRows(json.data)
    setLoading(false)
  }
  useEffect(() => { fetchRows() }, [])

  function openAdd() { setForm(EMPTY_FORM); setEditing(null); setError(''); setModal('add') }
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
    toast(modal === 'edit' ? 'Đã cập nhật NVL prices.' : 'Đã thêm NVL row.', 'success')
    closeModal(); fetchRows(); setSaving(false)
  }

  async function handleDelete(r: NVLPrice) {
    if (!confirm('Xóa dòng NVL price này?')) return
    const res  = await fetch(`/api/metal-rates/${r.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!json.success) toast(json.message || 'Xóa thất bại.', 'error')
    else { toast('Đã xóa.', 'success'); fetchRows() }
  }

  function addKarat() {
    const raw   = newKarat.trim().toUpperCase().replace(/\s/g, '')
    if (!raw) return
    const label = /^\d+$/.test(raw) ? `${raw}K` : raw
    const all   = [...GOLD_KARATS, ...METAL_KARATS, ...customKarats]
    if (all.some(k => k.toUpperCase() === label)) {
      toast('Karat này đã có trong danh sách.', 'warn'); setNewKarat(''); return
    }
    const updated = [...customKarats, label]
    setCustomKarats(updated); saveCustomKarats(updated); setNewKarat('')
    newKaratRef.current?.focus()
  }

  function removeKarat(label: string) {
    const updated = customKarats.filter(k => k !== label)
    setCustomKarats(updated); saveCustomKarats(updated)
  }

  // Build NVL snapshot from latest row
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
    cif_rate:       null,  // use template default
  } : null

  const allGoldKarats   = [...GOLD_KARATS,  ...customKarats.filter(k => !METAL_KARATS.some(m => m.toUpperCase() === k))]
  const allMetalKarats  = [...METAL_KARATS, ...customKarats.filter(k =>  METAL_KARATS.some(m => m.toUpperCase() === k))]

  return (
    <div style={{ maxWidth: 1200 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 400, margin: 0 }}>NVL Prices</h1>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4, margin: '4px 0 0' }}>
            Bảng giá nguyên vật liệu — snapshot cho invoice mới
          </p>
        </div>
        {canEdit && <button onClick={openAdd} style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i className="fa-solid fa-plus" style={{ fontSize: 11 }} /> Add Row
        </button>}
      </div>

      {/* ── Latest Spot Summary Cards ── */}
      {nvlSnap && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          {[
            { label: 'Gold 24K', value: nvlSnap.spot_gold_24k, unit: '$/oz', accent: '#92400E' },
            { label: 'Platinum', value: nvlSnap.spot_pt,       unit: '$/oz', accent: '#374151' },
            { label: 'Silver',   value: nvlSnap.spot_ag,       unit: '$/oz', accent: '#6B7280' },
            { label: 'Palladium',value: nvlSnap.spot_pd,       unit: '$/oz', accent: '#374151' },
            { label: 'Loss Gold',value: nvlSnap.loss_gold * 100, unit: '%', accent: '#065F46', fmt: (v: number) => `${v.toFixed(1)}%` },
            { label: 'Loss Pt/Ag/Pd',value: nvlSnap.loss_pt * 100, unit: '%', accent: '#065F46', fmt: (v: number) => `${v.toFixed(1)}%` },
            { label: 'Tag ×',    value: nvlSnap.tag_multiplier ?? 0, unit: '×', accent: '#1E40AF', fmt: (v: number) => v > 0 ? `${v.toFixed(2)}×` : '—' },
            { label: 'FB/FR ×',  value: nvlSnap.fr_multiplier  ?? 0, unit: '×', accent: '#1E40AF', fmt: (v: number) => v > 0 ? `${v.toFixed(2)}×` : '—' },
          ].map(({ label, value, accent, fmt }) => (
            <div key={label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', padding: '0.85rem 1rem', borderTop: `3px solid ${accent}` }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
                {label}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>
                {fmt ? fmt(value) : `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── History Table ── */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ ...sectionLabel, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Lịch sử cập nhật giá
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
            — dòng đầu tiên là LATEST (dùng cho invoice mới)
          </span>
        </div>
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-light)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr>
                {[
                  { label: 'Gold 24K',    unit: '$/oz' },
                  { label: 'Platinum',    unit: '$/oz' },
                  { label: 'Silver',      unit: '$/oz' },
                  { label: 'Palladium',   unit: '$/oz' },
                  { label: 'Loss Gold',   unit: '%'    },
                  { label: 'Loss Pt/Ag',  unit: '%'    },
                  { label: 'Tag ×',       unit: '×'    },
                  { label: 'FB/FR ×',     unit: '×'    },
                  { label: 'Updated',     unit: ''     },
                  { label: '',            unit: ''     },
                ].map((h, i) => (
                  <th key={i} style={{ ...th, textAlign: i < 8 ? 'right' : 'left', paddingRight: i < 8 ? '1rem' : undefined }}>
                    {h.label}{h.unit ? <span style={{ fontWeight: 400, opacity: 0.55, marginLeft: 3 }}>({h.unit})</span> : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Loading...</td></tr>
              )}
              {!loading && rows.map((r, i) => {
                const cells = [
                  r.gold_24k, r.pt_price, r.ag_price, r.pd_price,
                  r.loss_gold, r.loss_pt, r.tag_multiplier, r.fr_multiplier,
                ]
                const units  = ['$','$','$','$','%','%','×','×']
                return (
                  <tr key={r.id}
                    style={{ background: i === 0 ? 'color-mix(in srgb, var(--color-success) 6%, var(--bg-surface))' : undefined }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = i === 0 ? 'color-mix(in srgb, var(--color-success) 6%, var(--bg-surface))' : '')}
                  >
                    {cells.map((val, ci) => (
                      <td key={ci} style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)', paddingRight: '1rem' }}>
                        {val != null
                          ? units[ci] === '%'
                            ? `${(Number(val) * 100).toFixed(1)}%`
                            : units[ci] === '×'
                              ? `${Number(val).toFixed(2)}×`
                              : `$${Number(val).toFixed(2)}`
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                    ))}
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {(r.updated_at ?? '').slice(0, 10)}
                      {i === 0 && <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--color-success)', fontWeight: 700, fontFamily: 'var(--font-body)', letterSpacing: '0.06em' }}>LATEST</span>}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {canEdit && <><button onClick={() => openEdit(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', marginRight: 8, fontSize: 13 }} title="Edit">
                        <i className="fa-solid fa-pen" />
                      </button>
                      <button onClick={() => handleDelete(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', fontSize: 13 }} title="Delete">
                        <i className="fa-solid fa-trash" />
                      </button></>}
                    </td>
                  </tr>
                )
              })}
              {!loading && !rows.length && (
                <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                  Chưa có dữ liệu NVL. Thêm một dòng để bắt đầu tạo invoice.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Derived $/gram section ── */}
      {nvlSnap && (
        <div>
          {/* Sub-header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <div style={sectionLabel}>Giá $/gram theo loại vàng</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 3 }}>
                Tính từ spot price LATEST · Ounce per gram = 31.103
              </div>
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
                  padding: '0.35rem 0.6rem', border: '1px solid var(--border-base)',
                  fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
                  background: 'var(--bg-surface)', color: 'var(--text-primary)',
                  width: 130, outline: 'none',
                }}
              />
              <button onClick={addKarat} style={{ ...btnPrimary, padding: '0.35rem 0.9rem', fontSize: 'var(--text-xs)' }}>
                + Thêm karat
              </button>
            </div>
          </div>

          {/* Gold karats */}
          <div style={{ marginBottom: '0.5rem', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Vàng (Au)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem', marginBottom: '1.25rem' }}>
            {allGoldKarats.map(label => {
              const loai = label
              return (
                <KaratCard
                  key={label} label={label} loai={loai}
                  price={goldPricePerGram(loai, nvlSnap)}
                  isCustom={customKarats.includes(label)}
                  onRemove={() => removeKarat(label)}
                />
              )
            })}
          </div>

          {/* Precious metals */}
          <div style={{ marginBottom: '0.5rem', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Kim loại quý</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem' }}>
            {allMetalKarats.map(label => {
              const loai = label === 'PT950' ? 'PT' : label
              return (
                <KaratCard
                  key={label} label={label} loai={loai}
                  price={goldPricePerGram(loai, nvlSnap)}
                  isCustom={customKarats.includes(label)}
                  onRemove={() => removeKarat(label)}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* ── Modal ── */}
      {modal && (
        <AdminModal title={modal === 'add' ? 'Add NVL Prices' : 'Edit NVL Prices'} onClose={closeModal} width={520}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            {FIELDS.map(f => (
              <div key={f.key} style={fieldStyle}>
                <label style={labelStyle}>{f.label} ({f.unit})</label>
                <input type="number" step={f.step} min="0" style={inputStyle} placeholder="0.00"
                  value={form[f.key]}
                  onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))} />
                {(f.key === 'tag_multiplier' || f.key === 'fr_multiplier') && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.4 }}>
                    {f.key === 'tag_multiplier' ? 'tag = CIF × multiplier (AG3 only)' : 'fb = CIF × multiplier (AG3 only)'}
                  </div>
                )}
              </div>
            ))}
          </div>
          {error && <p style={{ color: 'var(--color-danger)', fontSize: 'var(--text-sm)', marginBottom: '1rem' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={handleSave} disabled={saving} style={btnPrimary}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
            <button onClick={closeModal} style={btnSecondary}>Hủy</button>
          </div>
        </AdminModal>
      )}
    </div>
  )
}
