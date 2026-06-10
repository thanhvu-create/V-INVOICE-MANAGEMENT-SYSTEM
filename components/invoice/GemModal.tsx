'use client'

import { useState, useEffect } from 'react'
import { apiCall } from '@/lib/api'
import { ModalPortal } from '@/components/ui/ModalPortal'

interface GemForm {
  ma_xoan:           string
  p_chat:            string
  size_xoan_range:   string
  sl_hot:            string
  tl_truoc_xu_ly_ct: string
  tl_sau_xu_ly_ct:   string
  don_gia:           string
  don_gia_phi:       string
}

const EMPTY_FORM: GemForm = {
  ma_xoan: '', p_chat: 'VVS1', size_xoan_range: '',
  sl_hot: '1', tl_truoc_xu_ly_ct: '', tl_sau_xu_ly_ct: '',
  don_gia: '', don_gia_phi: '1',
}

interface Props {
  open:      boolean
  invoiceId: string
  itemId:    string
  gem?:      any | null
  template?: string
  onClose:   () => void
  onSaved:   (updatedItem: any) => void
}

export function GemModal({ open, invoiceId, itemId, gem, template, onClose, onSaved }: Props) {
  const isCH2 = template === 'CH2'
  const [form,      setForm]      = useState<GemForm>(EMPTY_FORM)
  const [saving,    setSaving]    = useState(false)
  const [lookingUp, setLookingUp] = useState(false)
  const [lookupMsg, setLookupMsg] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    if (!open) return
    setLookupMsg(null)
    if (gem) {
      setForm({
        ma_xoan:           gem.ma_xoan           ?? '',
        p_chat:            gem.p_chat            ?? 'VVS1',
        size_xoan_range:   gem.size_xoan_range   ?? '',
        sl_hot:            String(gem.sl_hot     ?? 1),
        tl_truoc_xu_ly_ct: String(gem.tl_truoc_xu_ly_ct ?? ''),
        tl_sau_xu_ly_ct:   String(gem.tl_sau_xu_ly_ct   ?? ''),
        don_gia:           String(gem.don_gia    ?? ''),
        don_gia_phi:       String(gem.don_gia_phi ?? 1),
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [open, gem])

  if (!open) return null

  const f = (key: keyof GemForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(v => ({ ...v, [key]: e.target.value }))

  // Live computed preview — CH2 uses tl_sau (no tl_truoc column)
  const tlTruoc    = parseFloat(isCH2 ? form.tl_sau_xu_ly_ct : form.tl_truoc_xu_ly_ct) || 0
  const slHot      = parseInt(form.sl_hot) || 0
  const donGia     = parseFloat(form.don_gia) || 0
  const tl_xoan_gr = tlTruoc > 0 ? tlTruoc / 5 : null
  const t_gia_xoan = tlTruoc > 0 && donGia > 0 ? tlTruoc * donGia : null
  const t_phi      = slHot > 0 ? slHot * 1 : null

  async function lookupByRange() {
    const range = form.size_xoan_range.trim()
    if (!range) return
    setLookingUp(true)
    setLookupMsg(null)
    try {
      const res  = await fetch(`/api/nvl-hot?range=${encodeURIComponent(range)}`)
      const json = await res.json()
      if (!json.success || !json.data) {
        setLookupMsg({ text: `Range "${range}" không có trong bảng NVL Hột.`, ok: false })
        return
      }
      setForm(v => ({ ...v, don_gia: String(json.data.mk_price ?? '') }))
      setLookupMsg({ text: `✓ ${json.data.grade ?? range} · $${json.data.mk_price}/ct`, ok: true })
    } catch {
      setLookupMsg({ text: 'Lỗi kết nối lookup.', ok: false })
    } finally {
      setLookingUp(false)
    }
  }

  function parseNum(s: string): number | null {
    const n = parseFloat(s)
    return isNaN(n) ? null : n
  }

  async function handleSave() {
    setSaving(true)
    const body = {
      ma_xoan:           form.ma_xoan.trim()           || null,
      p_chat:            form.p_chat.trim()            || null,
      size_xoan_range:   form.size_xoan_range.trim()   || null,
      sl_hot:            parseInt(form.sl_hot)         || 1,
      tl_truoc_xu_ly_ct: parseNum(form.tl_truoc_xu_ly_ct),
      tl_sau_xu_ly_ct:   parseNum(form.tl_sau_xu_ly_ct),
      don_gia:           parseNum(form.don_gia),
      don_gia_phi:       parseNum(form.don_gia_phi) ?? 1,
    }

    const url    = gem
      ? `/api/invoices/${invoiceId}/items/${itemId}/gems/${gem.id}`
      : `/api/invoices/${invoiceId}/items/${itemId}/gems`
    const method = gem ? 'PATCH' : 'POST'

    const updatedItem = await apiCall<any>(
      () => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      { successMsg: gem ? 'Xoàn đã cập nhật.' : 'Đã thêm xoàn.' }
    )
    setSaving(false)
    if (updatedItem !== null) {
      onSaved(updatedItem)
      onClose()
    }
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 'var(--text-xs)', textTransform: 'uppercase',
    letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 3, fontWeight: 500,
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', border: '1px solid var(--border-base)', borderRadius: 0,
    background: 'var(--bg-surface)', padding: '6px 8px',
    fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
    outline: 'none',
  }

  return (
    <ModalPortal>
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,24,20,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)', width: 540, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)', fontWeight: 400, margin: 0 }}>
            {gem ? 'Sửa Xoàn' : 'Thêm Xoàn'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem' }}>

          {/* ma_xoan + p_chat */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Mã Xoàn</label>
              <input style={inputStyle} placeholder="RD 1.0mm, BG3…" value={form.ma_xoan} onChange={f('ma_xoan')} />
            </div>
            <div>
              <label style={labelStyle}>P.Chất</label>
              <input style={inputStyle} placeholder="VVS1" value={form.p_chat} onChange={f('p_chat')} />
            </div>
          </div>

          {/* size_xoan_range lookup */}
          <div style={{ marginBottom: '0.75rem', padding: '0.75rem', background: 'var(--bg-base)', border: '1px solid var(--border-light)' }}>
            <label style={labelStyle}>Size Range (NVL Hột) — tra đơn giá</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)', flex: 1 }}
                placeholder="VD: RD1 0.7 - 2.0, RD2 2.1 - 2.4…"
                value={form.size_xoan_range}
                onChange={f('size_xoan_range')}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lookupByRange() } }}
              />
              <button
                onClick={lookupByRange}
                disabled={lookingUp || !form.size_xoan_range.trim()}
                style={{ padding: '6px 14px', background: 'var(--color-info)', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: 0, fontSize: 'var(--text-xs)', fontWeight: 600, whiteSpace: 'nowrap', opacity: lookingUp ? 0.7 : 1 }}
              >
                {lookingUp ? <i className="fa-solid fa-circle-notch fa-spin" /> : 'Lookup'}
              </button>
            </div>
            {lookupMsg && (
              <div style={{ marginTop: 5, fontSize: 'var(--text-xs)', color: lookupMsg.ok ? 'var(--color-success)' : 'var(--color-danger)', fontFamily: 'var(--font-mono)' }}>
                {lookupMsg.text}
              </div>
            )}
          </div>

          {/* sl_hot + tl_truoc + tl_sau */}
          <div style={{ display: 'grid', gridTemplateColumns: isCH2 ? '1fr 1fr' : '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={labelStyle}>SL Hột</label>
              <input type="number" min="1" step="1" style={inputStyle} value={form.sl_hot} onChange={f('sl_hot')} />
            </div>
            {!isCH2 && (
              <div>
                <label style={labelStyle}>TL Trước XL (ct) *</label>
                <input type="number" min="0" step="0.0001" style={inputStyle} placeholder="0.0000" value={form.tl_truoc_xu_ly_ct} onChange={f('tl_truoc_xu_ly_ct')} />
              </div>
            )}
            <div>
              <label style={labelStyle}>{isCH2 ? 'TL XL (ct) *' : 'TL Sau XL (ct)'}</label>
              <input type="number" min="0" step="0.0001" style={inputStyle} placeholder="0.0000" value={form.tl_sau_xu_ly_ct} onChange={f('tl_sau_xu_ly_ct')} />
            </div>
          </div>

          {/* don_gia + don_gia_phi */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <label style={labelStyle}>Đơn Giá ($/ct)</label>
              <input type="number" min="0" step="0.01" style={inputStyle} placeholder="0.00" value={form.don_gia} onChange={f('don_gia')} />
            </div>
            <div>
              <label style={labelStyle}>Đơn Giá Phí ($/hột)</label>
              <input type="number" min="0" step="0.01" style={inputStyle} value={form.don_gia_phi} onChange={f('don_gia_phi')} />
            </div>
          </div>

          {/* Computed preview */}
          <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-light)', padding: '0.75rem', marginBottom: '1rem', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.5rem' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2, gridColumn: '1/-1' }}>
              Tính toán tự động (preview)
            </div>
            {([
              ['TL Xoàn (gr)',    tl_xoan_gr != null ? tl_xoan_gr.toFixed(4)      : '—'],
              ['T.Giá Xoàn ($)', t_gia_xoan != null ? `$${t_gia_xoan.toFixed(2)}` : '—'],
              ['T.Phí ($)',       t_phi      != null ? `$${t_phi.toFixed(2)}`      : '—'],
            ] as [string, string][]).map(([l, v]) => (
              <div key={l}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{l}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              style={{ padding: '0.5rem 1.25rem', border: '1px solid var(--border-base)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', cursor: 'pointer', borderRadius: 0 }}
            >
              Hủy
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '0.5rem 1.5rem', background: 'var(--text-primary)', color: 'var(--text-inverse)', border: 'none', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, borderRadius: 0 }}
            >
              {saving ? 'Đang lưu…' : gem ? 'Cập nhật' : 'Thêm Xoàn'}
            </button>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
