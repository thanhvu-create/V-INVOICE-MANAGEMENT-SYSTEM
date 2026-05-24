import Link from 'next/link'

export default function UnauthorizedPage() {
  return (
    <div
      style={{
        minHeight:      '100vh',
        background:     'var(--bg-base)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        flexDirection:  'column',
        gap:            '1rem',
        textAlign:      'center',
        padding:        '2rem',
      }}
    >
      <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-3xl)', fontWeight: 400 }}>
        Access Denied
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)' }}>
        You don't have permission to view this page.
      </p>
      <Link
        href="/dashboard"
        style={{
          padding:        '0.5rem 1.5rem',
          border:         '1px solid var(--border-base)',
          color:          'var(--text-primary)',
          textDecoration: 'none',
          fontFamily:     'var(--font-body)',
          fontSize:       'var(--text-sm)',
          marginTop:      '0.5rem',
        }}
      >
        Go to Dashboard
      </Link>
    </div>
  )
}
