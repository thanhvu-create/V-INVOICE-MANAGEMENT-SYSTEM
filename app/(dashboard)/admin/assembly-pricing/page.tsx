'use client'

import { useState, useEffect } from 'react'
import { useUser } from '@/contexts/UserContext'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

interface Rule {
  id:           string
  sub_class:    string
  gia_cong:     number
  duc:          number
  thiet_ke:     number
  resin:        number
  phi_phu_kien: number
}

const EMPTY_FORM = { sub_class: '', gia_cong: '', duc: '', thiet_ke: '', resin: '' }

const FEE_COLS: { key: keyof Rule; label: string }[] = [
  { key: 'gia_cong', label: 'Gia công' },
  { key: 'duc',      label: 'Đúc' },
  { key: 'thiet_ke', label: 'Thiết kế' },
  { key: 'resin',    label: 'Resin' },
]

export default function AssemblyPricingPage() {
  const { canDo } = useUser()
  const canEdit   = canDo('manage_products')

  const [rules,    setRules]    = useState<Rule[]>([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState<{ mode: 'add' | 'edit'; rule?: Rule } | null>(null)
  const [form,     setForm]     = useState(EMPTY_FORM)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [confirm,  setConfirm]  = useState<Rule | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/assembly-pricing')
    const j   = await res.json()
    if (j.success) setRules(j.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openAdd() {
    setForm(EMPTY_FORM)
    setError('')
    setModal({ mode: 'add' })
  }

  function openEdit(rule: Rule) {
    setForm({
      sub_class: rule.sub_class,
      gia_cong:  String(rule.gia_cong),
      duc:       String(rule.duc),
      thiet_ke:  String(rule.thiet_ke),
      resin:     String(rule.resin),
    })
    setError('')
    setModal({ mode: 'edit', rule })
  }

  async function handleSave() {
    if (!form.sub_class.trim()) { setError('Sub class là bắt buộc'); return }
    setSaving(true)
    setError('')
    const body = {
      id:       modal?.rule?.id,
      sub_class: form.sub_class.trim().toUpperCase(),
      gia_cong:  parseFloat(form.gia_cong)  || 0,
      duc:       parseFloat(form.duc)        || 0,
      thiet_ke:  parseFloat(form.thiet_ke)   || 0,
      resin:     parseFloat(form.resin)      || 0,
    }
    const res = await fetch('/api/admin/assembly-pricing', {
      method:  modal?.mode === 'add' ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    const j = await res.json()
    setSaving(false)
    if (!j.success) { setError(j.message || 'Lỗi'); return }
    setModal(null)
    load()
  }

  async function handleDelete(rule: Rule) {
    await fetch(`/api/admin/assembly-pricing?id=${rule.id}`, { method: 'DELETE' })
    setConfirm(null)
    load()
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const th: React.CSSProperties = {
    padding: '7px 10px', background: 'var(--bg-base)',
    fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--text-secondary)',
    borderBottom: '2px solid var(--border-base)', textAlign: 'left', whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = {
    padding: '7px 10px', borderBottom: '1px solid var(--border-light)',
    fontSize: 'var(--text-sm)', verticalAlign: 'middle',
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', border: '1px solid var(--border-base)', borderRadius: 0,
    background: 'var(--bg-surface)', padding: '6px 8px',
    fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)', outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 'var(--text-xs)', textTransform: 'uppercase',
    letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 3, fontWeight: 500,
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 860 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 400, margin: '0 0 0.25rem' }}>
            Assembly Pricing
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0 }}>
            Giá gia công tự động theo Sub Class — dùng cho CH1 / CH2
          </p>
        </div>
        {canEdit && (
          <button
            onClick={openAdd}
            style={{
              padding: '0.5rem 1.25rem', background: 'var(--text-primary)', color: 'var(--text-inverse)',
              border: 'none', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
              fontWeight: 600, cursor: 'pointer', letterSpacing: '0.05em',
            }}
          >
            <i className="fa-solid fa-plus" style={{ marginRight: 7 }} />
            Thêm rule
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: 20 }} />
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border-base)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Sub Class</th>
                <th style={{ ...th, textAlign: 'right' }}>Gia công</th>
                <th style={{ ...th, textAlign: 'right' }}>Đúc</th>
                <th style={{ ...th, textAlign: 'right' }}>Thiết kế</th>
                <th style={{ ...th, textAlign: 'right' }}>Resin</th>
                <th style={{ ...th, textAlign: 'right' }}>Tổng</th>
                {canEdit && <th style={{ ...th, width: 80 }} />}
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => {
                const total = rule.gia_cong + rule.duc + rule.thiet_ke + rule.resin
                return (
                  <tr
                    key={rule.id}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px',
                        background: 'var(--sku-highlight-bg)', color: '#92400E',
                        fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.06em',
                      }}>
                        {rule.sub_class}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>${rule.gia_cong}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>${rule.duc}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>${rule.thiet_ke}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>${rule.resin}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-info)' }}>
                      ${total}
                    </td>
                    {canEdit && (
                      <td style={{ ...td, textAlign: 'right' }}>
                        <button
                          onClick={() => openEdit(rule)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, padding: '2px 5px' }}
                          title="Sửa"
                        >
                          <i className="fa-solid fa-pen" />
                        </button>
                        <button
                          onClick={() => setConfirm(rule)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', fontSize: 13, padding: '2px 5px', marginLeft: 2 }}
                          title="Xóa"
                        >
                          <i className="fa-solid fa-trash" />
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
              {rules.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                    Chưa có rule nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Note */}
      <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'var(--bg-base)', border: '1px solid var(--border-light)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
        Tổng = Gia công + Đúc + Thiết kế + Resin. <strong>Phụ kiện</strong> tự tính theo loại vàng: PT=$50 · AG/SV=$10 · 14K/18K=$30.
      </div>

      {/* Add/Edit Modal */}
      {modal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(26,24,20,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setModal(null)}
        >
          <div
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)', width: 440 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-lg)', fontWeight: 400, margin: 0 }}>
                {modal.mode === 'add' ? 'Thêm rule' : 'Sửa rule'}
              </h3>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* Sub Class */}
              <div>
                <label style={labelStyle}>Sub Class *</label>
                <input
                  style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase' }}
                  placeholder="RI, ER, BL, NL…"
                  value={form.sub_class}
                  onChange={e => setForm(v => ({ ...v, sub_class: e.target.value.toUpperCase() }))}
                  autoFocus
                />
              </div>

              {/* 4 price fields in 2×2 grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {FEE_COLS.map(({ key, label }) => (
                  <div key={key}>
                    <label style={labelStyle}>{label} ($/SP)</label>
                    <input
                      type="number" min="0" step="0.01"
                      style={inputStyle}
                      value={form[key as keyof typeof form]}
                      onChange={e => setForm(v => ({ ...v, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>

              {/* Total preview */}
              {(['gia_cong', 'duc', 'thiet_ke', 'resin'] as const).some(k => parseFloat(form[k]) > 0) && (
                <div style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-base)', borderLeft: '3px solid var(--color-info)', fontSize: 'var(--text-sm)' }}>
                  Tổng: <strong style={{ fontFamily: 'var(--font-mono)' }}>
                    ${(['gia_cong', 'duc', 'thiet_ke', 'resin'] as const).reduce((s, k) => s + (parseFloat(form[k]) || 0), 0)}
                  </strong>
                </div>
              )}

              {error && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-danger)' }}>{error}</div>}

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button onClick={() => setModal(null)} style={{ padding: '0.5rem 1.25rem', border: '1px solid var(--border-base)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
                  Hủy
                </button>
                <button onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 1.5rem', background: 'var(--text-primary)', color: 'var(--text-inverse)', border: 'none', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Đang lưu…' : 'Lưu'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirm && (
        <ConfirmDialog
          open
          title="Xóa rule"
          message={`Xóa rule Sub Class "${confirm.sub_class}"?`}
          danger
          onOk={() => handleDelete(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
