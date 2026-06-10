import { NextResponse } from 'next/server'

// bom_products table removed in new schema.
// Return empty for backward-compat (SKU lookup in import skips validation gracefully).
export async function GET() {
  return NextResponse.json({ success: true, data: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 } })
}

export async function POST() {
  return NextResponse.json({ success: false, message: 'Product catalog removed. Manage products directly on invoice items.' }, { status: 410 })
}
