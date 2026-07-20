'use client'

import { useState, useEffect, useRef } from 'react'
import { isAuthenticated, getTokenSilent, getTokenWithConsent, clearToken, onTokenChange } from '@/lib/driveToken'

/**
 * Compact Drive auth button for the topbar.
 * Renders null if NEXT_PUBLIC_GOOGLE_CLIENT_ID is not configured.
 * Connected:    [G ● Drive]  green dot
 * Disconnected: [G ○ Drive]  grey dot
 */
export function DriveAuthButton() {
  const [connected,   setConnected]   = useState(false)
  const [hasClientId, setHasClientId] = useState(false)
  const [loading,     setLoading]     = useState(false)
  const manualDisconnect = useRef(false)
  const prevConnected    = useRef(false)

  useEffect(() => {
    const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    setHasClientId(!!id && !id.includes('your-google') && !id.includes('placeholder'))

    const initial = isAuthenticated()
    setConnected(initial)
    prevConnected.current = initial
    if (!initial) {
      getTokenSilent().then(token => {
        if (token) { setConnected(true); prevConnected.current = true }
      })
    }

    return onTokenChange(() => {
      const now = isAuthenticated()
      setConnected(now)
      prevConnected.current = now
      manualDisconnect.current = false
    })
  }, [])

  if (!hasClientId) return null

  async function handleClick() {
    if (connected) {
      manualDisconnect.current = true
      // Revoke + clear the DB refresh token too — clearing localStorage alone leaves the
      // server using the old (possibly short-scoped) token on export. Best-effort.
      try { await fetch('/api/auth/google-drive/disconnect', { method: 'POST' }) } catch {}
      clearToken()
      return
    }
    setLoading(true)
    try { await getTokenWithConsent() }
    finally { setLoading(false) }
  }

  const color = connected ? 'var(--color-success)' : 'var(--text-muted)'

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title={connected ? 'Google Drive connected — click to disconnect' : 'Connect Google Drive to load product images'}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '4px 10px',
        border: '1px solid var(--border-base)', borderRadius: 0,
        background: 'transparent',
        fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
        fontWeight: 500, letterSpacing: '0.06em',
        color, cursor: loading ? 'wait' : 'pointer',
        opacity: loading ? 0.6 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 11, fontFamily: 'Arial, sans-serif', color }}>G</span>
      {loading
        ? <i className="fa-solid fa-circle-notch" style={{ fontSize: 7, animation: 'driveSpn 0.9s linear infinite' }} />
        : <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      }
      <span>Drive</span>
      <style>{`@keyframes driveSpn { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </button>
  )
}
