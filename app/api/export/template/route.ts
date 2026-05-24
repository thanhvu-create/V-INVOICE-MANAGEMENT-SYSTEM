import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function GET() {
  const templateRow = {
    'Store': '', 'Location': '', 'SKU': '', 'SO/MO': '',
    'Vendor Model': '', 'Description': '', 'Qty': '',
    'Total Weight (g)': '', 'Gold Weight (g)': '',
    'Metal Type': '', 'Class': '', 'Sub Class': '',
  }

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet([templateRow])

  ws['!cols'] = [
    { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 12 },
    { wch: 16 }, { wch: 30 }, { wch: 6  }, { wch: 16 },
    { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Import Template')
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buffer, {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="vinvoice-import-template.xlsx"',
      'Cache-Control':       'public, max-age=86400',
    },
  })
}
