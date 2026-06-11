import { NextRequest, NextResponse } from 'next/server'

function buildExportUrl(url: string): string {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  if (!m) throw new Error('Không đọc được Sheet ID từ URL')
  const id = m[1]
  const gidMatch = url.match(/[#&?]gid=(\d+)/)
  const gid = gidMatch ? gidMatch[1] : '0'
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx&gid=${gid}`
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })
  if (!url.includes('docs.google.com/spreadsheets')) {
    return NextResponse.json({ error: 'URL phải là Google Sheets' }, { status: 400 })
  }

  let exportUrl: string
  try {
    exportUrl = buildExportUrl(url)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 })
  }

  const res = await fetch(exportUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) {
    return NextResponse.json(
      { error: `Google trả về ${res.status} — kiểm tra lại quyền share file` },
      { status: 502 }
    )
  }

  const buf = await res.arrayBuffer()
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="sheet.xlsx"',
    },
  })
}
