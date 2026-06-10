'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function MetalRatesRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/products') }, [router])
  return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Redirecting…</div>
}
