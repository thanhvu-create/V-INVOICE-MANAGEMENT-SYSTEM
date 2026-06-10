import { NextResponse } from 'next/server'

// bom_products table removed in new schema.
export async function GET()    { return NextResponse.json({ success: false, message: 'Product catalog removed.' }, { status: 410 }) }
export async function PATCH()  { return NextResponse.json({ success: false, message: 'Product catalog removed.' }, { status: 410 }) }
export async function DELETE() { return NextResponse.json({ success: false, message: 'Product catalog removed.' }, { status: 410 }) }
