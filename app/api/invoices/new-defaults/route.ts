import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'

export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

    const db    = createServiceClient()
    const today = new Date().toISOString().slice(0, 10)

    const [ratesRes, activeRuleRes] = await Promise.all([
      db.from('daily_metal_rates').select('id, rate_date, gold_18kw, gold_18ky, gold_14ky, platinum, silver').order('rate_date', { ascending: false }).limit(30),
      db.from('pricing_rules').select('id, name, is_active').order('created_at', { ascending: false }),
    ])

    const rates = ratesRes.data ?? []
    const rules = activeRuleRes.data ?? []

    const todayRate  = rates.find(r => r.rate_date === today)
    const defaultRate = todayRate ?? rates[0] ?? null
    const activeRule  = rules.find(r => r.is_active) ?? null

    return NextResponse.json({
      success: true,
      data: {
        defaultRateId: defaultRate?.id ?? null,
        defaultRuleId: activeRule?.id  ?? null,
        rates,
        rules,
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
