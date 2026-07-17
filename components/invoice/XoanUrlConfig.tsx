'use client'

import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { useUser } from '@/contexts/UserContext'

const URL_KEY = 'xoan_sheet_url'
const TAB_KEY = 'xoan_sheet_tab'

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

  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const [open,     setOpen]     = useState(false)
  const [input,    setInput]    = useState('')
  const [saving,   setSaving]   = useState(false)

  // Fixed-tab (pin) state — replaces the pin control that used to live in XoanLookupPanel.
  // The tab list is loaded ONLY on demand ("Đổi tab") — downloading the multi-MB gem sheet
  // on every popover open was heavy and could hang; the pinned tab is already known.
  const [tabNames,    setTabNames]    = useState<string[]>([])
  const [pinnedTab,   setPinnedTab]   = useState<string | null>(null)
  const [selectedTab, setSelectedTab] = useState<string>('')
  const [showPicker,  setShowPicker]  = useState(false)
  const [loadingTabs, setLoadingTabs] = useState(false)
  const [pinning,     setPinning]     = useState(false)
  const [tabError,    setTabError]    = useState('')

  const wrapRef  = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    fetch(`/api/settings?key=${URL_KEY}`).then(r => r.json())
      .then(j => { if (j.success) setSavedUrl(j.value ?? null) }).catch(() => {})
    fetch(`/api/settings?key=${TAB_KEY}`).then(r => r.json())
      .then(j => { if (j.success && j.value) { setPinnedTab(j.value); setSelectedTab(j.value) } }).catch(() => {})
  }, [])

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  // Only relevant for gem templates — early return AFTER all hooks (rules-of-hooks safe).
  const hasGems = template === 'CH1' || template === 'CH2' || template === 'ADM'
  if (!hasGems) return null

  function handleOpen() {
    setInput(savedUrl ?? '')
    setShowPicker(false)   // always open in the compact view
    setTabError('')
    setOpen(v => !v)
  }

  // Explicit, one-shot tab-list load with a 30s timeout. NOT driven by an effect,
  // so a failure shows an error + retry instead of looping forever.
  async function loadTabs(url: string) {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    const timer = setTimeout(() => ac.abort(), 30_000)
    setLoadingTabs(true)
    setTabError('')
    try {
      const res = await fetch(`/api/proxy/sheets?url=${encodeURIComponent(url)}`, { signal: ac.signal })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      const wb = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: 'array', bookSheets: true })
      setTabNames(wb.SheetNames ?? [])
      setSelectedTab(prev => prev || (wb.SheetNames?.[0] ?? ''))
    } catch (e: any) {
      setTabError(e?.name === 'AbortError' ? 'Tải danh sách tab quá lâu — thử lại.' : String(e))
      setTabNames([])
    } finally {
      clearTimeout(timer)
      setLoadingTabs(false)
    }
  }

  function openPicker() {
    setShowPicker(true)
    if (savedUrl && tabNames.length === 0 && !loadingTabs) loadTabs(savedUrl)
  }

  async function handleSaveUrl() {
    const url = input.trim()
    if (!url) return
    setSaving(true)
    await fetch('/api/settings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: URL_KEY, value: url }),
    })
    setSavedUrl(url)
    setTabNames([])       // new URL → old tab list is stale
    setShowPicker(false)
    setSaving(false)
  }

  async function handlePinTab() {
    if (!selectedTab || pinning) return
    setPinning(true)
    try {
      await fetch('/api/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: TAB_KEY, value: selectedTab }),
      })
      setPinnedTab(selectedTab)
      setShowPicker(false)   // pinned → back to compact view
    } finally {
      setPinning(false)
    }
  }

  const configured = !!savedUrl
  const linkBtn: React.CSSProperties = {
    padding: '4px 10px', border: '1px solid var(--border-base)', background: 'transparent',
    cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
  }

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
          width: 380, background: 'var(--bg-surface)',
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
                onKeyDown={e => { if (e.key === 'Enter') handleSaveUrl(); if (e.key === 'Escape') setOpen(false) }}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  border: '1px solid var(--border-base)', background: 'var(--bg-base)',
                  padding: '5px 8px', fontFamily: 'var(--font-mono)', fontSize: 11,
                  color: 'var(--text-primary)', outline: 'none', marginBottom: '0.5rem',
                }}
              />
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginBottom: configured ? '0.75rem' : 0 }}>
                <button onClick={() => setOpen(false)} style={linkBtn}>Đóng</button>
                <button onClick={handleSaveUrl} disabled={saving || !input.trim()}
                  style={{ padding: '4px 14px', background: 'var(--text-primary)', color: 'var(--text-inverse)', border: 'none', cursor: saving || !input.trim() ? 'not-allowed' : 'pointer', opacity: saving || !input.trim() ? 0.6 : 1, fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                  {saving ? <i className="fa-solid fa-circle-notch fa-spin" /> : 'Lưu link'}
                </button>
              </div>

              {/* Fixed tab — compact by default; the list loads only when "Đổi tab" is clicked */}
              {configured && (
                <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '0.65rem' }}>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                    <i className="fa-solid fa-thumbtack" style={{ marginRight: 5, color: pinnedTab ? '#f59e0b' : 'var(--text-muted)' }} />
                    Tab cố định (auto tra hột)
                  </div>

                  {!showPicker ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                        {pinnedTab
                          ? <>Đang ghim: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{pinnedTab}</strong></>
                          : 'Chưa ghim — auto sẽ tự dò tab có cột "MO".'}
                      </div>
                      <button onClick={openPicker} style={{ ...linkBtn, flexShrink: 0 }}>
                        <i className="fa-solid fa-pen" style={{ marginRight: 4, fontSize: 10 }} />Đổi tab
                      </button>
                    </div>
                  ) : loadingTabs ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      <span style={{ flex: 1 }}><i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 5 }} />Đang tải danh sách tab…</span>
                      <button onClick={() => { abortRef.current?.abort(); setShowPicker(false) }} style={linkBtn}>Hủy</button>
                    </div>
                  ) : tabError ? (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>
                      {tabError}
                      <button onClick={() => savedUrl && loadTabs(savedUrl)} style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-info)', fontSize: 'var(--text-xs)', textDecoration: 'underline' }}>Thử lại</button>
                      <button onClick={() => setShowPicker(false)} style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', textDecoration: 'underline' }}>Đóng</button>
                    </div>
                  ) : tabNames.length > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <select
                        value={selectedTab}
                        onChange={e => setSelectedTab(e.target.value)}
                        style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', border: '1px solid var(--border-base)', background: 'var(--bg-base)', color: 'var(--text-primary)', padding: '4px 6px', cursor: 'pointer' }}
                      >
                        {tabNames.map(name => (
                          <option key={name} value={name}>{name}{name === pinnedTab ? ' ★' : ''}</option>
                        ))}
                      </select>
                      <button
                        onClick={handlePinTab}
                        disabled={pinning || !selectedTab || selectedTab === pinnedTab}
                        title={selectedTab === pinnedTab ? 'Tab này đang được ghim' : 'Ghim tab này làm tab cố định'}
                        style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid var(--border-base)', background: selectedTab === pinnedTab ? 'transparent' : 'var(--text-primary)', color: selectedTab === pinnedTab ? 'var(--text-muted)' : 'var(--text-inverse)', cursor: pinning || selectedTab === pinnedTab ? 'default' : 'pointer', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600 }}
                      >
                        {pinning
                          ? <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: 10 }} />
                          : <><i className="fa-solid fa-thumbtack" style={{ fontSize: 10 }} />{selectedTab === pinnedTab ? 'Đã ghim' : 'Ghim'}</>}
                      </button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      Không có tab nào.
                      <button onClick={() => savedUrl && loadTabs(savedUrl)} style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-info)', fontSize: 'var(--text-xs)', textDecoration: 'underline' }}>Thử lại</button>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
              {savedUrl
                ? <>
                    <i className="fa-solid fa-circle-check" style={{ color: '#34A853', marginRight: 5 }} />{shortUrl(savedUrl)}
                    <div style={{ marginTop: 6 }}>Tab: <strong style={{ color: 'var(--text-primary)' }}>{pinnedTab ?? '(tự dò)'}</strong></div>
                  </>
                : <span style={{ color: 'var(--color-warning)' }}>Chưa cấu hình — liên hệ admin</span>
              }
            </div>
          )}
        </div>
      )}
    </div>
  )
}
