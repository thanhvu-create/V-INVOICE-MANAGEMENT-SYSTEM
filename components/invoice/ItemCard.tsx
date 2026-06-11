'use client'

import { useState, useEffect } from 'react'
import { apiCall } from '@/lib/api'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { GemModal } from './GemModal'
import { DriveImage } from './DriveImage'
import { DriveImageInput } from '@/components/ui/DriveImageInput'
import { ComboInput } from '@/components/ui/ComboInput'

import type { InvoiceTemplate } from '@/lib/formulas/pricing'

const BASE_METAL_TYPES = ['18KY', '18KW', '18KR', '18KG', '22KY', '22KW', '24K', '14KY', '14KW', '14KR', '10KY', '10KW', 'PT950', 'PT850', 'AG', 'PD']

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

interface Props {
  invoiceId:    string
  item:         any
  canSeePrice:  boolean
  canEdit:      boolean
  isLocked:     boolean
  template?:    InvoiceTemplate
  onRefresh:    () => void
  onItemUpdate: (itemId: string, updatedItem: any) => void
}

export function ItemCard({ invoiceId, item, canSeePrice, canEdit, isLocked, template = 'CH1', onRefresh, onItemUpdate }: Props) {
  const isAG3      = template === 'CH1_AG3' || template === 'VNSI_AG3'
  const isAdm      = template === 'ADM'
  const hasGems    = template === 'CH1' || template === 'CH2' || template === 'ADM'
  const hasFees    = template === 'CH1' || template === 'CH2'
  const hasCIF     = template !== 'CH2'
  const hasTagFb   = hasCIF  // all templates with CIF also show Tag+FB
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [metalTypes, setMetalTypes] = useState<string[]>(BASE_METAL_TYPES)

  useEffect(() => {
    fetch('/api/metal-types')
      .then(r => r.json())
      .then(j => { if (j.success) setMetalTypes(j.data) })
      .catch(() => {})
  }, [])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [gemModal, setGemModal] = useState<{ open: boolean; gem?: any }>({ open: false })
  const [confirmDeleteGem, setConfirmDeleteGem] = useState<any | null>(null)
  const [deletingGem, setDeletingGem] = useState(false)

  const gems: any[] = item.invoice_diamonds ?? []
  const notesVal = isAG3 ? item.chi_tiet_tap : (!isAdm ? item.nini_adm : null)
  const isBaSao  = notesVal?.toLowerCase().includes('ba sao') ?? false

  function openEdit() {
    setForm({
      vendor_model:      item.vendor_model             ?? '',
      po_number:         item.po_number                ?? '',
      sku_ag:            item.sku_ag                   ?? '',
      qt_pcs:            String(item.qt_pcs            ?? ''),
      kich_thuoc:        item.kich_thuoc               ?? '',
      description:       item.description              ?? '',
      class:             item.class                    ?? '',
      sub_class:         item.sub_class                ?? '',
      loai_vang:         item.loai_vang                ?? '',
      t_pham_co_nvl_da:  String(item.t_pham_co_nvl_da  ?? ''),
      gia_cong:          String(item.gia_cong           ?? 0),
      duc:               String(item.duc                ?? 0),
      thiet_ke:          String(item.thiet_ke           ?? 0),
      resin:             String(item.resin              ?? 0),
      phi_phu_kien:      String(item.phi_phu_kien       ?? 0),
      bao_hiem:          String(item.bao_hiem           ?? 0),
      so_mo:             item.so_mo                    ?? '',
      ngay_gui:          item.ngay_gui                 ?? '',
      tracking_no:       item.tracking_no              ?? '',
      hoa_don:           item.hoa_don                  ?? '',
      image_url:         item.image_url                ?? '',
    })
    setEditMode(true)
  }

  function f(key: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(v => ({ ...v, [key]: e.target.value }))
  }

  async function handleSave() {
    setSaving(true)
    const nums = ['qt_pcs', 't_pham_co_nvl_da', 'gia_cong', 'duc', 'thiet_ke', 'resin', 'phi_phu_kien', 'bao_hiem']
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

  function handleGemSaved(updatedItem: any) {
    onItemUpdate(item.id, updatedItem)
  }

  return (
    <div style={{ marginBottom: '1rem', border: '1px solid var(--border-base)', background: 'var(--bg-surface)' }}>
      {/* Card header */}
      <div style={{ padding: '0.65rem 1rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', background: 'var(--bg-base)' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <DriveImage url={item.image_url} alt={item.sku} size={44} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>#{item.seq}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, background: 'var(--sku-highlight-bg)', padding: '1px 8px', color: '#92400E', fontSize: 'var(--text-sm)' }}>{item.sku}</span>
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
            ...(item.vendor_model  ? [['Vendor Model#', item.vendor_model]]       : []),
            ...(isAG3 && item.po_number             ? [['PO#',       item.po_number]]   : []),
            ...(template === 'CH1_AG3' && item.sku_ag ? [['SKU# AG', item.sku_ag]]      : []),
            ['Qty (pcs)', item.qt_pcs],
            ...(item.kich_thuoc                     ? [['Kích thước', item.kich_thuoc]] : []),
            ['Loại vàng', item.loai_vang ?? '—'],
            ...(!isAG3 && item.so_mo                ? [['SO-MO', item.so_mo]]           : []),
            ['Wt. (gr)', fmt4(item.t_pham_co_nvl_da ?? item.wt_gr)],
            ...(!isAG3 ? [
              ['T.Phẩm trừ NVL đá (gr)', fmt4(item.t_pham_tru_nvl_da)],
              ['T.Phẩm vàng TT (gr)', fmt4(item.t_pham_vang_thuc_te)],
            ] : []),
            ...(canSeePrice ? [
              ['Tiền vàng', fmt2(item.tien_vang)],
              ['HP Purchase', fmt2(item.von_san_xuat)],
              ...(hasCIF ? [['HP CIF', fmt2(item.cif_price)]] : []),
              ...(hasTagFb && item.tag_price != null ? [['HP Tag', fmt2(item.tag_price)]] : []),
              ...(hasTagFb && item.fb_price  != null ? [['HP FB',  fmt2(item.fb_price)]]  : []),
              ...(isAG3 && item.qt_pcs > 1 ? [
                ['Purchase/1sp', fmt2(item.von_san_xuat != null ? item.von_san_xuat / item.qt_pcs : null)],
                ...(item.tag_price != null ? [['Tag/1sp', fmt2(item.tag_price / item.qt_pcs)]] : []),
              ] : []),
              ...(template === 'CH1' && item.erp_bom_cost != null ? [
                ['ERP BOM ($)', fmt2(item.erp_bom_cost)],
                ['Chênh lệch', fmt2((item.von_san_xuat ?? 0) - item.erp_bom_cost)],
              ] : []),
            ] : []),
            ...(canSeePrice && hasFees && (item.gia_cong || item.duc || item.thiet_ke || item.resin || item.phi_phu_kien) ? [
              ['Gia công/SP', fmt2(item.gia_cong)],
              ['Đúc/SP', fmt2(item.duc)],
              ['Thiết kế/SP', fmt2(item.thiet_ke)],
              ['Resin/SP', fmt2(item.resin)],
              ['Phụ kiện', fmt2(item.phi_phu_kien)],
            ] : []),
            ...(!isAG3 && !isAdm && item.bao_hiem    ? [['Bảo hiểm', fmt2(item.bao_hiem)]]    : []),
            ...(!isAG3 && !isAdm && item.ngay_gui    ? [['Ngày gửi', item.ngay_gui]]           : []),
            ...(!isAG3 && !isAdm && item.tracking_no ? [['Tracking#', item.tracking_no]]       : []),
            ...(!isAG3 && !isAdm && item.hoa_don     ? [['Hóa Đơn (V-INV)', item.hoa_don]]     : []),
            ...(item.store                           ? [['Store', item.store]]                  : []),
            ...(!isAG3 && !isAdm && item.nini_adm    ? [['Notes', item.nini_adm]]               : []),
            ...(isAG3 && item.chi_tiet_tap           ? [['Chi tiết/Tập', item.chi_tiet_tap]]    : []),
          ].map(([label, val]) => (
            <div key={String(label)}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', color: isBaSao && (String(label) === 'Notes' || String(label) === 'Chi tiết/Tập') ? '#DC2626' : 'inherit', fontWeight: isBaSao && (String(label) === 'Notes' || String(label) === 'Chi tiết/Tập') ? 700 : 400 }}>{val ?? '—'}</div>
            </div>
          ))}
          {canSeePrice && gems.length > 0 && (
            <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border-light)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Vốn SX Breakdown</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}>
                <span>Tiền vàng: {fmt2(item.tien_vang)}</span>
                {hasGems && <><span style={{ color: 'var(--text-muted)' }}>+</span>
                <span>T.Giá Xoàn: {fmt2(gems.reduce((s: number, g: any) => s + (g.t_gia_xoan ?? 0), 0))}</span>
                <span style={{ color: 'var(--text-muted)' }}>+</span>
                <span>T.Phí: {fmt2(gems.reduce((s: number, g: any) => s + (g.t_phi ?? 0), 0))}</span></>}
                {hasFees && <><span style={{ color: 'var(--text-muted)' }}>+</span>
                <span>Gia công: {fmt2((item.gia_cong ?? 0) + (item.duc ?? 0) + (item.thiet_ke ?? 0) + (item.resin ?? 0) + (item.phi_phu_kien ?? 0))}</span></>}
                <span style={{ color: 'var(--text-muted)' }}>=</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Vốn SX: {fmt2(item.von_san_xuat)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* EDIT mode */}
      {editMode && (
        <div style={{ padding: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
            <div><label style={labelStyle}>Qty (pcs) *</label>
              <input type="number" min="1" step="1" style={inputStyle} value={form.qt_pcs} onChange={f('qt_pcs')} /></div>
            <div><label style={labelStyle}>Kích thước</label>
              <input style={inputStyle} value={form.kich_thuoc ?? ''} onChange={f('kich_thuoc')} placeholder="e.g. 8in, Size 5" /></div>
            <div><label style={labelStyle}>Loại vàng</label>
              <ComboInput
                value={form.loai_vang}
                onChange={v => setForm(prev => ({ ...prev, loai_vang: v }))}
                options={metalTypes}
                placeholder="18KY, PT950…"
                uppercase
                style={inputStyle}
              /></div>
            <div><label style={labelStyle}>Description</label>
              <input style={inputStyle} value={form.description} onChange={f('description')} /></div>
            <div><label style={labelStyle}>Class</label>
              <input style={inputStyle} value={form.class} onChange={f('class')} /></div>
            <div><label style={labelStyle}>Sub Class</label>
              <input style={inputStyle} value={form.sub_class} onChange={f('sub_class')} /></div>
            <div><label style={labelStyle}>Vendor Model# (Mã mẫu)</label>
              <input style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} value={form.vendor_model ?? ''} onChange={f('vendor_model')} placeholder="e.g. L10437" /></div>
            {isAG3 ? (<>
              <div><label style={labelStyle}>PO#</label>
                <input style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} value={form.po_number ?? ''} onChange={f('po_number')} placeholder="e.g. 1000011528" /></div>
              {template === 'CH1_AG3' && (
                <div><label style={labelStyle}>SKU# AG</label>
                  <input style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} value={form.sku_ag ?? ''} onChange={f('sku_ag')} /></div>
              )}
            </>) : (
              <div><label style={labelStyle}>SO-MO</label>
                <input style={inputStyle} value={form.so_mo} onChange={f('so_mo')} placeholder="SO26.xxxx-MO26.xxxxx" /></div>
            )}
            <div><label style={labelStyle}>Wt. (gr)</label>
              <input type="number" min="0" step="0.0001" style={inputStyle} value={form.t_pham_co_nvl_da} onChange={f('t_pham_co_nvl_da')} /></div>
          </div>

          {hasFees && (
            <>
              <p style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Gia công (USD/SP)</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                <div><label style={labelStyle}>Gia công</label>
                  <input type="number" min="0" step="0.01" style={inputStyle} value={form.gia_cong} onChange={f('gia_cong')} /></div>
                <div><label style={labelStyle}>Đúc</label>
                  <input type="number" min="0" step="0.01" style={inputStyle} value={form.duc} onChange={f('duc')} /></div>
                <div><label style={labelStyle}>Thiết kế</label>
                  <input type="number" min="0" step="0.01" style={inputStyle} value={form.thiet_ke} onChange={f('thiet_ke')} /></div>
                <div><label style={labelStyle}>Resin</label>
                  <input type="number" min="0" step="0.01" style={inputStyle} value={form.resin} onChange={f('resin')} /></div>
                <div><label style={labelStyle}>Phụ kiện</label>
                  <input type="number" min="0" step="0.01" style={inputStyle} value={form.phi_phu_kien} onChange={f('phi_phu_kien')} /></div>
              </div>
            </>
          )}

          {!isAG3 && !isAdm && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>Bảo hiểm (AC)</label>
              <input type="number" min="0" step="0.01" style={{ ...inputStyle, maxWidth: 160 }} value={form.bao_hiem ?? ''} onChange={f('bao_hiem')} placeholder="0.00" />
            </div>
          )}

          {!isAG3 && !isAdm && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
              <div><label style={labelStyle}>Ngày gửi</label>
                <input type="date" style={inputStyle} value={form.ngay_gui} onChange={f('ngay_gui')} /></div>
              <div><label style={labelStyle}>Tracking No</label>
                <input style={inputStyle} value={form.tracking_no} onChange={f('tracking_no')} /></div>
              <div><label style={labelStyle}>V-Invoice No (Hóa Đơn)</label>
                <input style={inputStyle} value={form.hoa_don} onChange={f('hoa_don')} /></div>
            </div>
          )}

          {/* Computed readonly */}
          {canSeePrice && (
            <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-light)', padding: '0.75rem', marginBottom: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.5rem' }}>
              {[
                ...(!isAG3 ? [['T.Phẩm vàng TT (gr)', fmt4(item.t_pham_tru_nvl_da)]] : []),
                ['Tiền vàng', fmt2(item.tien_vang)],
                ['HP Purchase', fmt2(item.von_san_xuat)],
                ...(hasCIF ? [['HP CIF', fmt2(item.cif_price)]] : []),
                ...(hasTagFb ? [
                  ...(item.tag_price != null ? [['HP Tag', fmt2(item.tag_price)]] : []),
                  ...(item.fb_price  != null ? [['HP FB',  fmt2(item.fb_price)]]  : []),
                ] : []),
                ...(isAG3 && item.qt_pcs > 1 ? [
                  ['Purchase/1sp', fmt2(item.von_san_xuat != null ? item.von_san_xuat / item.qt_pcs : null)],
                  ...(item.tag_price != null ? [['Tag/1sp', fmt2(item.tag_price / item.qt_pcs)]] : []),
                ] : []),
                ...(template === 'CH1' && item.erp_bom_cost != null ? [
                  ['ERP BOM ($)', fmt2(item.erp_bom_cost)],
                  ['Chênh lệch', fmt2((item.von_san_xuat ?? 0) - item.erp_bom_cost)],
                ] : []),
              ].map(([l, v]) => (
                <div key={l as string}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>{l} <span style={{ color: 'var(--color-info)', fontSize: 9 }}>AUTO</span></div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>{v}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <DriveImageInput
              label="Hình ảnh (Google Drive link hoặc URL)"
              value={form.image_url ?? ''}
              onChange={v => setForm(fv => ({ ...fv, image_url: v }))}
            />
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

      {/* Xoàn (diamond) sub-table */}
      {hasGems && (
        <div style={{ borderTop: '1px solid var(--border-light)', padding: '0.75rem 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Xoàn / Hột {gems.length > 0 && `(${gems.length}/${template === 'CH2' ? 10 : 5})`}
            </span>
            {canEdit && !isLocked && (
              <button onClick={() => setGemModal({ open: true, gem: undefined })}
                style={{ background: 'none', border: '1px solid var(--border-base)', cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', padding: '2px 8px', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="fa-solid fa-plus" style={{ fontSize: 9 }} /> Thêm xoàn
              </button>
            )}
          </div>

          {gems.length === 0 ? (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>Chưa có hột.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', width: '100%' }}>
                <thead>
                  <tr>{(template === 'CH2'
                    ? ['Mã Xoàn', 'P.Chất', 'Size Range', 'SL', 'TL Sau (ct)', 'TL(gr)', 'Đơn Giá', 'T.Giá Xoàn', '$1/Viên', 'T.Phí', '']
                    : ['Mã Xoàn', 'P.Chất', 'Size Range', 'SL', 'TL Trước (ct)', 'TL Sau (ct)', 'TL(gr)', 'Đơn Giá', 'T.Giá Xoàn', '$1/Viên', 'T.Phí', '']
                  ).map(h => (
                    <th key={h} style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-base)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {gems.map((g: any) => (
                    <tr key={g.id} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', fontWeight: 600 }}>{g.ma_xoan ?? '—'}</td>
                      <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)' }}>{g.p_chat ?? 'VVS1'}</td>
                      <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)' }}>{g.size_xoan_range ?? '—'}</td>
                      <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)' }}>{g.sl_hot}</td>
                      {template !== 'CH2' && (
                        <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', background: g.tl_truoc_xu_ly_ct == null ? 'rgba(220,38,38,0.08)' : '' }}>
                          {g.tl_truoc_xu_ly_ct != null ? g.tl_truoc_xu_ly_ct.toFixed(4) : <span style={{ color: '#DC2626' }}>— nhập tay</span>}
                        </td>
                      )}
                      <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>{g.tl_sau_xu_ly_ct?.toFixed(4) ?? '—'}</td>
                      <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)' }}>{fmt4(g.tl_xoan_gr)} <span style={{ fontSize: 9, color: 'var(--color-info)' }}>auto</span></td>
                      <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)' }}>{fmt2(g.don_gia)}</td>
                      <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', fontWeight: 600 }}>{fmt2(g.t_gia_xoan)} <span style={{ fontSize: 9, color: 'var(--color-info)' }}>auto</span></td>
                      <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>$1</td>
                      <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', fontWeight: 600 }}>{fmt2(g.t_phi)} <span style={{ fontSize: 9, color: 'var(--color-info)' }}>auto</span></td>
                      <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>
                        {canEdit && !isLocked && (
                          <>
                            <button onClick={() => setGemModal({ open: true, gem: g })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', marginRight: 4, fontSize: 11 }} title="Sửa"><i className="fa-solid fa-pen" /></button>
                            <button onClick={() => setConfirmDeleteGem(g)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', fontSize: 11 }} title="Xóa"><i className="fa-solid fa-trash" /></button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--bg-base)', borderTop: '1px solid var(--border-base)' }}>
                    <td colSpan={6} style={{ padding: '3px 8px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>Tổng</td>
                    <td style={{ padding: '3px 8px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                      {gems.reduce((s: number, g: any) => s + (g.tl_xoan_gr ?? 0), 0).toFixed(4)}
                    </td>
                    <td />{/* Đơn Giá */}
                    <td style={{ padding: '3px 8px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                      {fmt2(gems.reduce((s: number, g: any) => s + (g.t_gia_xoan ?? 0), 0))}
                    </td>
                    <td />
                    <td style={{ padding: '3px 8px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                      {fmt2(gems.reduce((s: number, g: any) => s + (g.t_phi ?? 0), 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      <ConfirmDialog open={confirmDelete} title="Delete Item" message={`Delete item "${item.sku}" (seq ${item.seq})?`} okText={deleting ? 'Deleting…' : 'Delete'} danger onOk={handleDelete} onCancel={() => setConfirmDelete(false)} />
      <ConfirmDialog open={!!confirmDeleteGem} title="Delete Gem" message="Delete this gem entry?" okText={deletingGem ? 'Deleting…' : 'Delete'} danger onOk={handleDeleteGem} onCancel={() => setConfirmDeleteGem(null)} />
      <GemModal open={gemModal.open} invoiceId={invoiceId} itemId={item.id} gem={gemModal.gem} template={template} onClose={() => setGemModal({ open: false })} onSaved={handleGemSaved} />
    </div>
  )
}
