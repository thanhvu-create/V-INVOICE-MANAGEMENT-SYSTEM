/**
 * POST /api/auth/google-drive
 * Nhận auth code từ GIS initCodeClient popup
 * → exchange lấy access_token + refresh_token
 * → encrypt + lưu refresh_token vào app_users.google_refresh_token
 */
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'
import { encrypt } from '@/lib/encrypt.server'

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { code } = await request.json()
    if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })

    // Exchange auth code → tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri:  'postmessage',
        grant_type:    'authorization_code',
      }),
    })

    const tokenData = await tokenRes.json()
    if (!tokenRes.ok || !tokenData.access_token) {
      return NextResponse.json({
        error: tokenData.error || 'token_exchange_failed',
        detail: tokenData.error_description || '',
      }, { status: 502 })
    }

    const { access_token, refresh_token, expires_in } = tokenData

    // Lưu refresh_token encrypted (chỉ khi Google trả về — lần đầu connect hoặc prompt=consent)
    if (refresh_token) {
      const db = createServiceClient()
      const encrypted = encrypt(refresh_token)
      await db.from('app_users').update({ google_refresh_token: encrypted }).eq('id', ctx.userId)
    }

    return NextResponse.json({ access_token, expires_in: expires_in ?? 3600 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
