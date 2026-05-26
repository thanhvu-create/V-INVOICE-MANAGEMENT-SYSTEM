'use client'

import { ItemCard } from './ItemCard'

interface Props {
  invoiceId:   string
  items:       any[]
  canSeePrice: boolean
  canEdit:     boolean
  isLocked:    boolean
  onRefresh:   () => void
}

export function DetailView({ invoiceId, items, canSeePrice, canEdit, isLocked, onRefresh }: Props) {
  if (items.length === 0) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-base)' }}>
        No items yet. Use <strong>Import</strong> or <strong>Add Item</strong> to get started.
      </div>
    )
  }

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
        />
      ))}
    </div>
  )
}
