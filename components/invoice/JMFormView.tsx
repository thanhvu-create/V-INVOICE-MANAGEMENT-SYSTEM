'use client'

import { useState, useEffect, Fragment } from 'react'
import { JMEditableCell } from './JMEditableCell'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DriveImage } from './DriveImage'
import { apiCall } from '@/lib/api'
import { extractVendorModel } from '@/lib/formulas/description-parse'

interface ClassRule { description_prefix: string; class: string; sub_class: string }

function detectClassSubClass(description: string, rules: ClassRule[]): { class: string; sub_class: string } | null {
  if (!description.trim() || rules.length === 0) return null
  const upper = description.trim().toUpperCase()
  const sorted = [...rules].sort((a, b) => b.description_prefix.length - a.description_prefix.length)
  const match = sorted.find(r => upper.startsWith(r.description_prefix))
  return match ? { class: match.class, sub_class: match.sub_class } : null
}


interface Col {
  key:          string
  label:        string
  mono?:        boolean
  sku?:         boolean
  image?:       boolean
  computed?:    boolean
  price?:       boolean
  notes?:       boolean
  width?:       number
  ag3only?:     boolean  // show only for CH1_AG3 / VNSI_AG3
  ch1ag3only?:  boolean  // show only for CH1_AG3
  ch1only?:     boolean  // show only for CH1
  noAg3?:       boolean  // hide for CH1_AG3 / VNSI_AG3
  noAdm?:       boolean  // hide for ADM
  autofill?:    boolean  // shows blue header + "auto" badge but cell is still editable
}

// JM Form sheet columns only — identity fields + output prices
// SUMMARY fields (kich_thuoc, loai_vang, t_pham, fees, shipping, diamonds) belong in Detail View
const JM_COLS: Col[] = [
  // Identity — all templates
  { key: 'seq',              label: 'No.',                                    width: 44  },
  { key: 'image_url',        label: 'Hình',             image: true,         width: 58  },
  { key: 'store',            label: 'Store',                                  width: 70  },
  { key: 'location',         label: 'Location',                               width: 80  },
  { key: 'vendor_model',     label: 'Vendor Model#',                          width: 120 },
  // AG3-only: PO# (replaces SO-MO)
  { key: 'po_number',        label: 'PO#',              ag3only: true,                    width: 130 },
  // CH1_AG3-only: SKU# AG (Lầu 3 SKU) — VNSI_AG3 only has one SKU column
  { key: 'sku_ag',           label: 'SKU# AG',          ch1ag3only: true,                 width: 130 },
  // SO-MO — CH1/CH2/ADM only
  { key: 'so_mo',            label: 'SO-MO',            noAg3: true,                      width: 150 },
  { key: 'sku',              label: 'SKU',              sku: true,                        width: 130 },
  { key: 'class',            label: 'Class',                                              width: 80  },
  { key: 'sub_class',        label: 'Sub Class',                                          width: 80  },
  { key: 'description',      label: 'Description',                                        width: 220 },
  { key: 'qt_pcs',           label: 'Qty',              mono: true,                       width: 55  },
  { key: 't_pham_co_nvl_da', label: 'Wt. (gr)',         mono: true,                       width: 100 },
  // Output prices — all templates
  { key: 'von_san_xuat',     label: 'HP Purchase',       mono: true, computed: true, price: true, width: 105 },
  { key: 'cif_price',        label: 'HP CIF',            mono: true, computed: true, price: true, width: 100 },
  // CH1-only: ERP BOM reference + variance (Excel col N, O — between CIF and Tag)
  { key: 'erp_bom_cost',     label: 'ERP BOM ($)',       mono: true, price: true, ch1only: true, width: 105 },
  { key: 'chenh_lech',       label: 'Chênh lệch',        mono: true, computed: true, ch1only: true, width: 100 },
  { key: 'tag_price',        label: 'HP Tag',            mono: true, price: true, noAg3: true, width: 100 },
  { key: 'fb_price',         label: 'HP FB',             mono: true, price: true, noAg3: true, width: 100 },
  // AG3-only: per-piece pricing display
  { key: '_pu_wt',           label: 'Wt./1sp (gr)',      mono: true, computed: true, price: true, autofill: true, ag3only: true, width: 100 },
  { key: '_purchase_unit',   label: 'Purchase/1sp',      mono: true, computed: true, price: true, autofill: true, ag3only: true, width: 110 },
  { key: '_tag_unit',        label: 'Tag/1sp',           mono: true, computed: true, price: true, autofill: true, ag3only: true, width: 100 },
  // Notes — CH1/CH2 only (Ghi chú column in JM Form tab)
  { key: 'nini_adm',         label: 'Ghi chú',           notes: true, noAg3: true, noAdm: true, width: 140 },
  // Chi tiết/Cặp — AG3 only (col U21 in JM Form AG3 tab)
  { key: 'chi_tiet_tap',     label: 'Chi tiết/Cặp',      notes: true, autofill: true, ag3only: true, width: 160 },
]

const EDITABLE_FIELDS = new Set([
  'store', 'location', 'vendor_model', 'so_mo',
  'po_number', 'sku_ag',
  'qt_pcs', 'description', 'class', 'sub_class',
  't_pham_co_nvl_da',
  'nini_adm', 'chi_tiet_tap',
  'erp_bom_cost',
  'tag_price', 'fb_price',
])

const NUM_FIELDS = new Set([
  'qt_pcs', 't_pham_co_nvl_da',
  'erp_bom_cost',
  'tag_price', 'fb_price',
])

function fmt2(n: number | null | undefined) { return n != null ? `$${Math.round(n)}` : '—' }  // prices — rounded
function fmt4(n: number | null | undefined) { return n != null ? n.toFixed(2) : '—' }          // product weight (gr) — 2 decimals

function parseFieldValue(field: string, raw: string): unknown {
  if (NUM_FIELDS.has(field)) { const n = parseFloat(raw); return isNaN(n) ? null : n }
  return raw.trim() || null
}

function getDisplayValue(col: Col, item: any): string {
  // Computed-display keys (not in DB — derived from other fields)
  if (col.key === 'chenh_lech') {
    const p = item.von_san_xuat ?? 0
    const e = item.erp_bom_cost ?? 0
    if (p === 0) return '—'
    return ((p - e) / p * 100).toFixed(1) + '%'
  }
  if (col.key === '_pu_wt')         return fmt4((item.t_pham_co_nvl_da ?? 0) / Math.max(1, item.qt_pcs ?? 1))
  if (col.key === '_purchase_unit') return fmt2((item.von_san_xuat ?? 0) / Math.max(1, item.qt_pcs ?? 1))
  if (col.key === '_tag_unit')      return fmt2((item.tag_price ?? 0) / Math.max(1, item.qt_pcs ?? 1))
  const v = item[col.key]
  if (col.price)              return fmt2(v)
  if (col.key === 't_pham_co_nvl_da' || col.key === 't_pham_tru_nvl_da') return fmt4(v)
  return v != null ? String(v) : '—'
}


interface Props {
  invoiceId:    string
  items:        any[]
  canSeePrice:  boolean
  canEdit:      boolean
  isLocked:     boolean
  template?:    string
  onRefresh:    () => void
  onItemUpdate: (itemId: string, updatedItem: any) => void
}

export function JMFormView({ invoiceId, items, canSeePrice, canEdit, isLocked, template = 'CH1', onRefresh, onItemUpdate }: Props) {
  const [editCell,     setEditCell]     = useState<{ itemId: string; field: string; value: string } | null>(null)
  const [savingCell,   setSavingCell]   = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
  const [deleting,     setDeleting]     = useState(false)
  const [classRules,   setClassRules]   = useState<ClassRule[]>([])

  useEffect(() => {
    fetch('/api/class-subclass')
      .then(r => r.json())
      .then(j => { if (j.success) setClassRules(j.data) })
      .catch(() => {})
  }, [])

  const isAG3    = template === 'CH1_AG3' || template === 'VNSI_AG3'
  const isAdm    = template === 'ADM'

  const visibleCols = JM_COLS.filter(c => {
    if (c.key === 'cif_price' && template === 'CH2') return false
    // AG3: hide HP Tag and HP FB (replaced by Tag/1sp and Purchase/1sp per-unit columns)
    if ((c.key === 'tag_price' || c.key === 'fb_price') && isAG3) return false
    if (!canSeePrice && c.price) return false
    if (c.ag3only    && !isAG3)               return false
    if (c.ch1ag3only && template !== 'CH1_AG3') return false
    if (c.ch1only    && template !== 'CH1')   return false
    if (c.noAg3      &&  isAG3)               return false
    if (c.noAdm      &&  isAdm)               return false
    return true
  })

  function startEdit(itemId: string, field: string, currentValue: any) {
    if (!canEdit || isLocked) return
    if (!EDITABLE_FIELDS.has(field)) return
    setEditCell({ itemId, field, value: currentValue != null ? String(currentValue) : '' })
  }

  async function commitEdit() {
    if (!editCell) return
    const key = `${editCell.itemId}:${editCell.field}`
    setSavingCell(key)
    setEditCell(null)
    const payload: Record<string, unknown> = { [editCell.field]: parseFieldValue(editCell.field, editCell.value) }

    // Auto-detect class/sub_class + vendor_model when description is edited
    if (editCell.field === 'description') {
      const detected = detectClassSubClass(editCell.value, classRules)
      if (detected) {
        payload.class     = detected.class
        payload.sub_class = detected.sub_class
      }
      // Fill vendor_model only if the current item has none
      const currentItem = items.find(i => i.id === editCell.itemId)
      if (!currentItem?.vendor_model) {
        const model = extractVendorModel(editCell.value)
        if (model) payload.vendor_model = model
      }
    }

    const data = await apiCall<any>(
      () => fetch(`/api/invoices/${invoiceId}/items/${editCell.itemId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      }),
      { successMsg: 'Item saved.' }
    )
    setSavingCell(null)
    if (data) onItemUpdate(editCell.itemId, data)
  }

  function cancelEdit() { setEditCell(null) }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const ok = await apiCall(
      () => fetch(`/api/invoices/${invoiceId}/items/${deleteTarget.id}`, { method: 'DELETE' }),
      { successMsg: 'Item deleted.' }
    )
    setDeleting(false)
    setDeleteTarget(null)
    if (ok !== null) onRefresh()
  }

  const PRICE_BG     = 'rgba(30, 64, 175, 0.04)'
  const PRICE_HEAD   = 'rgba(30, 64, 175, 0.08)'
  const TOTAL_BG     = '#e91d79'
  const TOTAL_COLOR  = '#FAFAF7'

  const th: React.CSSProperties = {
    padding: '6px 8px', background: 'var(--bg-base)',
    fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
    fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--text-secondary)', borderBottom: '2px solid var(--border-base)',
    whiteSpace: 'nowrap', textAlign: 'left', position: 'sticky', top: 0, zIndex: 10,
    borderRight: '1px solid var(--border-light)',
  }
  const td: React.CSSProperties = {
    padding: '5px 8px', borderBottom: '1px solid var(--border-light)',
    borderRight: '1px solid var(--border-light)',
    fontSize: 'var(--text-sm)', verticalAlign: 'middle', whiteSpace: 'nowrap',
  }

  // Totals
  const totQty   = items.reduce((s, i) => s + (i.qt_pcs           ?? 0), 0)
  const totWt    = items.reduce((s, i) => s + (i.t_pham_co_nvl_da ?? i.wt_gr ?? 0), 0)
  const totVonSX = items.reduce((s, i) => s + (i.von_san_xuat     ?? 0), 0)
  const totCif   = items.reduce((s, i) => s + (i.cif_price        ?? 0), 0)
  const totTag   = items.reduce((s, i) => s + (i.tag_price        ?? 0), 0)
  const totFb    = items.reduce((s, i) => s + (i.fb_price         ?? 0), 0)

  const TOTALS: Record<string, string | null> = {
    qt_pcs:           String(totQty),
    t_pham_co_nvl_da: fmt4(totWt),
    von_san_xuat:     fmt2(totVonSX),
    cif_price:        fmt2(totCif),
    tag_price:        totTag > 0 ? fmt2(totTag) : null,
    fb_price:         totFb  > 0 ? fmt2(totFb)  : null,
  }

  const descIdx   = visibleCols.findIndex(c => c.key === 'description')
  const totalCols = visibleCols.length + (canEdit && !isLocked ? 1 : 0)

  return (
    <>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ minWidth: 1400, width: '100%', borderCollapse: 'collapse', borderLeft: '1px solid var(--border-light)' }}>
          <thead>
            <tr>
              {visibleCols.map((c, i) => (
                <th key={c.key} style={{
                  ...th,
                  width: c.width, minWidth: c.width,
                  color: (c.price && !c.computed) || c.autofill ? '#1E40AF' : c.computed ? 'var(--color-info)' : 'var(--text-secondary)',
                  textAlign: c.price || c.mono ? 'right' : 'left',
                  position: (i === 0 || c.image || c.sku) ? 'sticky' : 'sticky',
                  left:     i === 0 ? 0 : c.image ? 44 : c.sku ? 102 : undefined,
                  zIndex:   i === 0 || c.image || c.sku ? 20 : 10,
                  background: c.sku ? 'var(--sku-highlight-bg)' : ((c.price && !c.computed) || c.autofill) ? PRICE_HEAD : 'var(--bg-base)',
                }}>
                  {c.label}
                  {(c.computed || c.autofill) && <span style={{ display: 'block', fontSize: 9, fontWeight: 400, letterSpacing: 0, color: ((c.price && !c.computed) || c.autofill) ? '#1E40AF' : 'var(--color-info)', textTransform: 'none' }}>auto</span>}
                </th>
              ))}
              {canEdit && !isLocked && <th style={{ ...th, width: 40, zIndex: 10 }} />}
            </tr>
          </thead>

          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={totalCols} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                  No items yet. Use <strong>Import</strong> or <strong>Add Item</strong> to get started.
                </td>
              </tr>
            )}

            {items.map(item => {
              const notesVal = isAG3 ? (item.chi_tiet_tap ?? '') : (item.nini_adm ?? '')
              const isBaSao  = notesVal.toLowerCase().includes('ba sao')

              return (
                <Fragment key={item.id}>
                  {/* ── Product row ── */}
                  <tr
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>

                    {visibleCols.map((col, i) => {
                      const isEditing    = editCell?.itemId === item.id && editCell?.field === col.key
                      const isSavingThis = savingCell === `${item.id}:${col.key}`
                      const isEditableF  = EDITABLE_FIELDS.has(col.key)
                      const displayVal   = getDisplayValue(col, item)

                      const stickyStyle: React.CSSProperties = (i === 0 || col.image || col.sku) ? {
                        position: 'sticky',
                        left:     i === 0 ? 0 : col.image ? 44 : 102,
                        zIndex:   1,
                      } : {}

                      if (col.key === 'seq') {
                        return (
                          <td key={col.key} style={{ ...td, ...stickyStyle, background: 'var(--bg-surface)', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textAlign: 'center' }}>
                            {item.seq}
                          </td>
                        )
                      }

                      if (col.image) {
                        return (
                          <td key={col.key} style={{ ...td, padding: '3px 6px', verticalAlign: 'middle' }}>
                            <DriveImage url={item.image_url} alt={item.sku ?? ''} size={48} />
                          </td>
                        )
                      }

                      if (col.sku) {
                        return <td key={col.key} style={{ ...td, ...stickyStyle, background: 'var(--sku-highlight-bg)', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#92400E' }}>{item.sku}</td>
                      }

                      if (col.notes) {
                        const cellVal = item[col.key] ?? ''
                        const isThisBaSao = cellVal.toLowerCase().includes('ba sao')
                        return (
                          <JMEditableCell key={col.key} field={col.key}
                            displayValue={cellVal || '—'}
                            isEditing={isEditing}
                            editValue={isEditing ? editCell!.value : ''}
                            isComputed={false} isSaving={isSavingThis}
                            isLocked={isLocked} canEdit={canEdit}
                            tdStyle={{ ...td, color: isThisBaSao ? '#DC2626' : col.autofill ? '#1E40AF' : 'var(--text-secondary)', fontWeight: isThisBaSao ? 700 : 400, background: col.autofill ? PRICE_BG : undefined, cursor: canEdit && !isLocked ? 'text' : 'default' }}
                            onStartEdit={() => startEdit(item.id, col.key, cellVal)}
                            onChange={v => setEditCell(prev => prev ? { ...prev, value: v } : null)}
                            onCommit={commitEdit} onCancel={cancelEdit}
                          />
                        )
                      }

                      if (col.computed) {
                        return <td key={col.key} style={{ ...td, fontFamily: 'var(--font-mono)', color: col.price ? '#1E40AF' : 'var(--text-muted)', fontWeight: col.price ? 600 : 400, textAlign: 'right', background: col.autofill ? PRICE_BG : undefined }}>{displayVal}</td>
                      }

                      // tag/fb: computed (read-only) for AG3, manually editable for CH1/CH2/ADM
                      if ((col.key === 'tag_price' || col.key === 'fb_price') && isAG3) {
                        return <td key={col.key} style={{ ...td, fontFamily: 'var(--font-mono)', color: '#1E40AF', fontWeight: 600, textAlign: 'right' }}>{displayVal}</td>
                      }

                      return (
                        <JMEditableCell key={col.key} field={col.key}
                          displayValue={displayVal}
                          isEditing={isEditing}
                          editValue={isEditing ? editCell!.value : ''}
                          isComputed={false} isSaving={isSavingThis}
                          isLocked={isLocked} canEdit={canEdit && isEditableF}
                          tdStyle={{ ...td,
                            fontFamily: col.mono ? 'var(--font-mono)' : 'inherit',
                            textAlign: (col.price || col.mono) ? 'right' : 'left',
                            background: col.price ? PRICE_BG : undefined,
                            color: col.price ? '#1E40AF' : undefined,
                            fontWeight: col.price ? 600 : undefined,
                          }}
                          onStartEdit={() => startEdit(item.id, col.key, item[col.key])}
                          onChange={v => setEditCell(prev => prev ? { ...prev, value: v } : null)}
                          onCommit={commitEdit} onCancel={cancelEdit}
                        />
                      )
                    })}

                    {canEdit && !isLocked && (
                      <td style={{ ...td, textAlign: 'center', width: 40 }}>
                        <button onClick={() => setDeleteTarget(item)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', fontSize: 12 }}
                          title="Delete"><i className="fa-solid fa-trash" /></button>
                      </td>
                    )}
                  </tr>

                </Fragment>
              )
            })}
          </tbody>

          {items.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 600, background: TOTAL_BG, color: TOTAL_COLOR }}>
                {visibleCols.map((col, i) => {
                  const total = TOTALS[col.key]
                  const isMajorTotal = col.key === 'von_san_xuat' || col.key === 'cif_price'
                  if (i === descIdx) {
                    return <td key={col.key} style={{ ...td, borderColor: 'rgba(255,255,255,0.25)', fontSize: 'var(--text-xs)', color: 'rgba(255,255,255,0.8)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>TOTAL ({items.length} items)</td>
                  }
                  if (total != null) {
                    return <td key={col.key} style={{ ...td, borderColor: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-mono)', textAlign: 'right', fontWeight: isMajorTotal ? 800 : 600, fontSize: isMajorTotal ? 'var(--text-base)' : 'var(--text-sm)', color: isMajorTotal ? '#FFFFFF' : TOTAL_COLOR }}>{total}</td>
                  }
                  return <td key={col.key} style={{ ...td, borderColor: 'rgba(255,255,255,0.25)' }} />
                })}
                {canEdit && !isLocked && <td style={{ ...td, borderColor: 'rgba(255,255,255,0.25)' }} />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Item"
        message={`Delete item "${deleteTarget?.sku}" (seq ${deleteTarget?.seq})? This cannot be undone.`}
        okText={deleting ? 'Deleting…' : 'Delete'}
        danger
        onOk={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  )
}
