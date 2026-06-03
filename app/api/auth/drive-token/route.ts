/**
 * GET /api/auth/drive-token
 * Dùng stored refresh_token để lấy access_token mới (silent refresh).
 */
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'
import { decrypt } from '@/lib/encrypt.server'

export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = createServiceClient()
    const { data: row } = await db
      .from('app_users')
      .select('google_refresh_token')
      .eq('id', ctx.userId)
      .single()

    if (!row?.google_refresh_token)
      return NextResponse.json({ error: 'No refresh token stored' }, { status: 404 })

    const refreshToken = decrypt(row.google_refresh_token)

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id:     process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type:    'refresh_token',
      }),
    })

    const tokenData = await tokenRes.json()
    if (!tokenRes.ok || !tokenData.access_token) {
      if (tokenData.error === 'invalid_grant') {
        await db.from('app_users').update({ google_refresh_token: null }).eq('id', ctx.userId)
        return NextResponse.json({ error: 'Refresh token revoked — reconnect Drive' }, { status: 401 })
      }
      return NextResponse.json({ error: 'Token refresh failed' }, { status: 502 })
    }

    return NextResponse.json({
      access_token: tokenData.access_token,
      expires_in:   tokenData.expires_in ?? 3600,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
