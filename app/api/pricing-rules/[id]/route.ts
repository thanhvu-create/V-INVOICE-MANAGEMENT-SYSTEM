import { NextResponse } from 'next/server'

// pricing_rules table removed in new schema.
export async function PATCH()  { return NextResponse.json({ success: false, message: 'Pricing rules removed.' }, { status: 410 }) }
export async function DELETE() { return NextResponse.json({ success: false, message: 'Pricing rules removed.' }, { status: 410 }) }
