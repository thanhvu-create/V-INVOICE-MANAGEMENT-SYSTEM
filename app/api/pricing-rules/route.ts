import { NextResponse } from 'next/server'

// pricing_rules table removed in new schema — pricing is template-based.
export async function GET() {
  return NextResponse.json({ success: true, data: [] })
}

export async function POST() {
  return NextResponse.json({ success: false, message: 'Pricing rules removed. Pricing is template-based in the new schema.' }, { status: 410 })
}
