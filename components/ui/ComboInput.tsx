'use client'

import { useState, useRef, useEffect } from 'react'

interface Props {
  value:        string
  onChange:     (val: string) => void
  options:      string[]
  placeholder?: string
  /** Outer wrapper style — controls border, background, size (NOT padding/overflow) */
  style?:       React.CSSProperties
  uppercase?:   boolean
  id?:          string
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
        setOpen(false); setHighlight(-1)
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
    onChange(v); setOpen(true); setHighlight(-1)
  }

  function handleSelect(opt: string) {
    onChange(uppercase ? opt.toUpperCase() : opt)
    setOpen(false); setHighlight(-1)
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { setOpen(true); return }
    if (e.key === 'ArrowDown')   { e.preventDefault(); setHighlight(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp')  { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter' && highlight >= 0) { e.preventDefault(); handleSelect(filtered[highlight]) }
    else if (e.key === 'Escape') { setOpen(false); setHighlight(-1) }
  }

  // Wrapper inherits visual style (border, bg, font-size, color) from consumer.
  // We strip out any padding/overflow from consumer style to keep layout clean.
  const { padding, overflow, ...wrapperStyle } = (style ?? {}) as any

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'relative', width: '100%', boxSizing: 'border-box',
        border: '1px solid var(--border-base)',
        background: 'var(--bg-surface)',
        display: 'flex', alignItems: 'center',
        ...wrapperStyle,
        // always override these on wrapper
        padding: 0,
      }}
    >
      {/* actual input — borderless, fills wrapper */}
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
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          padding: '6px 28px 6px 8px',
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-primary)',
          width: '100%',
          boxSizing: 'border-box',
          minWidth: 0,
        }}
      />

      {/* chevron button */}
      <span
        onMouseDown={e => { e.preventDefault(); setOpen(o => !o); inputRef.current?.focus() }}
        style={{
          position: 'absolute', right: 8, top: '50%',
          transform: `translateY(-50%) rotate(${open ? '180deg' : '0deg'})`,
          color: 'var(--text-muted)', cursor: 'pointer',
          fontSize: 9, lineHeight: 1, userSelect: 'none',
          transition: 'transform 0.15s ease',
          pointerEvents: 'auto',
        }}
      >▼</span>

      {/* dropdown */}
      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 3px)',
            left: -1,           // align with wrapper border
            minWidth: 'calc(100% + 2px)',
            zIndex: 99999,      // above modal overlay (9999)
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-base)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.14), 0 2px 6px rgba(0,0,0,0.08)',
            margin: 0,
            padding: '4px 0',
            listStyle: 'none',
            maxHeight: 220,
            overflowY: 'auto',
            borderRadius: 2,
          }}
        >
          {filtered.map((opt, i) => {
            const isMatch   = opt.toLowerCase() === value.toLowerCase()
            const isHover   = i === highlight
            return (
              <li
                key={opt}
                onMouseDown={e => { e.preventDefault(); handleSelect(opt) }}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  padding: '7px 14px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-sm)',
                  letterSpacing: uppercase ? '0.04em' : undefined,
                  fontWeight: isMatch ? 700 : 400,
                  color: isHover ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: isHover
                    ? 'var(--bg-base, #f5f3ef)'
                    : isMatch
                      ? 'var(--sku-highlight-bg, #fef3c7)'
                      : 'transparent',
                  transition: 'background 0.08s',
                  borderLeft: isHover ? '2px solid var(--text-primary)' : '2px solid transparent',
                }}
              >
                {opt}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
