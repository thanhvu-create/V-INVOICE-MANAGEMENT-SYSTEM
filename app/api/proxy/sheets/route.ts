import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/getRole'
import { getGoogleAccessToken } from '@/lib/google/getAccessToken'

function buildExportUrl(url: string): string {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  if (!m) throw new Error('Không đọc được Sheet ID từ URL')
  const id = m[1]
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`
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
  const accessToken = await getGoogleAccessToken(ctx.userId)
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
