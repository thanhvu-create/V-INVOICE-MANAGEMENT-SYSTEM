'use client'

import { useState, useEffect } from 'react'
import { apiCall } from '@/lib/api'
import { ModalPortal } from '@/components/ui/ModalPortal'
import { mapSizeToRange } from '@/lib/formulas/size-mapping'

interface GemForm {
  ma_xoan:           string
  p_chat:            string
  size_raw:          string  // helper — not sent to API; triggers auto-map to size_xoan_range
  size_xoan_range:   string
  sl_hot:            string
  tl_truoc_xu_ly_ct: string
  tl_sau_xu_ly_ct:   string
  don_gia:           string
  don_gia_phi:       string
}

const EMPTY_FORM: GemForm = {
  ma_xoan: '', p_chat: 'VVS1', size_raw: '', size_xoan_range: '',
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

interface NVLHotRow {
  id: string
  stone_type: string
  grade: string
  size_range: string
  mk_price: number
}

export function GemModal({ open, invoiceId, itemId, gem, template, onClose, onSaved }: Props) {
  const isCH2 = template === 'CH2'
  const [form,       setForm]       = useState<GemForm>(EMPTY_FORM)
  const [saving,     setSaving]     = useState(false)
  const [nvlHotList, setNvlHotList] = useState<NVLHotRow[]>([])
  const [loadingNvl, setLoadingNvl] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoadingNvl(true)
    fetch('/api/nvl-hot')
      .then(r => r.json())
      .then(j => { if (j.success) setNvlHotList(j.data ?? []) })
      .catch(() => {})
      .finally(() => setLoadingNvl(false))
  }, [open])

  useEffect(() => {
    if (!open) return
    if (gem) {
      setForm({
        ma_xoan:           gem.ma_xoan           ?? '',
        p_chat:            gem.p_chat            ?? 'VVS1',
        size_raw:          String(gem.tl_sau_xu_ly_ct ?? ''),
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

  // Extract trailing size from gem code: "L-RD409-2.1" → "2.1", "BG-L14-0.05" → "0.05"
  function extractSizeFromCode(maXoan: string): string {
    const last = maXoan.split('-').pop() ?? ''
    return /^\d/.test(last) || last.includes('*') ? last : ''
  }

  // Auto-map to size_xoan_range + don_gia.
  // Size source priority: size_raw field (manual) → embedded in ma_xoan code
  // Only overwrites size_xoan_range when: size_raw is filled, OR size_xoan_range is currently empty
  useEffect(() => {
    if (!form.ma_xoan || !nvlHotList.length) return
    if (form.size_xoan_range && !form.size_raw) return  // existing range, user not overriding → skip
    const sizeToUse = form.size_raw || extractSizeFromCode(form.ma_xoan)
    if (!sizeToUse) return
    const tbVien = parseFloat(sizeToUse) || 0
    const range  = mapSizeToRange(form.ma_xoan, sizeToUse, tbVien)
    if (!range) return
    const found  = nvlHotList.find(r => r.size_range === range)
    if (!found) return
    setForm(v => ({ ...v, size_xoan_range: range, don_gia: String(found.mk_price) }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.ma_xoan, form.size_raw, nvlHotList])

  if (!open) return null

  const f = (key: keyof GemForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(v => ({ ...v, [key]: e.target.value }))

  // Live computed preview — CH2 uses tl_sau (no tl_truoc column); ADM has no setting fee
  const isADM      = template === 'ADM'
  const tlTruoc    = parseFloat(isCH2 ? form.tl_sau_xu_ly_ct : form.tl_truoc_xu_ly_ct) || 0
  const slHot      = parseInt(form.sl_hot) || 0
  const donGia     = parseFloat(form.don_gia) || 0
  const tl_xoan_gr = tlTruoc > 0 ? tlTruoc / 5 : null
  const t_gia_xoan = tlTruoc > 0 && donGia > 0 ? tlTruoc * donGia : null
  const t_phi      = isADM ? 0 : (slHot > 0 ? slHot * 1 : null)

  function handleRangeChange(range: string) {
    const found = nvlHotList.find(r => r.size_range === range)
    setForm(v => ({
      ...v,
      size_xoan_range: range,
      don_gia: found ? String(found.mk_price) : v.don_gia,
    }))
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

          {/* ma_xoan + size_raw (auto-map trigger) + p_chat */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Mã Xoàn</label>
              <input style={inputStyle} placeholder="RD-11119, BG-L14…" value={form.ma_xoan} onChange={f('ma_xoan')} />
            </div>
            <div>
              <label style={labelStyle} title="mm cho RD/PR; ct TB viên cho BG/MQ/PS/OV">Size (mm / ct)</label>
              <input style={{ ...inputStyle, background: form.size_raw ? 'var(--color-accent-light, #fffbeb)' : 'var(--bg-surface)' }}
                placeholder="2.1 hoặc 0.05" value={form.size_raw} onChange={f('size_raw')} />
            </div>
            <div>
              <label style={labelStyle}>P.Chất</label>
              <input style={inputStyle} placeholder="VVS1" value={form.p_chat} onChange={f('p_chat')} />
            </div>
          </div>

          {/* size_xoan_range — dropdown từ NVL Hột */}
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={labelStyle}>
              Size Range (NVL Hột)
              {loadingNvl && <span style={{ marginLeft: 6, color: 'var(--text-muted)', fontSize: 10 }}>loading…</span>}
            </label>
            <select
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={form.size_xoan_range}
              onChange={e => handleRangeChange(e.target.value)}
            >
              <option value="">— chọn size range —</option>
              {(() => {
                const groups: Record<string, NVLHotRow[]> = {}
                for (const row of nvlHotList) {
                  if (!groups[row.stone_type]) groups[row.stone_type] = []
                  groups[row.stone_type].push(row)
                }
                return Object.entries(groups).map(([type, rows]) => (
                  <optgroup key={type} label={type}>
                    {rows.map(r => (
                      <option key={r.id} value={r.size_range}>
                        {r.size_range}  ·  ${r.mk_price}/ct
                      </option>
                    ))}
                  </optgroup>
                ))
              })()}
            </select>
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
