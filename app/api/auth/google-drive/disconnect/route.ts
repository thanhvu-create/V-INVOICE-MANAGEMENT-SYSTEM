/**
 * POST /api/auth/google-drive/disconnect
 * Revoke the stored Google grant AND clear the DB refresh token.
 *
 * Why both: the client "disconnect" only clears the localStorage access token. The
 * server-side export (getGoogleAccessToken) uses the DB refresh token, so unless the
 * stored grant is revoked, reconnecting does NOT mint a new refresh token — Google
 * returns none for an already-authorized app. Revoking makes the next connect a fresh
 * grant, so it comes back with the current full 'drive' scope.
 */
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'
import { decrypt } from '@/lib/encrypt.server'

export async function POST() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = createServiceClient()
    const { data: row } = await db
      .from('app_users')
      .select('google_refresh_token')
      .eq('id', ctx.userId)
      .single()

    if (row?.google_refresh_token) {
      try {
        const refreshToken = decrypt(row.google_refresh_token)
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: refreshToken }),
        })
      } catch { /* best-effort revoke — clearing the DB below is what matters */ }
    }

    await db.from('app_users').update({ google_refresh_token: null }).eq('id', ctx.userId)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
