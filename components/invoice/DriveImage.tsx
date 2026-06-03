'use client'

import { useState, useEffect, useRef } from 'react'
import { getTokenSilent, clearToken, onTokenChange, isAuthenticated } from '@/lib/driveToken'
import { ModalPortal } from '@/components/ui/ModalPortal'

interface Props {
  url:   string | null | undefined
  alt:   string
  size?: number   // px, default 44
}

function extractFileId(url: string): string | null {
  if (!url?.trim()) return null
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]{10,})/,
    /[?&]id=([a-zA-Z0-9_-]{10,})/,
    /\/d\/([a-zA-Z0-9_-]{10,})/,
    /\/open\?id=([a-zA-Z0-9_-]{10,})/,
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) return m[1]
  }
  return null
}

function isDriveUrl(url: string): boolean {
  return url.includes('drive.google.com') || url.includes('docs.google.com')
}

type Status = 'idle' | 'loading' | 'ok' | 'no-auth' | 'error'

export function DriveImage({ url, alt, size = 44 }: Props) {
  const [status,  setStatus]  = useState<Status>('idle')
  const [imgSrc,  setImgSrc]  = useState<string | null>(null)
  const [lightbox, setLightbox] = useState(false)
  const prevSrc   = useRef<string | null>(null)
  const lastFid   = useRef('')

  useEffect(() => () => { if (prevSrc.current) URL.revokeObjectURL(prevSrc.current) }, [])

  function setImg(src: string | null) {
    if (prevSrc.current) URL.revokeObjectURL(prevSrc.current)
    prevSrc.current = src
    setImgSrc(src)
  }

  async function loadDrive(fid: string) {
    setStatus('loading')
    setImg(null)
    const token = await getTokenSilent()
    if (!token) {
      setStatus(isAuthenticated() ? 'error' : 'no-auth')
      return
    }
    try {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fid}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.status === 401) { clearToken(); setStatus('no-auth'); return }
      if (!res.ok) { setStatus('error'); return }
      setImg(URL.createObjectURL(await res.blob()))
      setStatus('ok')
    } catch { setStatus('error') }
  }

  useEffect(() => {
    if (!url) { setImg(null); setStatus('idle'); return }

    const fid = extractFileId(url)
    if (fid) {
      if (fid !== lastFid.current) {
        lastFid.current = fid
        loadDrive(fid)
      }
    } else {
      // Not a Drive URL — use directly
      setImg(url)
      setStatus('ok')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  // Auto-retry when Drive token becomes available (user clicks DriveAuthButton)
  useEffect(() => {
    return onTokenChange(() => {
      const fid = url ? extractFileId(url) : null
      if (fid && status !== 'ok' && status !== 'loading') {
        lastFid.current = fid
        loadDrive(fid)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, status])

  if (!url) return null

  const box: React.CSSProperties = {
    width: size, height: size, flexShrink: 0,
    border: '1px solid var(--border-light)',
    overflow: 'hidden',
    background: 'var(--bg-muted)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  }

  // Loading spinner
  if (status === 'loading') return (
    <div style={box} title="Loading image…">
      <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: 12, color: 'var(--text-muted)' }} />
    </div>
  )

  // No auth — lock icon with tooltip
  if (status === 'no-auth') return (
    <div style={{ ...box, cursor: 'help' }} title="Connect Google Drive (topbar) to view image">
      <i className="fa-solid fa-lock" style={{ fontSize: 11, color: 'var(--text-muted)' }} />
    </div>
  )

  // Load error
  if (status === 'error') return (
    <div style={{ ...box, cursor: 'help' }} title="Cannot load image">
      <i className="fa-solid fa-image-slash" style={{ fontSize: 11, color: 'var(--text-muted)' }} />
    </div>
  )

  // Loaded
  if (status === 'ok' && imgSrc) return (
    <>
      <div style={{ ...box, cursor: 'zoom-in' }} onClick={() => setLightbox(true)} title="Click to enlarge">
        <img
          src={imgSrc}
          alt={alt}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>

      {lightbox && (
        <ModalPortal>
          <div
            onClick={() => setLightbox(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 99999,
              background: 'rgba(10,8,6,0.92)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'zoom-out',
            }}
          >
            <img
              src={imgSrc} alt={alt}
              style={{ maxWidth: '92vw', maxHeight: '92vh', objectFit: 'contain' }}
              onClick={e => e.stopPropagation()}
            />
            <button
              onClick={() => setLightbox(false)}
              style={{
                position: 'absolute', top: 20, right: 20,
                background: 'rgba(255,255,255,0.12)', border: 'none',
                color: '#fff', fontSize: 20, cursor: 'pointer',
                width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '50%',
              }}
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        </ModalPortal>
      )}
    </>
  )

  return null
}
