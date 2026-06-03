'use client'

import { useState } from 'react'
import { apiCall } from '@/lib/api'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { GemModal } from './GemModal'
import { DriveImage } from './DriveImage'
import { DriveImageInput } from '@/components/ui/DriveImageInput'
import type { InvoiceItem } from '@/types'

const METAL_TYPES = ['18KW', '18KY', '14KY', 'PT950', 'PT', '24K', 'AG', 'PD']

function fmt2(n: number | null | undefined) { return n != null ? `$${n.toFixed(2)}` : '—' }
function fmt4(n: number | null | undefined) { return n != null ? n.toFixed(4) : '—' }

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 'var(--text-xs)', textTransform: 'uppercase',
  letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 3, fontWeight: 500,
}
const inputStyle: React.CSSProperties = {
  width: '100%', border: '1px solid var(--border-base)', borderRadius: 0,
  background: 'var(--bg-surface)', padding: '5px 8px',
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
  outline: 'none',
}
const roStyle: React.CSSProperties = {
  ...inputStyle, background: 'var(--bg-base)', color: 'var(--text-muted)', cursor: 'not-allowed',
}

interface Props {
  invoiceId:    string
  item:         any
  canSeePrice:  boolean
  canEdit:      boolean
  isLocked:     boolean
  onRefresh:    () => void
  onItemUpdate: (itemId: string, updatedItem: any) => void
}

export function ItemCard({ invoiceId, item, canSeePrice, canEdit, isLocked, onRefresh, onItemUpdate }: Props) {
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [gemModal, setGemModal] = useState<{ open: boolean; gem?: any }>({ open: false })
  const [confirmDeleteGem, setConfirmDeleteGem] = useState<any | null>(null)
  const [deletingGem, setDeletingGem] = useState(false)

  const gems: any[] = item.item_gem_details ?? []

  function openEdit() {
    setForm({
      qty_pcs:               String(item.qty_pcs ?? ''),
      size:                  item.size           ?? '',
      description:           item.description    ?? '',
      class:                 item.class          ?? '',
      sub_class:             item.sub_class       ?? '',
      metal_type:            item.metal_type      ?? '',
      weight_total_gr:       String(item.weight_total_gr       ?? ''),
      weight_gold_actual_gr: String(item.weight_gold_actual_gr ?? ''),
      labor_fee:             String(item.labor_fee   ?? 0),
      casting_fee:           String(item.casting_fee ?? 0),
      design_fee:            String(item.design_fee  ?? 0),
      resin_fee:             String(item.resin_fee   ?? 0),
      misc_fee:              String(item.misc_fee    ?? 0),
      notes:                 item.notes          ?? '',
      so_mo_code:            item.so_mo_code      ?? '',
      vendor_model:          item.vendor_model    ?? '',
      ship_date:             item.ship_date       ?? '',
      tracking_no:           item.tracking_no     ?? '',
      vinvoice_no:           item.vinvoice_no     ?? '',
      sell_price:            String(item.sell_price ?? ''),
      discount_pct:          String(item.discount_pct ?? ''),
      image_url:             item.image_url ?? '',
    })
    setEditMode(true)
  }

  function f(key: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(v => ({ ...v, [key]: e.target.value }))
  }

  async function handleSave() {
    setSaving(true)
    const nums = ['qty_pcs', 'weight_total_gr', 'weight_gold_actual_gr',
      'labor_fee', 'casting_fee', 'design_fee', 'resin_fee', 'misc_fee', 'sell_price', 'discount_pct']
    const payload: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(form)) {
      payload[k] = nums.includes(k) ? (parseFloat(v) || null) : (v.trim() || null)
    }
    const data = await apiCall<any>(
      () => fetch(`/api/invoices/${invoiceId}/items/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      }),
      { successMsg: 'Item saved.' }
    )
    setSaving(false)
    if (data !== null) {
      setEditMode(false)
      // Update only this item in local state — instant update, no full page re-fetch
      onItemUpdate(item.id, data)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    const ok = await apiCall(
      () => fetch(`/api/invoices/${invoiceId}/items/${item.id}`, { method: 'DELETE' }),
      { successMsg: 'Item deleted.' }
    )
    setDeleting(false)
    setConfirmDelete(false)
    if (ok !== null) onRefresh()
  }

  async function handleDeleteGem() {
    if (!confirmDeleteGem) return
    setDeletingGem(true)
    const updatedItem = await apiCall<any>(
      () => fetch(`/api/invoices/${invoiceId}/items/${item.id}/gems/${confirmDeleteGem.id}`, { method: 'DELETE' }),
      { successMsg: 'Gem deleted.' }
    )
    setDeletingGem(false)
    setConfirmDeleteGem(null)
    if (updatedItem !== null) onItemUpdate(item.id, updatedItem)
  }

  // Gem mutations return the updated parent item — use local state update
  function handleGemSaved(updatedItem: any) {
    onItemUpdate(item.id, updatedItem)
  }

  const isBaSao = item.notes?.toLowerCase().includes('ba sao')

  return (
    <div style={{ marginBottom: '1rem', border: '1px solid var(--border-base)', background: 'var(--bg-surface)' }}>
      {/* Card header */}
      <div style={{ padding: '0.65rem 1rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', background: 'var(--bg-base)' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <DriveImage url={item.image_url} alt={item.sku_jwmold} size={44} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>#{item.line_no}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, background: 'var(--sku-highlight-bg)', padding: '1px 8px', color: '#92400E', fontSize: 'var(--text-sm)' }}>{item.sku_jwmold}</span>
          {item.description && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{item.description}</span>}
          {isBaSao && <span style={{ fontSize: 'var(--text-xs)', color: '#DC2626', fontWeight: 700 }}>★ BA SAO</span>}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {canSeePrice && !editMode && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>CIF: {fmt2(item.cif_price)}</span>}
          {canEdit && !isLocked && !editMode && (
            <>
              <button onClick={openEdit} style={{ background: 'none', border: '1px solid var(--border-base)', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12, padding: '3px 8px' }} title="Edit">
                <i className="fa-solid fa-pen" />
              </button>
              <button onClick={() => setConfirmDelete(true)} style={{ background: 'none', border: '1px solid var(--border-base)', cursor: 'pointer', color: 'var(--color-danger)', fontSize: 12, padding: '3px 8px' }} title="Delete">
                <i className="fa-solid fa-trash" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* DISPLAY mode */}
      {!editMode && (
        <div style={{ padding: '0.75rem 1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.5rem' }}>
          {[
            ['Qty', item.qty_pcs],
            ...(item.size          ? [['Size', item.size]]                     : []),
            ['Metal', item.metal_type ?? '—'],
            ...(item.vendor_model  ? [['Mã mẫu', item.vendor_model]]           : []),
            ...(item.so_mo_code    ? [['SO/MO', item.so_mo_code]]              : []),
            // Weights
            ['T.Phẩm (gr)', fmt4(item.weight_total_gr)],
            ['Vàng thực (gr)', fmt4(item.weight_gold_actual_gr)],
            ['Trừ NVL đá (gr)', fmt4(item.weight_no_gem_gr)],
            // Prices
            ...(canSeePrice ? [
              ['Tiền vàng', fmt2(item.gold_value_usd)],
              ['HPUSA', fmt2(item.hpusa)],
              ['CIF', fmt2(item.cif_price)],
              ['Tag', fmt2(item.tag_price)],
              ['FR', fmt2(item.fr_price)],
            ] : []),
            // Fees (individual)
            ...(canSeePrice && (item.labor_fee || item.casting_fee || item.design_fee || item.resin_fee || item.misc_fee) ? [
              ['Gia công', fmt2(item.labor_fee)],
              ['Đúc', fmt2(item.casting_fee)],
              ['Thiết kế', fmt2(item.design_fee)],
              ['Resin', fmt2(item.resin_fee)],
              ['Phụ kiện', fmt2(item.misc_fee)],
            ] : []),
            // Logistics
            ...(item.ship_date    ? [['Ngày gởi', item.ship_date]]             : []),
            ...(item.tracking_no  ? [['Tracking#', item.tracking_no]]          : []),
            ...(item.store        ? [['Gởi hàng', item.store]]                 : []),
            ...(item.vinvoice_no  ? [['Hóa Đơn USA', item.vinvoice_no]]        : []),
            ...(item.notes        ? [['Notes', item.notes]]                    : []),
          ].map(([label, val]) => (
            <div key={String(label)}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', color: String(label) === 'Notes' && isBaSao ? '#DC2626' : 'inherit', fontWeight: String(label) === 'Notes' && isBaSao ? 700 : 400 }}>{val ?? '—'}</div>
            </div>
          ))}
          {/* HPUSA breakdown — admin/manager only, only when there are gems */}
          {canSeePrice && gems.length > 0 && (
            <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border-light)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>HPUSA Breakdown</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}>
                <span>Gold: {fmt2(item.gold_value_usd)}</span>
                <span style={{ color: 'var(--text-muted)' }}>+</span>
                <span>Gems: {fmt2(gems.reduce((s: number, g: any) => s + (g.total_price ?? 0), 0))}</span>
                <span style={{ color: 'var(--text-muted)' }}>+</span>
                <span>Setting: {fmt2(gems.reduce((s: number, g: any) => s + (g.total_setting_fee ?? 0), 0))}</span>
                <span style={{ color: 'var(--text-muted)' }}>+</span>
                <span>Fees: {fmt2((item.labor_fee ?? 0) + (item.casting_fee ?? 0) + (item.design_fee ?? 0) + (item.resin_fee ?? 0) + (item.misc_fee ?? 0))}</span>
                <span style={{ color: 'var(--text-muted)' }}>=</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>HPUSA: {fmt2(item.hpusa)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* EDIT mode */}
      {editMode && (
        <div style={{ padding: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
            <div><label style={labelStyle}>Qty *</label>
              <input type="number" min="1" step="1" style={inputStyle} value={form.qty_pcs} onChange={f('qty_pcs')} /></div>
            <div><label style={labelStyle}>Size</label>
              <input style={inputStyle} value={form.size ?? ''} onChange={f('size')} placeholder="e.g. 6.5, 7mm" /></div>
            <div><label style={labelStyle}>Metal Type</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.metal_type} onChange={f('metal_type')}>
                <option value="">—</option>
                {METAL_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
              </select></div>
            <div><label style={labelStyle}>Description</label>
              <input style={inputStyle} value={form.description} onChange={f('description')} /></div>
            <div><label style={labelStyle}>Class</label>
              <input style={inputStyle} value={form.class} onChange={f('class')} /></div>
            <div><label style={labelStyle}>Sub Class</label>
              <input style={inputStyle} value={form.sub_class} onChange={f('sub_class')} /></div>
            <div><label style={labelStyle}>SO/MO Code</label>
              <input style={inputStyle} value={form.so_mo_code} onChange={f('so_mo_code')} /></div>
            <div><label style={labelStyle}>Total Weight (g)</label>
              <input type="number" min="0" step="0.0001" style={inputStyle} value={form.weight_total_gr} onChange={f('weight_total_gr')} /></div>
            <div><label style={labelStyle}>Gold Weight (g)</label>
              <input type="number" min="0" step="0.0001" style={inputStyle} value={form.weight_gold_actual_gr} onChange={f('weight_gold_actual_gr')} /></div>
            <div><label style={labelStyle}>Vendor Model</label>
              <input style={inputStyle} value={form.vendor_model} onChange={f('vendor_model')} /></div>
          </div>

          {/* Fees */}
          <p style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Fees (USD)</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
            {(['labor_fee', 'casting_fee', 'design_fee', 'resin_fee', 'misc_fee'] as const).map(k => (
              <div key={k}><label style={labelStyle}>{k.replace('_fee', '').replace('_', ' ')}</label>
                <input type="number" min="0" step="0.01" style={inputStyle} value={form[k]} onChange={f(k)} /></div>
            ))}
          </div>

          {/* Shipping */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
            <div><label style={labelStyle}>Ship Date</label>
              <input type="date" style={inputStyle} value={form.ship_date} onChange={f('ship_date')} /></div>
            <div><label style={labelStyle}>Tracking No</label>
              <input style={inputStyle} value={form.tracking_no} onChange={f('tracking_no')} /></div>
            <div><label style={labelStyle}>V-Invoice No</label>
              <input style={inputStyle} value={form.vinvoice_no} onChange={f('vinvoice_no')} /></div>
          </div>

          {/* Pricing (admin/manager) */}
          {canSeePrice && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
              <div><label style={labelStyle}>Sell Price (USD)</label>
                <input type="number" min="0" step="0.01" style={inputStyle} value={form.sell_price} onChange={f('sell_price')} /></div>
              <div><label style={labelStyle}>Discount %</label>
                <input type="number" min="0" max="100" step="0.01" style={inputStyle} value={form.discount_pct} onChange={f('discount_pct')} /></div>
            </div>
          )}

          {/* Image URL */}
          <div style={{ marginBottom: '1rem' }}>
            <DriveImageInput
              label="Hình ảnh (Google Drive link hoặc URL)"
              value={form.image_url ?? ''}
              onChange={v => setForm(fv => ({ ...fv, image_url: v }))}
            />
          </div>

          {/* Computed readonly */}
          <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-light)', padding: '0.75rem', marginBottom: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.5rem' }}>
            {[
              ['No-Gem Wt', fmt4(item.weight_no_gem_gr)],
              ...(canSeePrice ? [['Gold Value', fmt2(item.gold_value_usd)], ['HPUSA', fmt2(item.hpusa)], ['CIF', fmt2(item.cif_price)], ['Tag', fmt2(item.tag_price)], ['FR', fmt2(item.fr_price)]] : []),
            ].map(([l, v]) => (
              <div key={l as string}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>{l} <span style={{ color: 'var(--color-info)', fontSize: 9 }}>AUTO</span></div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Notes</label>
            <input style={{ ...inputStyle, color: form.notes.toLowerCase().includes('ba sao') ? '#DC2626' : 'var(--text-primary)', fontWeight: form.notes.toLowerCase().includes('ba sao') ? 700 : 400 }}
              value={form.notes} onChange={f('notes')} placeholder="e.g. Ba Sao — 3 stars" />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 1.5rem', background: 'var(--text-primary)', color: 'var(--text-inverse)', border: 'none', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, borderRadius: 0 }}>
              {saving ? 'Saving…' : 'Save Item'}
            </button>
            <button onClick={() => setEditMode(false)} style={{ padding: '0.5rem 1.25rem', border: '1px solid var(--border-base)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', cursor: 'pointer', borderRadius: 0 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Gem sub-table */}
      <div style={{ borderTop: '1px solid var(--border-light)', padding: '0.75rem 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Gems {gems.length > 0 && `(${gems.length})`}
          </span>
          {canEdit && !isLocked && (
            <button onClick={() => setGemModal({ open: true, gem: undefined })}
              style={{ background: 'none', border: '1px solid var(--border-base)', cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', padding: '2px 8px', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="fa-solid fa-plus" style={{ fontSize: 9 }} /> Add Gem
            </button>
          )}
        </div>

        {gems.length === 0 ? (
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>No gems.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', width: '100%' }}>
              <thead>
                <tr>{['Type', 'Quality', 'Shape', 'Size', 'Qty', 'Wt After (ct)', 'Wt (g)', '$/ct', 'Total', 'Setting', 'Fee/pc', 'Total Fee', ''].map(h => (
                  <th key={h} style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-base)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {gems.map((g: any) => (
                  <tr key={g.id} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)' }}>{g.gem_type ?? '—'}</td>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)' }}>{g.quality ?? '—'}</td>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)' }}>{g.shape ?? '—'}</td>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)' }}>{g.size_mm ?? '—'}</td>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)' }}>{g.qty_pcs}</td>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)' }}>{g.weight_ct_after?.toFixed(4) ?? '—'}</td>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)' }}>{fmt4(g.weight_gr)}</td>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)' }}>{fmt2(g.unit_price_per_ct)}</td>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', fontWeight: 600 }}>{fmt2(g.total_price)}</td>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)' }}>{g.setting_type ?? '—'}</td>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)' }}>{fmt2(g.setting_fee_per_pcs)}</td>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', fontWeight: 600 }}>{fmt2(g.total_setting_fee)}</td>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>
                      {canEdit && !isLocked && (
                        <>
                          <button onClick={() => setGemModal({ open: true, gem: g })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', marginRight: 4, fontSize: 11 }} title="Edit gem"><i className="fa-solid fa-pen" /></button>
                          <button onClick={() => setConfirmDeleteGem(g)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', fontSize: 11 }} title="Delete gem"><i className="fa-solid fa-trash" /></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--bg-base)', borderTop: '1px solid var(--border-base)' }}>
                  <td colSpan={5} style={{ padding: '3px 8px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>Subtotal</td>
                  <td style={{ padding: '3px 8px' }} />{/* Wt After */}
                  <td style={{ padding: '3px 8px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                    {gems.reduce((s: number, g: any) => s + (g.weight_gr ?? 0), 0).toFixed(4)}
                  </td>
                  <td />{/* $/ct */}
                  <td style={{ padding: '3px 8px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                    {fmt2(gems.reduce((s: number, g: any) => s + (g.total_price ?? 0), 0))}
                  </td>
                  <td />{/* Setting type */}
                  <td />{/* Fee/pc */}
                  <td style={{ padding: '3px 8px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                    {fmt2(gems.reduce((s: number, g: any) => s + (g.total_setting_fee ?? 0), 0))}
                  </td>
                  <td />{/* Actions */}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <ConfirmDialog open={confirmDelete} title="Delete Item" message={`Delete item "${item.sku_jwmold}" (line ${item.line_no})?`} okText={deleting ? 'Deleting…' : 'Delete'} danger onOk={handleDelete} onCancel={() => setConfirmDelete(false)} />
      <ConfirmDialog open={!!confirmDeleteGem} title="Delete Gem" message={`Delete this ${confirmDeleteGem?.gem_type ?? 'gem'}?`} okText={deletingGem ? 'Deleting…' : 'Delete'} danger onOk={handleDeleteGem} onCancel={() => setConfirmDeleteGem(null)} />
      <GemModal open={gemModal.open} invoiceId={invoiceId} itemId={item.id} gem={gemModal.gem} onClose={() => setGemModal({ open: false })} onSaved={handleGemSaved} />
    </div>
  )
}
