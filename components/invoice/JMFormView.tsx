'use client'

import { useState } from 'react'
import { JMEditableCell } from './JMEditableCell'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { apiCall } from '@/lib/api'
import type { InvoiceItem } from '@/types'

const METAL_TYPES = ['18KW', '18KY', '14KY', 'PT950', 'PT', '24K', 'AG', 'PD']

interface Col {
  key:       string
  label:     string
  mono?:     boolean
  sku?:      boolean
  computed?: boolean
  price?:    boolean
  adminOnly?: boolean
  width?:    number
}

const JM_COLS: Col[] = [
  { key: 'line_no',               label: 'No.',           mono: true,  width: 48  },
  { key: 'sku_jwmold',             label: 'SKU JWMold',    sku:  true,  width: 140 },
  { key: 'qty_pcs',                label: 'Qty',           mono: true,  width: 60  },
  { key: 'description',            label: 'Description',                width: 200 },
  { key: 'class',                  label: 'Class',                      width: 90  },
  { key: 'sub_class',              label: 'Sub Class',                  width: 90  },
  { key: 'metal_type',             label: 'Metal',                      width: 80  },
  { key: 'notes',                  label: 'Notes',                      width: 140 },
  { key: 'weight_total_gr',        label: 'Total Wt (g)',  mono: true,  width: 100 },
  { key: 'weight_gold_actual_gr',  label: 'Gold Wt (g)',   mono: true,  width: 100 },
  { key: 'weight_no_gem_gr',       label: 'No-Gem Wt (g)', mono: true, computed: true, width: 110 },
  { key: 'gold_value_usd',         label: 'Gold Value',    mono: true, computed: true, price: true, width: 110 },
  { key: 'hpusa',                  label: 'HPUSA',         mono: true, computed: true, price: true, width: 110 },
  { key: 'cif_price',              label: 'CIF',           mono: true, computed: true, price: true, width: 110 },
  { key: 'tag_price',              label: 'Tag Price',     mono: true, computed: true, price: true, adminOnly: true, width: 110 },
]

const EDITABLE_FIELDS = new Set([
  'qty_pcs', 'description', 'class', 'sub_class', 'metal_type',
  'notes', 'weight_total_gr', 'weight_gold_actual_gr',
])

function fmt2(n: number | null | undefined) { return n != null ? `$${n.toFixed(2)}` : '—' }
function fmt4(n: number | null | undefined) { return n != null ? n.toFixed(4) : '—' }

function parseFieldValue(field: string, raw: string): unknown {
  const nums = ['qty_pcs', 'weight_total_gr', 'weight_gold_actual_gr']
  if (nums.includes(field)) {
    const n = parseFloat(raw)
    return isNaN(n) ? null : n
  }
  return raw.trim() || null
}

function getDisplayValue(col: Col, item: any): string {
  const v = item[col.key]
  if (col.price)  return fmt2(v)
  if (col.key.endsWith('_gr')) return fmt4(v)
  return v != null ? String(v) : '—'
}

interface Props {
  invoiceId:   string
  items:       any[]
  canSeePrice: boolean
  canEdit:     boolean
  isLocked:    boolean
  onRefresh:   () => void
}

export function JMFormView({ invoiceId, items, canSeePrice, canEdit, isLocked, onRefresh }: Props) {
  const [editCell,   setEditCell]   = useState<{ itemId: string; field: string; value: string } | null>(null)
  const [savingCell, setSavingCell] = useState<string | null>(null)  // 'itemId:field'
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
  const [deleting, setDeleting] = useState(false)

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
    const data = await apiCall(
      () => fetch(`/api/invoices/${invoiceId}/items/${editCell.itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      { successMsg: 'Item saved.' }
    )
    setSavingCell(null)
    if (data) onRefresh()
  }

  function cancelEdit() { setEditCell(null) }

  async function confirmDelete() {
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
    padding: '0.5rem 0.6rem', background: 'var(--bg-base)',
    fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
    fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--text-secondary)', borderBottom: '2px solid var(--border-base)',
    whiteSpace: 'nowrap', textAlign: 'left', position: 'sticky', top: 0, zIndex: 10,
  }
  const td: React.CSSProperties = {
    padding: '0.5rem 0.6rem', borderBottom: '1px solid var(--border-light)',
    fontSize: 'var(--text-sm)', verticalAlign: 'middle', whiteSpace: 'nowrap',
  }

  // Totals
  const totQty    = items.reduce((s, i) => s + (i.qty_pcs ?? 0), 0)
  const totWt     = items.reduce((s, i) => s + (i.weight_total_gr ?? 0), 0)
  const totGold   = items.reduce((s, i) => s + (i.weight_gold_actual_gr ?? 0), 0)
  const totNoGem  = items.reduce((s, i) => s + (i.weight_no_gem_gr ?? 0), 0)
  const totGoldV  = items.reduce((s, i) => s + (i.gold_value_usd ?? 0), 0)
  const totHpusa  = items.reduce((s, i) => s + (i.hpusa ?? 0), 0)
  const totCif    = items.reduce((s, i) => s + (i.cif_price ?? 0), 0)
  const totTag    = items.reduce((s, i) => s + (i.tag_price ?? 0), 0)

  return (
    <>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ minWidth: 1200, width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {visibleCols.map(c => (
                <th key={c.key} style={{ ...th, width: c.width, minWidth: c.width }}>{c.label}</th>
              ))}
              {canEdit && !isLocked && <th style={{ ...th, width: 48 }} />}
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
                <tr
                  key={item.id}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  {visibleCols.map(col => {
                    const isEditing   = editCell?.itemId === item.id && editCell?.field === col.key
                    const isSavingThis = savingCell === `${item.id}:${col.key}`
                    const isEditableField = EDITABLE_FIELDS.has(col.key)
                    const displayVal  = getDisplayValue(col, item)

                    // Special SKU cell
                    if (col.sku) {
                      return (
                        <td key={col.key} style={{ ...td, background: 'var(--sku-highlight-bg)', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#92400E' }}>
                          {item.sku_jwmold}
                        </td>
                      )
                    }

                    // line_no — always readonly
                    if (col.key === 'line_no') {
                      return <td key={col.key} style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{item.line_no}</td>
                    }

                    // Notes cell — ba sao red
                    if (col.key === 'notes') {
                      const notesStyle: React.CSSProperties = {
                        ...td,
                        color: isBaSao ? '#DC2626' : 'var(--text-secondary)',
                        fontWeight: isBaSao ? 700 : 400,
                        cursor: canEdit && !isLocked ? 'text' : 'default',
                      }
                      return (
                        <JMEditableCell
                          key={col.key}
                          field={col.key}
                          displayValue={item.notes || '—'}
                          isEditing={isEditing}
                          editValue={editCell?.itemId === item.id && editCell?.field === col.key ? editCell.value : ''}
                          isComputed={false}
                          isSaving={isSavingThis}
                          isLocked={isLocked}
                          canEdit={canEdit}
                          tdStyle={notesStyle}
                          onStartEdit={() => startEdit(item.id, col.key, item.notes)}
                          onChange={v => setEditCell(prev => prev ? { ...prev, value: v } : null)}
                          onCommit={commitEdit}
                          onCancel={cancelEdit}
                        />
                      )
                    }

                    // Computed cells
                    if (col.computed) {
                      return (
                        <td key={col.key} style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textAlign: 'right', background: 'var(--bg-base)' }}>
                          {displayVal}
                        </td>
                      )
                    }

                    // Editable cells
                    return (
                      <JMEditableCell
                        key={col.key}
                        field={col.key}
                        displayValue={displayVal}
                        isEditing={isEditing}
                        editValue={editCell?.itemId === item.id && editCell?.field === col.key ? editCell.value : ''}
                        isComputed={col.computed}
                        isSaving={isSavingThis}
                        isLocked={isLocked}
                        canEdit={canEdit && isEditableField}
                        tdStyle={{
                          ...td,
                          fontFamily: col.mono ? 'var(--font-mono)' : 'inherit',
                          textAlign: col.price || col.key.endsWith('_gr') || col.key === 'qty_pcs' ? 'right' : 'left',
                        }}
                        onStartEdit={() => startEdit(item.id, col.key, item[col.key])}
                        onChange={v => setEditCell(prev => prev ? { ...prev, value: v } : null)}
                        onCommit={commitEdit}
                        onCancel={cancelEdit}
                      />
                    )
                  })}

                  {/* Delete action */}
                  {canEdit && !isLocked && (
                    <td style={{ ...td, textAlign: 'center', width: 48 }}>
                      <button
                        onClick={() => setDeleteTarget(item)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', fontSize: 12, padding: '0 4px' }}
                        title="Delete item"
                      >
                        <i className="fa-solid fa-trash" />
                      </button>
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
                <td style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }} />
                <td style={{ ...td }} />
                <td style={{ ...td, fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{totQty}</td>
                <td colSpan={4} style={{ ...td, textAlign: 'right', paddingRight: 12, fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>TOTAL</td>
                <td style={{ ...td }} /> {/* notes */}
                <td style={{ ...td, fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{fmt4(totWt)}</td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{fmt4(totGold)}</td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{fmt4(totNoGem)}</td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{fmt2(totGoldV)}</td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', textAlign: 'right', fontWeight: 700 }}>{fmt2(totHpusa)}</td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{fmt2(totCif)}</td>
                {canSeePrice && <td style={{ ...td, fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{fmt2(totTag)}</td>}
                {canEdit && !isLocked && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Item"
        message={`Delete item "${deleteTarget?.sku_jwmold}" (line ${deleteTarget?.line_no})? This cannot be undone.`}
        okText={deleting ? 'Deleting...' : 'Delete'}
        danger
        onOk={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  )
}
