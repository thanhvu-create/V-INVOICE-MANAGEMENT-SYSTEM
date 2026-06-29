'use client'

import { useState, useEffect } from 'react'
import { apiCall } from '@/lib/api'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { GemModal } from './GemModal'
import { XoanLookupPanel } from './XoanLookupPanel'
import { DriveImage } from './DriveImage'
import { DriveImageInput } from '@/components/ui/DriveImageInput'
import { ComboInput } from '@/components/ui/ComboInput'

import type { InvoiceTemplate } from '@/lib/formulas/pricing'
import { getAssemblyPrices, hasGemsInDescription, resolvePhiPhuKien, type AssemblyPricingRule } from '@/lib/formulas/assembly-pricing'
import { detectClassSubClass, extractVendorModel, extractKichThuoc, type ClassRule } from '@/lib/formulas/description-parse'

const BASE_METAL_TYPES = ['18KY', '18KW', '18KR', '18KG', '22KY', '22KW', '24K', '14KY', '14KW', '14KR', '10KY', '10KW', 'PT950', 'PT850', 'AG', 'PD']

function fmt2(n: number | null | undefined)   { return n != null ? `$${Math.round(n)}` : '—' }  // prices — rounded, no decimals
function fmtGram(n: number | null | undefined){ return n != null ? n.toFixed(2) : '—' }          // product weight (gr) — 2 decimals
function fmt4(n: number | null | undefined)   { return n != null ? n.toFixed(4) : '—' }          // gem weight (gr) — 4 decimals

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
  const hasFees    = template === 'CH1' || template === 'CH2' || template === 'ADM'
  const hasCIF     = template !== 'CH2'
  const hasTagFb   = hasCIF  // all templates with CIF also show Tag+FB
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [metalTypes,    setMetalTypes]    = useState<string[]>(BASE_METAL_TYPES)
  const [classOptions,  setClassOptions]  = useState<string[]>([])
  const [subClassOptions, setSubClassOptions] = useState<string[]>([])
  const [assemblyRules, setAssemblyRules] = useState<AssemblyPricingRule[]>([])
  const [classRules,    setClassRules]    = useState<ClassRule[]>([])

  useEffect(() => {
    fetch('/api/metal-types').then(r => r.json()).then(j => { if (j.success) setMetalTypes(j.data) }).catch(() => {})
    fetch('/api/class-subclass').then(r => r.json()).then(j => {
      if (j.success) {
        setClassRules(j.data)
        setClassOptions(Array.from(new Set((j.data as any[]).map((r: any) => r.class))).sort())
      }
    }).catch(() => {})
    fetch('/api/assembly-pricing').then(r => r.json()).then(j => {
      if (j.success) {
        setAssemblyRules(j.data)
        setSubClassOptions(Array.from(new Set((j.data as any[]).map((r: any) => r.sub_class))).sort())
      }
    }).catch(() => {})
  }, [])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [gemModal, setGemModal] = useState<{ open: boolean; gem?: any }>({ open: false })
  const [confirmDeleteGem, setConfirmDeleteGem] = useState<any | null>(null)
  const [deletingGem, setDeletingGem] = useState(false)
  const [xoanPanel, setXoanPanel] = useState(false)

  const gems: any[] = item.invoice_diamonds ?? []
  const notesVal = isAG3 ? item.chi_tiet_tap : (!isAdm ? item.nini_adm : null)
  const isBaSao  = notesVal?.toLowerCase().includes('ba sao') ?? false

  function openEdit() {
    const hasFees = !isAG3
    const subClass = item.sub_class?.trim() ?? ''
    const allZero = [item.gia_cong, item.duc, item.thiet_ke, item.resin, item.phi_phu_kien].every(v => (v ?? 0) === 0)
    const itemHasGems = hasGemsInDescription(item.description)
    const fill = (hasFees && subClass && allZero && itemHasGems)
      ? getAssemblyPrices(subClass, assemblyRules, item.loai_vang)
      : null

    setForm({
      vendor_model:      item.vendor_model             ?? '',
      po_number:         item.po_number                ?? '',
      sku_ag:            item.sku_ag                   ?? '',
      qt_pcs:            String(item.qt_pcs            ?? ''),
      kich_thuoc:        item.kich_thuoc               ?? '',
      description:       item.description              ?? '',
      customer_name:     item.customer_name            ?? '',
      class:             item.class                    ?? '',
      sub_class:         item.sub_class                ?? '',
      loai_vang:         item.loai_vang                ?? '',
      t_pham_co_nvl_da:  String(item.t_pham_co_nvl_da  ?? ''),
      gia_cong:          String(fill?.gia_cong     ?? item.gia_cong     ?? 0),
      duc:               String(fill?.duc          ?? item.duc          ?? 0),
      thiet_ke:          String(fill?.thiet_ke     ?? item.thiet_ke     ?? 0),
      resin:             String(fill?.resin        ?? item.resin        ?? 0),
      phi_phu_kien:      String(fill?.phi_phu_kien ?? item.phi_phu_kien ?? 0),
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

  function handleDescriptionChange(e: React.ChangeEvent<HTMLInputElement>) {
    const desc = e.target.value
    setForm(v => {
      const next: Record<string, string> = { ...v, description: desc }
      const detected = detectClassSubClass(desc, classRules)
      if (detected) {
        next['class']     = detected.class
        next['sub_class'] = detected.sub_class
      }
      const sc = (next['sub_class'] ?? '').trim()
      if (hasFees && sc) {
        if (!hasGemsInDescription(desc)) {
          next['gia_cong'] = '0'; next['duc'] = '0'; next['thiet_ke'] = '0'
          next['resin'] = '0'; next['phi_phu_kien'] = '0'
        } else {
          const prices = getAssemblyPrices(sc, assemblyRules, next['loai_vang'])
          if (prices) {
            next['gia_cong']     = String(prices.gia_cong)
            next['duc']          = String(prices.duc)
            next['thiet_ke']     = String(prices.thiet_ke)
            next['resin']        = String(prices.resin)
            next['phi_phu_kien'] = String(prices.phi_phu_kien)
          }
        }
      }
      if (!(v['kich_thuoc'] ?? '').trim()) {
        const size = extractKichThuoc(desc)
        if (size) next['kich_thuoc'] = size
      }
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    const nums = ['qt_pcs', 't_pham_co_nvl_da', 'gia_cong', 'duc', 'thiet_ke', 'resin', 'phi_phu_kien', 'bao_hiem']
    const original: Record<string, string> = {
      vendor_model:      item.vendor_model             ?? '',
      po_number:         item.po_number                ?? '',
      sku_ag:            item.sku_ag                   ?? '',
      qt_pcs:            String(item.qt_pcs            ?? ''),
      kich_thuoc:        item.kich_thuoc               ?? '',
      description:       item.description              ?? '',
      customer_name:     item.customer_name            ?? '',
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
    }
    const payload: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(form)) {
      if (v === original[k]) continue
      if (nums.includes(k)) {
        const n = parseFloat(v)
        payload[k] = v === '' || isNaN(n) ? null : n
      } else {
        payload[k] = v.trim() || null
      }
    }
    if (Object.keys(payload).length === 0) payload._recalc = true
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
          {item.customer_name && (
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: '#9F1239', background: 'rgba(159,18,57,0.08)', padding: '2px 8px', borderRadius: 2, whiteSpace: 'nowrap' }}>
              <i className="fa-solid fa-user" style={{ fontSize: 9, marginRight: 5, opacity: 0.7 }} />{item.customer_name}
            </span>
          )}
          {item.description && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{item.description}</span>}
          {isBaSao && <span style={{ fontSize: 'var(--text-xs)', color: '#DC2626', fontWeight: 700 }}>★ BA SAO</span>}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {canSeePrice && !editMode && (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginRight: 4 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Purchase: <b style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>{fmt2(item.von_san_xuat)}</b></span>
              {hasCIF && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>CIF: <b style={{ color: '#1E40AF', fontSize: 'var(--text-sm)' }}>{fmt2(item.cif_price)}</b></span>}
            </div>
          )}
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
        <div style={{ padding: '0.75rem 1rem' }}>
          {/* Section 1: Product Info */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {[
              ...(item.vendor_model  ? [['Vendor Model#', item.vendor_model]]       : []),
              ...(isAG3 && item.po_number             ? [['PO#',       item.po_number]]   : []),
              ...(template === 'CH1_AG3' && item.sku_ag ? [['SKU# AG', item.sku_ag]]      : []),
              ['Qty (pcs)', item.qt_pcs],
              ...(item.kich_thuoc                     ? [['Kích thước', item.kich_thuoc]] : []),
              ['Loại vàng', item.loai_vang ?? '—'],
              ...(!isAG3 && item.so_mo                ? [['SO-MO', item.so_mo]]           : []),
              ['Wt. (gr)', fmtGram(item.t_pham_co_nvl_da ?? item.wt_gr)],
              ...(!isAG3 ? [
                ['T.Phẩm trừ đá (gr)', fmtGram(item.t_pham_tru_nvl_da)],
                ['Vàng TT (gr)', fmtGram(item.t_pham_vang_thuc_te)],
              ] : []),
              ...(item.store ? [['Store', item.store]] : []),
              ...(!isAG3 && !isAdm && item.ngay_gui    ? [['Ngày gửi', item.ngay_gui]]           : []),
              ...(!isAG3 && !isAdm && item.tracking_no ? [['Tracking#', item.tracking_no]]       : []),
              ...(!isAG3 && !isAdm && item.hoa_don     ? [['V-INV', item.hoa_don]]               : []),
              ...(!isAG3 && !isAdm && item.nini_adm    ? [['Notes', item.nini_adm]]               : []),
              ...(isAG3 && item.chi_tiet_tap           ? [['Chi tiết/Cặp', item.chi_tiet_tap]]    : []),
            ].map(([label, val]) => (
              <div key={String(label)}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', color: isBaSao && (String(label) === 'Notes' || String(label) === 'Chi tiết/Cặp') ? '#DC2626' : 'inherit', fontWeight: isBaSao && (String(label) === 'Notes' || String(label) === 'Chi tiết/Cặp') ? 700 : 400 }}>{val ?? '—'}</div>
              </div>
            ))}
          </div>

          {/* Section 2: Pricing & Costs */}
          {canSeePrice && (
            <div style={{ background: 'rgba(30, 64, 175, 0.03)', border: '1px solid rgba(30, 64, 175, 0.1)', padding: '0.65rem 0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1E40AF', marginBottom: '0.5rem' }}>
                <i className="fa-solid fa-chart-line" style={{ marginRight: 5, fontSize: 10 }} />Giá & Chi phí
              </div>

              {/* Vốn SX Breakdown pipeline */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ background: 'rgba(30,64,175,0.06)', padding: '2px 6px' }}>Vàng {fmt2(item.tien_vang)}</span>
                {hasGems && gems.length > 0 && <>
                  <span style={{ color: 'var(--text-muted)' }}>+</span>
                  <span style={{ background: 'rgba(30,64,175,0.06)', padding: '2px 6px' }}>Xoàn {fmt2(gems.reduce((s: number, g: any) => s + (g.t_gia_xoan ?? 0), 0))}</span>
                  <span style={{ color: 'var(--text-muted)' }}>+</span>
                  <span style={{ background: 'rgba(30,64,175,0.06)', padding: '2px 6px' }}>Phí gắn {fmt2(gems.reduce((s: number, g: any) => s + (g.t_phi ?? 0), 0))}</span>
                </>}
                {hasFees && <>
                  <span style={{ color: 'var(--text-muted)' }}>+</span>
                  <span style={{ background: 'rgba(30,64,175,0.06)', padding: '2px 6px' }}>Gia công {fmt2((item.gia_cong ?? 0) + (item.duc ?? 0) + (item.thiet_ke ?? 0) + (item.resin ?? 0) + (item.phi_phu_kien ?? 0))}</span>
                </>}
                <span style={{ color: '#1E40AF', fontWeight: 700 }}>=</span>
                <span style={{ background: '#1E40AF', color: '#fff', padding: '2px 8px', fontWeight: 700 }}>Purchase {fmt2(item.von_san_xuat)}</span>
                {hasCIF && <>
                  <span style={{ color: 'var(--text-muted)' }}>→</span>
                  <span style={{ background: 'rgba(30,64,175,0.12)', padding: '2px 8px', fontWeight: 700, color: '#1E40AF' }}>CIF {fmt2(item.cif_price)}</span>
                </>}
              </div>

              {/* Additional price fields */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.4rem' }}>
                {[
                  ...(hasTagFb && item.tag_price != null ? [['HP Tag', fmt2(item.tag_price)]] : []),
                  ...(hasTagFb && item.fb_price  != null ? [['HP FB',  fmt2(item.fb_price)]]  : []),
                  ...(isAG3 && item.qt_pcs > 1 ? [
                    ['Purchase/1sp', fmt2(item.von_san_xuat != null ? item.von_san_xuat / item.qt_pcs : null)],
                    ...(item.tag_price != null ? [['Tag/1sp', fmt2(item.tag_price / item.qt_pcs)]] : []),
                  ] : []),
                  ...(template === 'CH1' && item.erp_bom_cost != null ? [
                    ['ERP BOM ($)', fmt2(item.erp_bom_cost)],
                    ['Chênh lệch', item.von_san_xuat ? (((item.von_san_xuat - item.erp_bom_cost) / item.von_san_xuat) * 100).toFixed(1) + '%' : '—'],
                  ] : []),
                  ...(hasFees ? [
                    ['Gia công', fmt2(item.gia_cong)],
                    ['Đúc', fmt2(item.duc)],
                    ['Thiết kế', fmt2(item.thiet_ke)],
                    ['Resin', fmt2(item.resin)],
                    ['Phụ kiện', fmt2(item.phi_phu_kien)],
                  ] : []),
                  ...(!isAG3 && !isAdm && item.bao_hiem ? [['Bảo hiểm', fmt2(item.bao_hiem)]] : []),
                ].map(([label, val]) => (
                  <div key={String(label)}>
                    <div style={{ fontSize: 10, color: '#1E40AF', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                    <div style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', color: '#1E40AF' }}>{val}</div>
                  </div>
                ))}
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
              <input style={inputStyle} value={form.description} onChange={handleDescriptionChange} /></div>
            <div><label style={labelStyle}>Tên khách</label>
              <input style={inputStyle} value={form.customer_name ?? ''} onChange={f('customer_name')} placeholder="e.g. ADM1, CH1-Khách" /></div>
            <div><label style={labelStyle}>Class</label>
              <ComboInput value={form.class ?? ''} onChange={v => setForm(prev => ({ ...prev, class: v }))} options={classOptions} placeholder="18MTG, DIAJE…" uppercase style={inputStyle} /></div>
            <div><label style={labelStyle}>Sub Class</label>
              <ComboInput value={form.sub_class ?? ''} onChange={v => setForm(prev => ({ ...prev, sub_class: v }))} options={subClassOptions} placeholder="BL, RI, ER, PD…" uppercase style={inputStyle} /></div>
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
                ...(!isAG3 ? [['T.Phẩm vàng TT (gr)', fmtGram(item.t_pham_tru_nvl_da)]] : []),
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
                  ['Chênh lệch', item.von_san_xuat ? (((item.von_san_xuat - item.erp_bom_cost) / item.von_san_xuat) * 100).toFixed(1) + '%' : '—'],
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
              Xoàn / Hột {gems.length > 0 && `(${gems.length})`}
            </span>
            {canEdit && !isLocked && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setGemModal({ open: true, gem: undefined })}
                  style={{ background: 'none', border: '1px solid var(--border-base)', cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', padding: '2px 8px', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className="fa-solid fa-plus" style={{ fontSize: 9 }} /> Thêm xoàn
                </button>
                <button onClick={() => setXoanPanel(v => !v)}
                  title="Tra hột từ file TỔNG HỢP THEO DÕI XOÀN"
                  style={{ background: xoanPanel ? 'var(--text-primary)' : 'none', border: '1px solid var(--border-base)', cursor: 'pointer', fontSize: 'var(--text-xs)', color: xoanPanel ? 'var(--text-inverse)' : 'var(--text-secondary)', padding: '2px 8px', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className="fa-solid fa-magnifying-glass" style={{ fontSize: 9 }} /> Tra hột
                </button>
              </div>
            )}
          </div>

          {gems.length === 0 ? (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>Chưa có hột.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', width: '100%' }}>
                <thead>
                  <tr>{['Mã Xoàn', 'P.Chất', 'Size Range', 'SL', 'TL Trước (ct)', 'TL Sau (ct)', 'TL(gr)', 'Đơn Giá', 'T.Giá Xoàn', '$1/Viên', 'T.Phí', ''].map(h => (
                    <th key={h} style={{ padding: '5px 8px', borderBottom: '2px solid var(--border-base)', textAlign: 'left', fontWeight: 600, fontSize: 'var(--text-xs)', letterSpacing: '0.04em', color: 'var(--text-secondary)', background: 'var(--bg-base)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {gems.map((g: any) => (
                    <tr key={g.id} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border-light)', fontWeight: 600 }}>{g.ma_xoan ?? '—'}</td>
                      <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>{g.p_chat ?? 'VVS1'}</td>
                      <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border-light)' }}>{g.size_xoan_range ?? '—'}</td>
                      <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border-light)', textAlign: 'center' }}>{g.sl_hot}</td>
                      <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border-light)', background: (g.tl_truoc_xu_ly_ct == null && g.tl_sau_xu_ly_ct == null) ? 'rgba(220,38,38,0.08)' : '' }}>
                        {g.tl_truoc_xu_ly_ct != null
                          ? g.tl_truoc_xu_ly_ct.toFixed(3)
                          : (g.tl_sau_xu_ly_ct != null ? '—' : <span style={{ color: '#DC2626', fontSize: 'var(--text-xs)' }}>— nhập tay</span>)}
                      </td>
                      <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>{g.tl_sau_xu_ly_ct?.toFixed(3) ?? '—'}</td>
                      <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border-light)' }}>{fmt4(g.tl_xoan_gr)} <span style={{ fontSize: 9, color: 'var(--color-info)' }}>auto</span></td>
                      <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border-light)' }}>{fmt2(g.don_gia)}</td>
                      <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border-light)', fontWeight: 700, color: '#1E40AF' }}>{fmt2(g.t_gia_xoan)}</td>
                      <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', textAlign: 'center' }}>$1</td>
                      <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border-light)', fontWeight: 600 }}>{fmt2(g.t_phi)}</td>
                      <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>
                        {canEdit && !isLocked && (
                          <>
                            <button onClick={() => setGemModal({ open: true, gem: g })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', marginRight: 4, fontSize: 12 }} title="Sửa"><i className="fa-solid fa-pen" /></button>
                            <button onClick={() => setConfirmDeleteGem(g)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', fontSize: 12 }} title="Xóa"><i className="fa-solid fa-trash" /></button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#e91d79', color: '#FAFAF7' }}>
                    <td colSpan={3} style={{ padding: '5px 8px', fontSize: 'var(--text-xs)', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>Tổng</td>
                    <td style={{ padding: '5px 8px', fontWeight: 600, textAlign: 'center' }}>
                      {gems.reduce((s: number, g: any) => s + (g.sl_hot ?? 0), 0)}
                    </td>
                    <td style={{ padding: '5px 8px', fontWeight: 600 }}>
                      {gems.reduce((s: number, g: any) => s + (g.tl_truoc_xu_ly_ct ?? 0), 0).toFixed(3)}
                    </td>
                    <td />
                    <td style={{ padding: '5px 8px', fontWeight: 600 }}>
                      {gems.reduce((s: number, g: any) => s + (g.tl_xoan_gr ?? 0), 0).toFixed(4)}
                    </td>
                    <td />
                    <td style={{ padding: '5px 8px', fontWeight: 700, color: '#FFFFFF' }}>
                      {fmt2(gems.reduce((s: number, g: any) => s + (g.t_gia_xoan ?? 0), 0))}
                    </td>
                    <td />
                    <td style={{ padding: '5px 8px', fontWeight: 700 }}>
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

      {/* Xoan lookup panel */}
      {hasGems && xoanPanel && (
        <XoanLookupPanel
          invoiceId={invoiceId}
          itemId={item.id}
          soMo={item.so_mo}
          onSaved={onRefresh}
          onClose={() => setXoanPanel(false)}
        />
      )}

      {/* Dialogs */}
      <ConfirmDialog open={confirmDelete} title="Delete Item" message={`Delete item "${item.sku}" (seq ${item.seq})?`} okText={deleting ? 'Deleting…' : 'Delete'} danger onOk={handleDelete} onCancel={() => setConfirmDelete(false)} />
      <ConfirmDialog open={!!confirmDeleteGem} title="Delete Gem" message="Delete this gem entry?" okText={deletingGem ? 'Deleting…' : 'Delete'} danger onOk={handleDeleteGem} onCancel={() => setConfirmDeleteGem(null)} />
      <GemModal open={gemModal.open} invoiceId={invoiceId} itemId={item.id} gem={gemModal.gem} template={template} onClose={() => setGemModal({ open: false })} onSaved={handleGemSaved} />
    </div>
  )
}
