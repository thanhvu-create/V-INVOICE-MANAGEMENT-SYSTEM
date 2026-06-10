'use client'

import { ItemCard } from './ItemCard'

function fmt2(n: number | null | undefined) { return n != null ? `$${n.toFixed(2)}` : '—' }
function fmt4(n: number | null | undefined) { return n != null ? n.toFixed(4) : '—' }

function TotalField({ label, value, mono, bold, muted }: { label: string; value: any; mono?: boolean; bold?: boolean; muted?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: bold ? 700 : 400, color: muted ? 'var(--text-muted)' : 'var(--text-primary)' }}>
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

  return (
    <div>
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

      {/* Invoice Total Summary */}
      <div style={{ marginTop: '1.5rem', border: '2px solid var(--border-strong)', background: 'var(--bg-base)', padding: '1rem 1.25rem' }}>
        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          Invoice Total
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
          <TotalField label="Tổng Qty (pcs)" value={totQty} />
          <TotalField label="Tổng T.Phẩm (gr)" value={fmt4(totWt)} mono />
          {totGemWt > 0 && <TotalField label="Σ TL Xoàn (gr)" value={fmt4(totGemWt)} mono muted />}
          {canSeePrice && <TotalField label="Tổng Tiền vàng" value={fmt2(totGoldV)} mono />}
          {canSeePrice && <TotalField label="Tổng Vốn SX" value={fmt2(totVonSX)} mono bold />}
          {canSeePrice && template !== 'CH2' && <TotalField label="Tổng CIF" value={fmt2(totCif)} mono />}
        </div>
      </div>
    </div>
  )
}
