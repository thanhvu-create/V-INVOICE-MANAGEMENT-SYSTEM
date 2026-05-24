'use client'

import { useRef, useState } from 'react'

interface Props {
  onFile: (file: File) => void
  disabled?: boolean
}

export function DropZone({ onFile, disabled }: Props) {
  const inputRef    = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (disabled) return
    const file = e.dataTransfer.files[0]
    if (file && isExcel(file)) onFile(file)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file && isExcel(file)) onFile(file)
    e.target.value = ''
  }

  function isExcel(f: File) {
    return f.name.match(/\.(xlsx|xls)$/i) !== null
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); if (!disabled) setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      style={{
        border:         `2px dashed ${dragOver ? 'var(--border-strong)' : 'var(--border-base)'}`,
        background:     dragOver ? 'var(--bg-hover)' : 'transparent',
        padding:        '3.5rem 2rem',
        textAlign:      'center',
        cursor:         disabled ? 'not-allowed' : 'pointer',
        transition:     'all 0.15s',
        opacity:        disabled ? 0.5 : 1,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleChange}
        style={{ display: 'none' }}
      />
      <i
        className="fa-solid fa-file-import"
        style={{ fontSize: 40, color: 'var(--text-muted)', display: 'block', marginBottom: '1rem' }}
      />
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
        Drag & drop Excel file here
      </p>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        or click to browse
      </p>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
        Accepts: .xlsx, .xls
      </p>
    </div>
  )
}
