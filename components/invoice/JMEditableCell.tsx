'use client'

import { useEffect, useRef } from 'react'

const METAL_TYPES = ['24K','22K','18KW','18KY','18K','15K','14KY','14K','10K','PT950','PT','AG','PD']

interface Props {
  field:       string
  displayValue: string
  isEditing:   boolean
  editValue:   string
  isComputed?: boolean
  isSaving?:   boolean
  isLocked?:   boolean
  canEdit?:    boolean
  tdStyle?:    React.CSSProperties
  onStartEdit: () => void
  onChange:    (v: string) => void
  onCommit:    () => void
  onCancel:    () => void
}

export function JMEditableCell({
  field, displayValue, isEditing, editValue,
  isComputed, isSaving, isLocked, canEdit = true,
  tdStyle = {}, onStartEdit, onChange, onCommit, onCancel,
}: Props) {
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null)

  useEffect(() => {
    if (isEditing) inputRef.current?.focus()
  }, [isEditing])

  const canClick = !isComputed && !isLocked && canEdit

  if (isEditing) {
    const inputBase: React.CSSProperties = {
      width: '100%', border: 'none', borderBottom: '2px solid var(--border-strong)',
      background: 'var(--bg-surface)', padding: '2px 4px',
      fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
      color: 'var(--text-primary)', outline: 'none', minWidth: 60,
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter')  { e.preventDefault(); onCommit() }
      if (e.key === 'Escape') { e.preventDefault(); onCancel() }
    }

    if (field === 'metal_type') {
      return (
        <td style={{ ...tdStyle, padding: '2px 4px', background: 'var(--bg-surface)' }}>
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={editValue}
            onChange={e => onChange(e.target.value)}
            onBlur={onCommit}
            onKeyDown={handleKeyDown}
            style={{ ...inputBase, cursor: 'pointer' }}
          >
            <option value="">—</option>
            {METAL_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </td>
      )
    }

    const isNumber = ['qty_pcs', 'weight_total_gr', 'weight_gold_actual_gr',
      'labor_fee', 'casting_fee', 'design_fee', 'resin_fee', 'misc_fee'].includes(field)

    return (
      <td style={{ ...tdStyle, padding: '2px 4px', background: 'var(--bg-surface)' }}>
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type={isNumber ? 'number' : 'text'}
          step={field === 'qty_pcs' ? '1' : '0.0001'}
          min={isNumber ? '0' : undefined}
          value={editValue}
          onChange={e => onChange(e.target.value)}
          onBlur={onCommit}
          onKeyDown={handleKeyDown}
          style={inputBase}
        />
      </td>
    )
  }

  return (
    <td
      style={{
        ...tdStyle,
        cursor: canClick ? 'text' : 'default',
        opacity: isSaving ? 0.5 : 1,
        position: 'relative',
      }}
      onClick={canClick ? onStartEdit : undefined}
      title={canClick ? 'Click to edit' : undefined}
    >
      {isSaving && (
        <i className="fa-solid fa-circle-notch fa-spin"
          style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: 'var(--text-muted)' }}
        />
      )}
      {displayValue}
    </td>
  )
}
