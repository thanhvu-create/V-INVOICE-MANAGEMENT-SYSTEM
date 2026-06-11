import { createServiceClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/encrypt.server'

export async function getGoogleAccessToken(userId: string): Promise<string | null> {
  const db = createServiceClient()
  const { data: row } = await db
    .from('app_users')
    .select('google_refresh_token')
    .eq('id', userId)
    .single()

  if (!row?.google_refresh_token) return null

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
  if (tokenData.error) return null
  return tokenData.access_token ?? null
}
