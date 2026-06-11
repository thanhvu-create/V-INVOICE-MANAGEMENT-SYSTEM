'use client'

import { useState, useEffect, useRef } from 'react'
import { useUser } from '@/contexts/UserContext'

const SETTINGS_KEY = 'xoan_sheet_url'

interface Props {
  template: string
}

function shortUrl(url: string) {
  try {
    const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{6,10})/)
    return m ? `…/${m[1]}…` : url.slice(0, 32) + '…'
  } catch { return url.slice(0, 32) + '…' }
}

export function XoanUrlConfig({ template }: Props) {
  const { canDo } = useUser()
  const canManage = canDo('manage_rates')

  // Only relevant for gem templates
  const hasGems = template === 'CH1' || template === 'CH2' || template === 'ADM'
  if (!hasGems) return null

  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const [open,     setOpen]     = useState(false)
  const [input,    setInput]    = useState('')
  const [saving,   setSaving]   = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/settings?key=${SETTINGS_KEY}`)
      .then(r => r.json())
      .then(j => { if (j.success) setSavedUrl(j.value ?? null) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  function handleOpen() {
    setInput(savedUrl ?? '')
    setOpen(v => !v)
  }

  async function handleSave() {
    const url = input.trim()
    if (!url) return
    setSaving(true)
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: SETTINGS_KEY, value: url }),
    })
    setSavedUrl(url)
    setSaving(false)
    setOpen(false)
  }

  const configured = !!savedUrl

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        onClick={handleOpen}
        title={configured ? savedUrl! : 'Chưa cấu hình link file hột'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '0.45rem 1rem',
          border: `1px solid ${configured ? 'var(--border-base)' : 'var(--color-warning)'}`,
          background: 'transparent',
          color: configured ? 'var(--text-primary)' : 'var(--color-warning)',
          fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)', cursor: 'pointer', borderRadius: 0,
        }}
      >
        <i className="fa-brands fa-google-drive" style={{ fontSize: 11, color: configured ? '#34A853' : 'var(--color-warning)' }} />
        Link Hột
        {configured
          ? <i className="fa-solid fa-circle-check" style={{ fontSize: 9, color: '#34A853' }} />
          : <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: 9 }} />
        }
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0,
          width: 360, background: 'var(--bg-surface)',
          border: '1px solid var(--border-base)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 9999, padding: '0.85rem 1rem',
        }}>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            <i className="fa-brands fa-google-drive" style={{ marginRight: 5, color: '#34A853' }} />
            Link TỔNG HỢP THEO DÕI XOÀN
          </div>

          {canManage ? (
            <>
              <input
                autoFocus
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setOpen(false) }}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  border: '1px solid var(--border-base)', background: 'var(--bg-base)',
                  padding: '5px 8px', fontFamily: 'var(--font-mono)', fontSize: 11,
                  color: 'var(--text-primary)', outline: 'none', marginBottom: '0.5rem',
                }}
              />
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button onClick={() => setOpen(false)}
                  style={{ padding: '4px 10px', border: '1px solid var(--border-base)', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                  Hủy
                </button>
                <button onClick={handleSave} disabled={saving || !input.trim()}
                  style={{ padding: '4px 14px', background: 'var(--text-primary)', color: 'var(--text-inverse)', border: 'none', cursor: saving || !input.trim() ? 'not-allowed' : 'pointer', opacity: saving || !input.trim() ? 0.6 : 1, fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                  {saving ? <i className="fa-solid fa-circle-notch fa-spin" /> : 'Lưu'}
                </button>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
              {savedUrl
                ? <><i className="fa-solid fa-circle-check" style={{ color: '#34A853', marginRight: 5 }} />{shortUrl(savedUrl)}</>
                : <span style={{ color: 'var(--color-warning)' }}>Chưa cấu hình — liên hệ admin</span>
              }
            </div>
          )}
        </div>
      )}
    </div>
  )
}
