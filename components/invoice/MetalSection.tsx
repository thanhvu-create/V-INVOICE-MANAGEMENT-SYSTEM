'use client'

import { useState } from 'react'
import { apiCall } from '@/lib/api'
import { ComboInput } from '@/components/ui/ComboInput'

function fmt2(n: number | null | undefined) { return n != null ? `$${Math.round(n)}` : '—' }
function fmtGram(n: number | null | undefined) { return n != null ? n.toFixed(2) : '—' }

const cellInput: React.CSSProperties = {
  width: '100%', border: '1px solid var(--border-base)', borderRadius: 0,
  background: 'var(--bg-surface)', padding: '4px 6px',
  fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)', outline: 'none',
}

interface Props {
  invoiceId:    string
  item:         any
  canSeePrice:  boolean
  canEdit:      boolean
  isLocked:     boolean
  metalTypes:   string[]
  onItemUpdate: (itemId: string, updatedItem: any) => void
}

/**
 * Multi-metal editor for one item. Each row = one gold type + its weight (gr).
 * When ≥1 row exists, the item's gold weight & tien_vang come from these rows (Σ).
 * Mirrors the gem sub-table: mutations hit /metals and return the recalced item.
 */
export function MetalSection({ invoiceId, item, canSeePrice, canEdit, isLocked, metalTypes, onItemUpdate }: Props) {
  const metals: any[] = (item.invoice_item_metals ?? []).slice().sort((a: any, b: any) => (a.seq ?? 0) - (b.seq ?? 0))
  const editable = canEdit && !isLocked

  const [newLoai, setNewLoai] = useState('')
  const [newWeight, setNewWeight] = useState('')
  const [busy, setBusy] = useState(false)

  const totalWeight = metals.reduce((s, m) => s + (m.weight_gr ?? 0), 0)
  const totalTien   = metals.reduce((s, m) => s + (m.tien_vang ?? 0), 0)
  const gems: any[] = item.invoice_diamonds ?? []
  const gemGr       = gems.reduce((s: number, g: any) => s + (g.tl_xoan_gr ?? 0), 0)
  const goldFromTpham = (item.t_pham_co_nvl_da ?? 0) - gemGr
  const mismatch    = metals.length > 0 && Math.abs(totalWeight - goldFromTpham) > 0.005

  async function addMetal() {
    if (!newLoai.trim()) return
    setBusy(true)
    const data = await apiCall<any>(
      () => fetch(`/api/invoices/${invoiceId}/items/${item.id}/metals`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loai_vang: newLoai.trim().toUpperCase(), weight_gr: parseFloat(newWeight) || 0 }),
      }),
      { successMsg: 'Đã thêm loại vàng.' }
    )
    setBusy(false)
    if (data !== null) { setNewLoai(''); setNewWeight(''); onItemUpdate(item.id, data) }
  }

  async function patchMetal(metalId: string, patch: Record<string, unknown>) {
    const data = await apiCall<any>(
      () => fetch(`/api/invoices/${invoiceId}/items/${item.id}/metals/${metalId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      }),
      {}
    )
    if (data !== null) onItemUpdate(item.id, data)
  }

  async function deleteMetal(metalId: string) {
    setBusy(true)
    const data = await apiCall<any>(
      () => fetch(`/api/invoices/${invoiceId}/items/${item.id}/metals/${metalId}`, { method: 'DELETE' }),
      { successMsg: 'Đã xóa loại vàng.' }
    )
    setBusy(false)
    if (data !== null) onItemUpdate(item.id, data)
  }

  return (
    <div style={{ borderTop: '1px solid var(--border-light)', padding: '0.75rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          Loại vàng (nhiều loại) {metals.length > 0 && `(${metals.length})`}
        </span>
      </div>

      {metals.length === 0 ? (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '0 0 0.5rem' }}>
          Chưa có — item dùng 1 loại vàng ở trên. Thêm ≥1 dòng để chuyển sang nhiều loại (tiền vàng = Σ từng loại).
        </p>
      ) : (
        <div style={{ overflowX: 'auto', marginBottom: '0.5rem' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', width: '100%', maxWidth: 560 }}>
            <thead>
              <tr>{['Loại vàng', 'TL (gr)', ...(canSeePrice ? ['Tiền vàng'] : []), ''].map(h => (
                <th key={h} style={{ padding: '5px 8px', borderBottom: '2px solid var(--border-base)', textAlign: 'left', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', background: 'var(--bg-base)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {metals.map((m: any) => (
                <tr key={m.id}>
                  <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', minWidth: 130 }}>
                    {editable ? (
                      <ComboInput
                        value={m.loai_vang ?? ''}
                        onChange={v => { if (v && v !== m.loai_vang) patchMetal(m.id, { loai_vang: v.toUpperCase() }) }}
                        options={metalTypes}
                        placeholder="18KY…"
                        uppercase
                        style={cellInput}
                      />
                    ) : (m.loai_vang ?? '—')}
                  </td>
                  <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', width: 110 }}>
                    {editable ? (
                      <input
                        type="number" min="0" step="0.0001" defaultValue={m.weight_gr ?? 0} style={cellInput}
                        onBlur={e => {
                          const v = parseFloat(e.target.value) || 0
                          if (v !== (m.weight_gr ?? 0)) patchMetal(m.id, { weight_gr: v })
                        }}
                      />
                    ) : fmtGram(m.weight_gr)}
                  </td>
                  {canSeePrice && (
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', fontWeight: 700, color: '#1E40AF' }}>{fmt2(m.tien_vang)}</td>
                  )}
                  <td style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>
                    {editable && (
                      <button onClick={() => deleteMetal(m.id)} disabled={busy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', fontSize: 12 }} title="Xóa"><i className="fa-solid fa-trash" /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--bg-base)' }}>
                <td style={{ padding: '5px 8px', fontWeight: 700, textAlign: 'right', fontSize: 'var(--text-xs)', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Tổng</td>
                <td style={{ padding: '5px 8px', fontWeight: 700 }}>{fmtGram(totalWeight)}</td>
                {canSeePrice && <td style={{ padding: '5px 8px', fontWeight: 700, color: '#1E40AF' }}>{fmt2(totalTien)}</td>}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {mismatch && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning)', margin: '0 0 0.5rem' }}>
          <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 5 }} />
          Tổng TL loại vàng ({fmtGram(totalWeight)}g) khác TL vàng từ Wt.−hột ({fmtGram(goldFromTpham)}g) — chỉ cảnh báo.
        </p>
      )}

      {editable && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 130 }}>
            <ComboInput value={newLoai} onChange={setNewLoai} options={metalTypes} placeholder="Loại vàng…" uppercase style={cellInput} />
          </div>
          <input type="number" min="0" step="0.0001" value={newWeight} onChange={e => setNewWeight(e.target.value)} placeholder="TL (gr)" style={{ ...cellInput, width: 100 }} />
          <button onClick={addMetal} disabled={busy || !newLoai.trim()} style={{ background: 'none', border: '1px solid var(--border-base)', cursor: busy || !newLoai.trim() ? 'not-allowed' : 'pointer', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
            <i className="fa-solid fa-plus" style={{ fontSize: 9 }} /> Thêm loại vàng
          </button>
        </div>
      )}
    </div>
  )
}
