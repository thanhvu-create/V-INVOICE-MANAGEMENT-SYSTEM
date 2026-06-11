'use client'
/**
 * Google Drive OAuth token management.
 * Token lifecycle:
 *  - DriveAuthButton click → GIS initCodeClient popup (code flow)
 *  - Server exchanges code → access_token + refresh_token
 *  - refresh_token encrypted in DB (app_users.google_refresh_token)
 *  - access_token cached in localStorage ~55 min
 *  - On expiry → getTokenSilent() tries /api/auth/drive-token (server refresh)
 *  - If no refresh_token in DB → returns null → DriveAuthButton shows disconnected
 */

const LS_KEY = 'vinvoice_gdrive_token'
const LS_EXP = 'vinvoice_gdrive_token_exp'

let _token: string | null = null
let _tokenExpiry = 0
let _refreshing: Promise<string | null> | null = null
const _listeners: Set<() => void> = new Set()

function notifyListeners() {
  _listeners.forEach(fn => { try { fn() } catch {} })
}

export function onTokenChange(fn: () => void): () => void {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}

function loadCachedToken() {
  try {
    const t   = localStorage.getItem(LS_KEY)
    const exp = Number(localStorage.getItem(LS_EXP) ?? 0)
    if (t && exp > Date.now()) { _token = t; _tokenExpiry = exp }
  } catch {}
}

function saveToken(token: string, expiresIn: number) {
  _token = token
  _tokenExpiry = Date.now() + (expiresIn - 300) * 1000   // 5-min buffer
  try {
    localStorage.setItem(LS_KEY, token)
    localStorage.setItem(LS_EXP, String(_tokenExpiry))
  } catch {}
  notifyListeners()
}

export function clearToken() {
  _token = null
  _tokenExpiry = 0
  try {
    localStorage.removeItem(LS_KEY)
    localStorage.removeItem(LS_EXP)
  } catch {}
  notifyListeners()
}

export function isAuthenticated(): boolean {
  if (!_token) loadCachedToken()
  return !!_token && Date.now() < _tokenExpiry
}

async function refreshViaServer(): Promise<string | null> {
  if (_refreshing) return _refreshing
  _refreshing = (async () => {
    try {
      const res = await fetch('/api/auth/drive-token')
      if (!res.ok) return null
      const { access_token, expires_in } = await res.json()
      if (!access_token) return null
      saveToken(access_token, expires_in ?? 3600)
      return access_token
    } catch { return null }
    finally { _refreshing = null }
  })()
  return _refreshing
}

function clientIdOk(): boolean {
  const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  return !!id && !id.includes('your-google') && !id.includes('placeholder')
}

export function requestCodeWithConsent(): Promise<string | null> {
  if (!clientIdOk()) return Promise.resolve(null)
  const g = (window as any).google
  if (!g?.accounts?.oauth2) return Promise.resolve(null)

  return new Promise(resolve => {
    const client = g.accounts.oauth2.initCodeClient({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets',
      ux_mode: 'popup',
      callback: async (res: any) => {
        if (!res?.code) { resolve(null); return }
        try {
          const r = await fetch('/api/auth/google-drive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: res.code }),
          })
          if (!r.ok) { resolve(null); return }
          const { access_token, expires_in } = await r.json()
          if (access_token) {
            saveToken(access_token, expires_in ?? 3600)
            resolve(access_token)
          } else { resolve(null) }
        } catch { resolve(null) }
      },
      error_callback: () => { clearToken(); resolve(null) },
    })
    client.requestCode()
  })
}

export async function getTokenSilent(): Promise<string | null> {
  if (!_token) loadCachedToken()
  if (_token && Date.now() < _tokenExpiry) return _token
  return refreshViaServer()
}

export function getTokenWithConsent(): Promise<string | null> {
  return requestCodeWithConsent()
}

export async function fetchDriveBlob(fileId: string): Promise<string | null> {
  const token = await getTokenSilent()
  if (!token) return null
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (res.status === 401) { clearToken(); return null }
    if (!res.ok) return null
    return URL.createObjectURL(await res.blob())
  } catch { return null }
}
