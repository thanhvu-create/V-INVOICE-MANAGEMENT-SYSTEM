import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'

const BASE = ['18KY', '18KW', '18KR', '18KG', '22KY', '22KW', '24K', '14KY', '14KW', '14KR', '10KY', '10KW', 'PT950', 'PT850', 'AG', 'PD']

// Returns merged list: BASE types + distinct loai_vang used in existing items
export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

  const db = createServiceClient()
  const { data } = await db
    .from('invoice_products')
    .select('loai_vang')
    .not('loai_vang', 'is', null)
    .not('loai_vang', 'eq', '')

  const used: string[] = []
  if (data) {
    data.forEach((r: any) => {
      const v = r.loai_vang?.trim().toUpperCase()
      if (v && !used.includes(v)) used.push(v)
    })
  }

  const { data: mtData } = await db
    .from('metal_types')
    .select('code')
    .eq('active', true)
  const registryCodes: string[] = (mtData ?? [])
    .map((r: any) => r.code?.trim().toUpperCase())
    .filter(Boolean)

  const merged = [...BASE]
  registryCodes.forEach(v => { if (!merged.includes(v)) merged.push(v) })
  used.forEach(v => { if (!merged.includes(v)) merged.push(v) })

  return NextResponse.json({ success: true, data: merged })
}
