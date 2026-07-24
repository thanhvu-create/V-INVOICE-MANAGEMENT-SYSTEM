import { createServiceClient } from '@/lib/supabase/server'
import type { MetalTypeRule } from '@/lib/formulas/pricing'

type DB = ReturnType<typeof createServiceClient>

// Nạp các loại đặc biệt đang active để đưa vào pipeline định giá.
export async function loadActiveMetalTypes(db: DB): Promise<MetalTypeRule[]> {
  const { data, error } = await db
    .from('metal_types')
    .select('code, price_mode, base_kind, karat, surcharge_per_gram, fixed_per_gram, active')
    .eq('active', true)
  // Nếu bảng thiếu / lỗi tạm thời → registry rỗng, mã ngoại lệ (SV925...) rơi về $0 âm thầm.
  // Log để không che mất chính lỗi mà tính năng này sinh ra để chống.
  if (error) console.error('[metal-types] loadActiveMetalTypes failed:', error.message)
  return (data ?? []) as MetalTypeRule[]
}
