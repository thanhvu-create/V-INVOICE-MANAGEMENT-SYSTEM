'use client'

import { ItemCard } from './ItemCard'

function fmt2(n: number | null | undefined)   { return n != null ? `$${Math.round(n)}` : '—' }  // prices — rounded
function fmtGram(n: number | null | undefined){ return n != null ? n.toFixed(2) : '—' }          // product weight (gr) — 2 decimals
function fmt4(n: number | null | undefined)   { return n != null ? n.toFixed(4) : '—' }          // gem weight (gr) — 4 decimals

function TotalField({ label, value, mono, bold, muted }: { label: string; value: any; mono?: boolean; bold?: boolean; muted?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)', fontSize: bold ? 'var(--text-base)' : 'var(--text-sm)', fontWeight: bold ? 700 : 400, color: muted ? 'rgba(255,255,255,0.7)' : bold ? '#FFFFFF' : '#FAFAF7' }}>
        {value}
      </div>
    </div>
  )
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

export function DetailView({ invoiceId, items, canSeePrice, canEdit, isLocked, template = 'CH1', onRefresh, onItemUpdate }: Props) {
  if (items.length === 0) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-base)' }}>
        No items yet. Use <strong>Import</strong> or <strong>Add Item</strong> to get started.
      </div>
    )
  }

  const totQty   = items.reduce((s, i) => s + (i.qt_pcs ?? 0), 0)
  const totWt    = items.reduce((s, i) => s + (i.t_pham_co_nvl_da ?? i.wt_gr ?? 0), 0)
  const totGemWt = items.reduce((s, i) =>
    s + (i.invoice_diamonds ?? []).reduce((gs: number, g: any) => gs + (g.tl_xoan_gr ?? 0), 0), 0
  )
  const totGoldV  = items.reduce((s, i) => s + (i.tien_vang    ?? 0), 0)
  const totVonSX  = items.reduce((s, i) => s + (i.von_san_xuat ?? 0), 0)
  const totCif    = items.reduce((s, i) => s + (i.cif_price    ?? 0), 0)

  // Tiền vàng grouped by loại vàng (18KW, 18KY, 24K…)
  const goldByType = (() => {
    const m = new Map<string, number>()
    for (const i of items) {
      const t = String(i.loai_vang ?? '').trim() || '—'
      m.set(t, (m.get(t) ?? 0) + (i.tien_vang ?? 0))
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  })()

  return (
    <div>
      {/* Scrollable item list — keeps a long invoice from stretching the whole page */}
      <div style={{ maxHeight: '70vh', overflowY: 'auto', border: '1px solid var(--border-light)', padding: '0.75rem 0.75rem 0' }}>
        {items.map(item => (
          <ItemCard
            key={item.id}
            invoiceId={invoiceId}
            item={item}
            canSeePrice={canSeePrice}
            canEdit={canEdit}
            isLocked={isLocked}
            template={template as any}
            onRefresh={onRefresh}
            onItemUpdate={onItemUpdate}
          />
        ))}
      </div>

      {/* Invoice Total Summary */}
      <div style={{ marginTop: '1.5rem', background: '#e91d79', color: '#FAFAF7', padding: '1rem 1.25rem' }}>
        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)', marginBottom: '0.75rem' }}>
          Invoice Total — {items.length} items
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
          <TotalField label="Tổng Qty (pcs)" value={totQty} />
          <TotalField label="Tổng T.Phẩm (gr)" value={fmtGram(totWt)} mono />
          {totGemWt > 0 && <TotalField label="Σ TL Xoàn (ct)" value={fmt4(totGemWt * 5)} mono muted />}
          {canSeePrice && <TotalField label="Tổng Tiền vàng" value={fmt2(totGoldV)} mono />}
          {canSeePrice && <TotalField label="Tổng Vốn SX" value={fmt2(totVonSX)} mono bold />}
          {canSeePrice && template !== 'CH2' && <TotalField label="Tổng CIF" value={fmt2(totCif)} mono bold />}
        </div>

        {/* Tiền vàng phân theo loại vàng */}
        {canSeePrice && goldByType.length > 1 && (
          <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.25)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              Tiền vàng theo loại
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1.5rem' }}>
              {goldByType.map(([t, sum]) => (
                <span key={t} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
                  <b style={{ color: '#FFFFFF' }}>{t}</b>: {fmt2(sum)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sticky bottom summary bar */}
      {canSeePrice && items.length > 1 && (
        <div style={{ position: 'sticky', bottom: 0, zIndex: 50, background: '#1E40AF', color: '#fff', padding: '8px 16px', display: 'flex', justifyContent: 'center', gap: '2rem', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 600, boxShadow: '0 -2px 8px rgba(0,0,0,0.15)' }}>
          <span>{items.length} items</span>
          <span>Purchase: {fmt2(totVonSX)}</span>
          {template !== 'CH2' && <span>CIF: {fmt2(totCif)}</span>}
        </div>
      )}
    </div>
  )
}
