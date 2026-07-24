import { createServiceClient } from '@/lib/supabase/server'
import type { MetalTypeRule } from '@/lib/formulas/pricing'

type DB = ReturnType<typeof createServiceClient>

// Nạp các loại đặc biệt đang active để đưa vào pipeline định giá.
export async function loadActiveMetalTypes(db: DB): Promise<MetalTypeRule[]> {
  const { data } = await db
    .from('metal_types')
    .select('code, price_mode, base_kind, karat, surcharge_per_gram, fixed_per_gram, active')
    .eq('active', true)
  return (data ?? []) as MetalTypeRule[]
}
