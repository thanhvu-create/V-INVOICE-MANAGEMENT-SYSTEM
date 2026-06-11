import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'
import { decrypt } from '@/lib/encrypt.server'

function buildExportUrl(url: string): string {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  if (!m) throw new Error('Không đọc được Sheet ID từ URL')
  const id = m[1]
  const gidMatch = url.match(/[#&?]gid=(\d+)/)
  const gid = gidMatch ? gidMatch[1] : '0'
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx&gid=${gid}`
}

async function getAccessToken(userId: string): Promise<string | null> {
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
  return tokenData.access_token ?? null
}

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })
  if (!url.includes('docs.google.com/spreadsheets'))
    return NextResponse.json({ error: 'URL phải là Google Sheets' }, { status: 400 })

  let exportUrl: string
  try {
    exportUrl = buildExportUrl(url)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 })
  }

  // Try with Google Drive access token first (for org-restricted sheets)
  const accessToken = await getAccessToken(ctx.userId)
  const headers: Record<string, string> = { 'User-Agent': 'Mozilla/5.0' }
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`

  const res = await fetch(exportUrl, { headers })

  if (!res.ok) {
    // If authenticated fetch still fails, give a clear message
    const hint = accessToken
      ? `Google trả về ${res.status} — kiểm tra file có được share với tài khoản này không`
      : `Google trả về ${res.status} — tài khoản chưa kết nối Google Drive (vào Settings để kết nối)`
    return NextResponse.json({ error: hint }, { status: 502 })
  }

  const buf = await res.arrayBuffer()
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="sheet.xlsx"',
    },
  })
}
