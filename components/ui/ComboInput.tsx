'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface Props {
  value:       string
  onChange:    (val: string) => void
  options:     string[]
  placeholder?: string
  style?:      React.CSSProperties
  uppercase?:  boolean
  id?:         string
}

export function ComboInput({ value, onChange, options, placeholder, style, uppercase = false, id }: Props) {
  const [open,      setOpen]      = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const wrapRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLUListElement>(null)

  const filtered = value.trim() === ''
    ? options
    : options.filter(o => o.toLowerCase().startsWith(value.toLowerCase()))

  // close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setHighlight(-1)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // scroll highlighted item into view
  useEffect(() => {
    if (highlight >= 0 && listRef.current) {
      const el = listRef.current.children[highlight] as HTMLElement
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlight])

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = uppercase ? e.target.value.toUpperCase() : e.target.value
    onChange(v)
    setOpen(true)
    setHighlight(-1)
  }

  function handleSelect(opt: string) {
    onChange(uppercase ? opt.toUpperCase() : opt)
    setOpen(false)
    setHighlight(-1)
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true); return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(h => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter' && highlight >= 0) {
      e.preventDefault()
      handleSelect(filtered[highlight])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setHighlight(-1)
    }
  }

  const base: React.CSSProperties = {
    width: '100%', border: '1px solid var(--border-base)', borderRadius: 0,
    background: 'var(--bg-surface)', padding: '6px 28px 6px 8px',
    fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <input
        ref={inputRef}
        id={id}
        value={value}
        onChange={handleInput}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        style={{ ...base, ...style }}
      />
      {/* chevron */}
      <span
        onMouseDown={e => { e.preventDefault(); setOpen(o => !o); inputRef.current?.focus() }}
        style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10, lineHeight: 1,
          userSelect: 'none', transition: 'transform 0.15s',
          display: 'inline-block', rotate: open ? '180deg' : '0deg',
        }}
      >▼</span>

      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          style={{
            position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 9999,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-base)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            margin: 0, padding: '4px 0',
            listStyle: 'none',
            maxHeight: 220, overflowY: 'auto',
            borderRadius: 2,
          }}
        >
          {filtered.map((opt, i) => (
            <li
              key={opt}
              onMouseDown={e => { e.preventDefault(); handleSelect(opt) }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                padding: '7px 12px',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-primary)',
                fontWeight: value && opt.toLowerCase() === value.toLowerCase() ? 700 : 400,
                background: i === highlight
                  ? 'var(--bg-hover, rgba(0,0,0,0.06))'
                  : opt.toLowerCase() === value.toLowerCase()
                    ? 'var(--sku-highlight-bg, #fef3c7)'
                    : 'transparent',
                letterSpacing: uppercase ? '0.04em' : undefined,
              }}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
