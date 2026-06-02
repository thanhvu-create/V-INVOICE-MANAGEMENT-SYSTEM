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
  onRefresh:    () => void
  onItemUpdate: (itemId: string, updatedItem: any) => void
}

export function DetailView({ invoiceId, items, canSeePrice, canEdit, isLocked, onRefresh, onItemUpdate }: Props) {
  if (items.length === 0) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-base)' }}>
        No items yet. Use <strong>Import</strong> or <strong>Add Item</strong> to get started.
      </div>
    )
  }

  const totQty   = items.reduce((s, i) => s + (i.qty_pcs ?? 0), 0)
  const totWt    = items.reduce((s, i) => s + (i.weight_total_gr ?? 0), 0)
  const totGemWt = items.reduce((s, i) =>
    s + (i.item_gem_details ?? []).reduce((gs: number, g: any) => gs + (g.weight_gr ?? 0), 0), 0
  )
  const totGoldV = items.reduce((s, i) => s + (i.gold_value_usd ?? 0), 0)
  const totHpusa = items.reduce((s, i) => s + (i.hpusa ?? 0), 0)
  const totCif   = items.reduce((s, i) => s + (i.cif_price ?? 0), 0)
  const totTag   = items.reduce((s, i) => s + (i.tag_price ?? 0), 0)

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
          <TotalField label="Total Qty (pcs)" value={totQty} />
          <TotalField label="Total Weight (gr)" value={fmt4(totWt)} mono />
          {totGemWt > 0 && <TotalField label="Σ TL Xoàn (gr)" value={fmt4(totGemWt)} mono muted />}
          {canSeePrice && <TotalField label="Total Gold Value" value={fmt2(totGoldV)} mono />}
          {canSeePrice && <TotalField label="Total HPUSA" value={fmt2(totHpusa)} mono bold />}
          {canSeePrice && <TotalField label="Total CIF" value={fmt2(totCif)} mono />}
          {canSeePrice && totTag > 0 && <TotalField label="Total Tag" value={fmt2(totTag)} mono />}
        </div>
      </div>
    </div>
  )
}
