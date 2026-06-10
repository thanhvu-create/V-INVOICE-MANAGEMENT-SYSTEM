'use client'

import { useState } from 'react'
import { JMEditableCell } from './JMEditableCell'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { apiCall } from '@/lib/api'


interface Col {
  key:        string
  label:      string
  mono?:      boolean
  sku?:       boolean
  computed?:  boolean
  price?:     boolean
  notes?:     boolean
  width?:     number
}

// Column order matches SUMMARY sheet (JM-FORM logic-flow.md):
const JM_COLS: Col[] = [
  { key: 'seq',              label: 'No.',                                  width: 44  },
  { key: 'store',            label: 'Store',                                width: 70  },
  { key: 'location',         label: 'Location',                             width: 80  },
  { key: 'so_mo',            label: 'SO-MO',                                width: 150 },
  { key: 'sku',              label: 'SKU',             sku: true,           width: 130 },
  { key: 'class',            label: 'Class',                                width: 80  },
  { key: 'sub_class',        label: 'Sub Class',                            width: 80  },
  { key: 'description',      label: 'Description',                          width: 220 },
  { key: 'qt_pcs',           label: 'Qty',             mono: true,          width: 55  },
  { key: 'loai_vang',        label: 'Loại vàng',                            width: 85  },
  { key: 't_pham_co_nvl_da', label: 'T.Phẩm có NVL đá', mono: true,        width: 130 },
  { key: 't_pham_tru_nvl_da',label: 'T.Phẩm vàng TT', mono: true, computed: true, width: 115 },
  { key: 'tien_vang',        label: 'Tiền vàng',       mono: true, computed: true, price: true, width: 105 },
  { key: 'von_san_xuat',     label: 'Vốn SX',          mono: true, computed: true, price: true, width: 105 },
  { key: 'cif_price',        label: 'CIF/SP',          mono: true, computed: true, price: true, width: 100 },
  { key: 'nini_adm',         label: 'Notes',           notes: true,                 width: 140 },
]

const EDITABLE_FIELDS = new Set([
  'store', 'location', 'so_mo',
  'qt_pcs', 'description', 'class', 'sub_class', 'loai_vang',
  't_pham_co_nvl_da', 'nini_adm',
])

const NUM_FIELDS = new Set(['qt_pcs', 't_pham_co_nvl_da'])

function fmt2(n: number | null | undefined) { return n != null ? `$${n.toFixed(2)}` : '—' }
function fmt4(n: number | null | undefined) { return n != null ? n.toFixed(4) : '—' }

function parseFieldValue(field: string, raw: string): unknown {
  if (NUM_FIELDS.has(field)) { const n = parseFloat(raw); return isNaN(n) ? null : n }
  return raw.trim() || null
}

function getDisplayValue(col: Col, item: any): string {
  const v = item[col.key]
  if (col.price)              return fmt2(v)
  if (col.key.endsWith('_gr') || col.key.endsWith('_da')) return fmt4(v)
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

  // CH2 has no CIF column
  const visibleCols = JM_COLS.filter(c => {
    if (c.key === 'cif_price' && template === 'CH2') return false
    if (!canSeePrice && c.price) return false
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
    const payload = { [editCell.field]: parseFieldValue(editCell.field, editCell.value) }
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
  const totQty    = items.reduce((s, i) => s + (i.qt_pcs           ?? 0), 0)
  const totWt     = items.reduce((s, i) => s + (i.t_pham_co_nvl_da ?? i.wt_gr ?? 0), 0)
  const totNoGem  = items.reduce((s, i) => s + (i.t_pham_tru_nvl_da ?? 0), 0)
  const totGoldV  = items.reduce((s, i) => s + (i.tien_vang    ?? 0), 0)
  const totVonSX  = items.reduce((s, i) => s + (i.von_san_xuat ?? 0), 0)
  const totCif    = items.reduce((s, i) => s + (i.cif_price    ?? 0), 0)
  const totGemWt  = items.reduce((s, i) =>
    s + (i.invoice_diamonds ?? []).reduce((gs: number, g: any) => gs + (g.tl_xoan_gr ?? 0), 0), 0
  )

  const TOTALS: Record<string, string | null> = {
    qt_pcs:            String(totQty),
    t_pham_co_nvl_da:  fmt4(totWt),
    t_pham_tru_nvl_da: fmt4(totNoGem),
    tien_vang:         fmt2(totGoldV),
    von_san_xuat:      fmt2(totVonSX),
    cif_price:         fmt2(totCif),
  }

  const descIdx = visibleCols.findIndex(c => c.key === 'description')

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
                  color: c.computed ? 'var(--color-info)' : 'var(--text-secondary)',
                  textAlign: c.price || c.mono ? 'right' : 'left',
                  position: (i === 0 || c.sku) ? 'sticky' : 'sticky',
                  left:     i === 0 ? 0 : c.sku ? 44 : undefined,
                  zIndex:   i === 0 || c.sku ? 20 : 10,
                  background: c.sku ? 'var(--sku-highlight-bg)' : 'var(--bg-base)',
                }}>
                  {c.label}
                  {c.computed && <span style={{ display: 'block', fontSize: 9, fontWeight: 400, letterSpacing: 0, color: 'var(--color-info)', textTransform: 'none' }}>auto</span>}
                </th>
              ))}
              {canEdit && !isLocked && <th style={{ ...th, width: 40, zIndex: 10 }} />}
            </tr>
          </thead>

          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={visibleCols.length + 1} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                  No items yet. Use <strong>Import</strong> or <strong>Add Item</strong> to get started.
                </td>
              </tr>
            )}

            {items.map(item => {
              const isBaSao = item.nini_adm?.toLowerCase().includes('ba sao')
              return (
                <tr key={item.id}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>

                  {visibleCols.map((col, i) => {
                    const isEditing    = editCell?.itemId === item.id && editCell?.field === col.key
                    const isSavingThis = savingCell === `${item.id}:${col.key}`
                    const isEditableF  = EDITABLE_FIELDS.has(col.key)
                    const displayVal   = getDisplayValue(col, item)

                    const stickyStyle: React.CSSProperties = (i === 0 || col.sku) ? {
                      position: 'sticky',
                      left:     i === 0 ? 0 : 44,
                      zIndex:   1,
                    } : {}

                    if (col.key === 'seq') {
                      return <td key={col.key} style={{ ...td, ...stickyStyle, background: 'var(--bg-surface)', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textAlign: 'center' }}>{item.seq}</td>
                    }

                    if (col.sku) {
                      return <td key={col.key} style={{ ...td, ...stickyStyle, background: 'var(--sku-highlight-bg)', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#92400E' }}>{item.sku}</td>
                    }

                    if (col.notes) {
                      return (
                        <JMEditableCell key={col.key} field={col.key}
                          displayValue={item.nini_adm || '—'}
                          isEditing={isEditing}
                          editValue={isEditing ? editCell!.value : ''}
                          isComputed={false} isSaving={isSavingThis}
                          isLocked={isLocked} canEdit={canEdit}
                          tdStyle={{ ...td, color: isBaSao ? '#DC2626' : 'var(--text-secondary)', fontWeight: isBaSao ? 700 : 400, cursor: canEdit && !isLocked ? 'text' : 'default' }}
                          onStartEdit={() => startEdit(item.id, col.key, item.nini_adm)}
                          onChange={v => setEditCell(prev => prev ? { ...prev, value: v } : null)}
                          onCommit={commitEdit} onCancel={cancelEdit}
                        />
                      )
                    }

                    if (col.computed) {
                      return <td key={col.key} style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textAlign: 'right', background: 'var(--bg-base)' }}>{displayVal}</td>
                    }

                    return (
                      <JMEditableCell key={col.key} field={col.key}
                        displayValue={displayVal}
                        isEditing={isEditing}
                        editValue={isEditing ? editCell!.value : ''}
                        isComputed={col.computed} isSaving={isSavingThis}
                        isLocked={isLocked} canEdit={canEdit && isEditableF}
                        tdStyle={{ ...td,
                          fontFamily: col.mono ? 'var(--font-mono)' : 'inherit',
                          textAlign: (col.price || col.mono) ? 'right' : 'left',
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
              )
            })}
          </tbody>

          {items.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border-strong)', fontWeight: 600, background: 'var(--bg-base)' }}>
                {visibleCols.map((col, i) => {
                  const total = TOTALS[col.key]
                  if (i === descIdx) {
                    return <td key={col.key} style={{ ...td, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>TOTAL</td>
                  }
                  if (total != null) {
                    return <td key={col.key} style={{ ...td, fontFamily: 'var(--font-mono)', textAlign: 'right', fontWeight: (col.key === 'von_san_xuat' || col.key === 'cif_price') ? 800 : 600 }}>{total}</td>
                  }
                  return <td key={col.key} style={td} />
                })}
                {canEdit && !isLocked && <td style={td} />}
              </tr>

              {totGemWt > 0 && (
                <tr style={{ background: 'var(--bg-base)' }}>
                  {visibleCols.map((col, i) => {
                    if (i === descIdx) return <td key={col.key} style={{ ...td, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'right' }}>Σ TL Xoàn (gr):</td>
                    if (col.key === 't_pham_co_nvl_da') return <td key={col.key} style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'right' }}>{fmt4(totGemWt)}</td>
                    return <td key={col.key} style={td} />
                  })}
                  {canEdit && !isLocked && <td style={td} />}
                </tr>
              )}
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
