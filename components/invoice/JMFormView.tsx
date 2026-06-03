'use client'

import { useState } from 'react'
import { JMEditableCell } from './JMEditableCell'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { apiCall } from '@/lib/api'


interface Col {
  key:        string
  label:      string
  subLabel?:  string   // second line in header
  mono?:      boolean
  sku?:       boolean
  computed?:  boolean
  price?:     boolean
  adminOnly?: boolean
  notes?:     boolean
  width?:     number
}

// Column order matches Excel JM FORM sheet exactly:
// A=No  B=Store  C=Location  D=Vendor  E=SO/MO  F=SKU  G=Class  H=SubClass
// I=Description  J=Qty  K=Wt  L=HP Purchase  M=HP CIF  P=HP Tag  Q=HP FB  R=Notes
// (V-Invoice extras: Metal, Gold Wt, No-Gem Wt, Gold Value — between K and L)
const JM_COLS: Col[] = [
  { key: 'line_no',               label: 'No.',                              width: 44  },
  { key: 'store',                 label: 'Store',                            width: 70  },
  { key: 'location_store',        label: 'Location',                         width: 80  },
  { key: 'vendor_model',          label: 'Vendor Model',                     width: 100 },
  { key: 'so_mo_code',            label: 'SO/MO',                            width: 140 },
  { key: 'sku_jwmold',            label: 'SKU',            sku: true,        width: 130 },
  { key: 'class',                 label: 'Class',                            width: 80  },
  { key: 'sub_class',             label: 'Sub Class',                        width: 80  },
  { key: 'description',           label: 'Description',                      width: 200 },
  { key: 'qty_pcs',               label: 'Qty',            mono: true,       width: 55  },
  { key: 'metal_type',            label: 'Metal',                            width: 75  },
  { key: 'weight_total_gr',       label: 'Wt (g)',          mono: true,      width: 90  },
  { key: 'weight_gold_actual_gr', label: 'Gold Wt (g)',     mono: true,      width: 95  },
  { key: 'weight_no_gem_gr',      label: 'No-Gem Wt',      mono: true,  computed: true, width: 95  },
  { key: 'gold_value_usd',        label: 'Gold Value',     mono: true,  computed: true, price: true, width: 100 },
  { key: 'hpusa',                 label: 'HP Purchase',    mono: true,  computed: true, price: true, width: 105 },
  { key: 'cif_price',             label: 'HP CIF',         mono: true,  computed: true, price: true, width: 100 },
  { key: 'tag_price',             label: 'HP Tag',         mono: true,  computed: true, price: true, adminOnly: true, width: 100 },
  { key: 'fr_price',              label: 'HP FB',          mono: true,  computed: true, price: true, adminOnly: true, width: 100 },
  { key: 'notes',                 label: 'Notes',          notes: true,                 width: 140 },
]

const EDITABLE_FIELDS = new Set([
  'store', 'location_store', 'vendor_model', 'so_mo_code',
  'qty_pcs', 'description', 'class', 'sub_class', 'metal_type',
  'weight_total_gr', 'weight_gold_actual_gr', 'notes',
])

const NUM_FIELDS = new Set(['qty_pcs', 'weight_total_gr', 'weight_gold_actual_gr'])

function fmt2(n: number | null | undefined) { return n != null ? `$${n.toFixed(2)}` : '—' }
function fmt4(n: number | null | undefined) { return n != null ? n.toFixed(4) : '—' }

function parseFieldValue(field: string, raw: string): unknown {
  if (NUM_FIELDS.has(field)) { const n = parseFloat(raw); return isNaN(n) ? null : n }
  return raw.trim() || null
}

function getDisplayValue(col: Col, item: any): string {
  const v = item[col.key]
  if (col.price)              return fmt2(v)
  if (col.key.endsWith('_gr')) return fmt4(v)
  return v != null ? String(v) : '—'
}

interface Props {
  invoiceId:    string
  items:        any[]
  canSeePrice:  boolean
  canEdit:      boolean
  isLocked:     boolean
  onRefresh:    () => void
  onItemUpdate: (itemId: string, updatedItem: any) => void
}

export function JMFormView({ invoiceId, items, canSeePrice, canEdit, isLocked, onRefresh, onItemUpdate }: Props) {
  const [editCell,     setEditCell]     = useState<{ itemId: string; field: string; value: string } | null>(null)
  const [savingCell,   setSavingCell]   = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
  const [deleting,     setDeleting]     = useState(false)

  const visibleCols = JM_COLS.filter(c => !c.adminOnly || canSeePrice)

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
  const totQty   = items.reduce((s, i) => s + (i.qty_pcs ?? 0), 0)
  const totWt    = items.reduce((s, i) => s + (i.weight_total_gr ?? 0), 0)
  const totGold  = items.reduce((s, i) => s + (i.weight_gold_actual_gr ?? 0), 0)
  const totNoGem = items.reduce((s, i) => s + (i.weight_no_gem_gr ?? 0), 0)
  const totGoldV = items.reduce((s, i) => s + (i.gold_value_usd ?? 0), 0)
  const totHpusa = items.reduce((s, i) => s + (i.hpusa ?? 0), 0)
  const totCif   = items.reduce((s, i) => s + (i.cif_price ?? 0), 0)
  const totTag   = items.reduce((s, i) => s + (i.tag_price ?? 0), 0)
  const totFr    = items.reduce((s, i) => s + (i.fr_price ?? 0), 0)
  const totGemWt = items.reduce((s, i) =>
    s + (i.item_gem_details ?? []).reduce((gs: number, g: any) => gs + (g.weight_gr ?? 0), 0), 0
  )

  // Map col.key → total value for footer
  const TOTALS: Record<string, string | null> = {
    qty_pcs:               String(totQty),
    weight_total_gr:       fmt4(totWt),
    weight_gold_actual_gr: fmt4(totGold),
    weight_no_gem_gr:      fmt4(totNoGem),
    gold_value_usd:        fmt2(totGoldV),
    hpusa:                 fmt2(totHpusa),
    cif_price:             fmt2(totCif),
    tag_price:             fmt2(totTag),
    fr_price:              fmt2(totFr),
  }

  // Find index of 'description' col for TOTAL label placement
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
                  // Sticky: col 0 (No.) and col 5 (SKU)
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
              const isBaSao = item.notes?.toLowerCase().includes('ba sao')
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

                    // No. — readonly
                    if (col.key === 'line_no') {
                      return <td key={col.key} style={{ ...td, ...stickyStyle, background: 'var(--bg-surface)', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textAlign: 'center' }}>{item.line_no}</td>
                    }

                    // SKU — sticky, always yellow
                    if (col.sku) {
                      return <td key={col.key} style={{ ...td, ...stickyStyle, background: 'var(--sku-highlight-bg)', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#92400E' }}>{item.sku_jwmold}</td>
                    }

                    // Notes — Ba Sao red
                    if (col.notes) {
                      return (
                        <JMEditableCell key={col.key} field={col.key}
                          displayValue={item.notes || '—'}
                          isEditing={isEditing}
                          editValue={isEditing ? editCell!.value : ''}
                          isComputed={false} isSaving={isSavingThis}
                          isLocked={isLocked} canEdit={canEdit}
                          tdStyle={{ ...td, color: isBaSao ? '#DC2626' : 'var(--text-secondary)', fontWeight: isBaSao ? 700 : 400, cursor: canEdit && !isLocked ? 'text' : 'default' }}
                          onStartEdit={() => startEdit(item.id, col.key, item.notes)}
                          onChange={v => setEditCell(prev => prev ? { ...prev, value: v } : null)}
                          onCommit={commitEdit} onCancel={cancelEdit}
                        />
                      )
                    }

                    // Computed — readonly, tinted
                    if (col.computed) {
                      return <td key={col.key} style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textAlign: 'right', background: 'var(--bg-base)' }}>{displayVal}</td>
                    }

                    // Editable cells
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

          {/* Totals footer */}
          {items.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border-strong)', fontWeight: 600, background: 'var(--bg-base)' }}>
                {visibleCols.map((col, i) => {
                  const total = TOTALS[col.key]
                  // "TOTAL" label in Description column
                  if (i === descIdx) {
                    return <td key={col.key} style={{ ...td, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>TOTAL</td>
                  }
                  if (total != null) {
                    return <td key={col.key} style={{ ...td, fontFamily: 'var(--font-mono)', textAlign: 'right', fontWeight: col.key === 'hpusa' ? 800 : 600 }}>{total}</td>
                  }
                  return <td key={col.key} style={td} />
                })}
                {canEdit && !isLocked && <td style={td} />}
              </tr>

              {/* Σ Stone Weight row */}
              {totGemWt > 0 && (
                <tr style={{ background: 'var(--bg-base)' }}>
                  {visibleCols.map((col, i) => {
                    if (i === descIdx) return <td key={col.key} style={{ ...td, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'right' }}>Σ Stone Wt (g):</td>
                    if (col.key === 'weight_total_gr') return <td key={col.key} style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'right' }}>{fmt4(totGemWt)}</td>
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
        message={`Delete item "${deleteTarget?.sku_jwmold}" (line ${deleteTarget?.line_no})? This cannot be undone.`}
        okText={deleting ? 'Deleting…' : 'Delete'}
        danger
        onOk={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  )
}
