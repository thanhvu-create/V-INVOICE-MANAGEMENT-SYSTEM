'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res  = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      })
      const json = await res.json()

      if (!json.success) {
        setError(json.message || 'Login failed. Check your credentials.')
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width:         '100%',
    padding:       '0.6rem 0',
    border:        'none',
    borderBottom:  '1px solid var(--border-base)',
    background:    'transparent',
    fontSize:      'var(--text-base)',
    color:         'var(--text-primary)',
    fontFamily:    'var(--font-body)',
    outline:       'none',
    transition:    'border-color 0.18s ease-out',
  }

  return (
    <div
      style={{
        minHeight:      '100vh',
        background:     'var(--bg-base)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '2rem',
      }}
    >
      <div
        style={{
          width:      '100%',
          maxWidth:   380,
          background: 'var(--bg-surface)',
          border:     '1px solid var(--border-base)',
          padding:    '3rem 2.5rem',
          animation:  'slideUpFade 0.3s ease-out both',
        }}
      >
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h1
            style={{
              fontFamily:    'var(--font-heading)',
              fontSize:      'var(--text-3xl)',
              fontWeight:    400,
              color:         'var(--text-primary)',
              letterSpacing: '0.05em',
              marginBottom:  '0.25rem',
            }}
          >
            V-Invoice
          </h1>
          <p
            style={{
              fontFamily:    'var(--font-body)',
              fontSize:      'var(--text-xs)',
              fontWeight:    600,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color:         'var(--text-muted)',
            }}
          >
            HP Jewelry Management
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div style={{ marginBottom: '1.75rem' }}>
            <label
              style={{
                display:       'block',
                fontFamily:    'var(--font-body)',
                fontSize:      'var(--text-xs)',
                fontWeight:    600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color:         'var(--text-secondary)',
                marginBottom:  '0.4rem',
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
              style={inputStyle}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: '2rem' }}>
            <label
              style={{
                display:       'block',
                fontFamily:    'var(--font-body)',
                fontSize:      'var(--text-xs)',
                fontWeight:    600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color:         'var(--text-secondary)',
                marginBottom:  '0.4rem',
              }}
            >
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={{ ...inputStyle, paddingRight: '2rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                style={{
                  position:   'absolute',
                  right:      0,
                  top:        '50%',
                  transform:  'translateY(-50%)',
                  background: 'none',
                  border:     'none',
                  cursor:     'pointer',
                  color:      'var(--text-muted)',
                  padding:    '4px',
                }}
              >
                <i className={`fa-solid ${showPw ? 'fa-eye-slash' : 'fa-eye'}`} style={{ fontSize: 13 }} />
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p
              style={{
                color:        'var(--color-danger)',
                fontSize:     'var(--text-sm)',
                marginBottom: '1rem',
                fontFamily:   'var(--font-body)',
              }}
            >
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width:         '100%',
              padding:       '0.75rem',
              background:    loading ? 'var(--text-muted)' : 'var(--text-primary)',
              color:         'var(--text-inverse)',
              border:        'none',
              fontFamily:    'var(--font-body)',
              fontSize:      'var(--text-sm)',
              fontWeight:    600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor:        loading ? 'wait' : 'pointer',
              borderRadius:  0,
              transition:    'background 0.15s',
            }}
          >
            {loading
              ? <><i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 8 }} />Signing in...</>
              : 'Sign In'
            }
          </button>
        </form>
      </div>
    </div>
  )
}
