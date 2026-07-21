import { createServiceClient } from '@/lib/supabase/server'
import { recalcItem, recalcDiamond, recalcMetal, nvlFromInvoice, InvoiceTemplate } from './pricing'

type DB = ReturnType<typeof createServiceClient>

export async function triggerItemRecalc(db: DB, itemId: string, invoice: Record<string, any>) {
  const [{ data: item }, { data: diamonds }, { data: metals }] = await Promise.all([
    db.from('invoice_products').select('*').eq('id', itemId).single(),
    db.from('invoice_diamonds').select('*').eq('product_id', itemId),
    db.from('invoice_item_metals').select('*').eq('product_id', itemId).order('seq'),
  ])
  if (!item) return null

  const template = (invoice.template_type ?? 'CH1') as InvoiceTemplate
  const nvl = nvlFromInvoice(invoice)
  const gemList = diamonds ?? []

  const recalced = gemList.map(d => {
    const derived = recalcDiamond(d, template)
    return { ...d, ...derived, _update: derived }
  })

  if (recalced.length) {
    await Promise.all(recalced.map(g =>
      db.from('invoice_diamonds').update(g._update).eq('id', g.id)
    ))
  }

  const metalList = (metals ?? []).map(m => ({ ...m, ...recalcMetal(m, nvl) }))
  if (metalList.length) {
    await Promise.all(metalList.map(m =>
      db.from('invoice_item_metals').update({ tien_vang: m.tien_vang }).eq('id', m.id)
    ))
  }

  const cleanGems = recalced.map(({ _update, ...rest }) => rest)
  const updates = recalcItem(item, cleanGems as any, nvl, template, metalList as any)
  await db.from('invoice_products').update(updates).eq('id', itemId)

  return updates
}

export async function bulkRecalcInvoice(db: DB, invoiceId: string, invoice: Record<string, any>) {
  const { data: items } = await db
    .from('invoice_products')
    .select('*, invoice_diamonds(*), invoice_item_metals(*)')
    .eq('invoice_id', invoiceId)

  if (!items?.length) return

  const template = (invoice.template_type ?? 'CH1') as InvoiceTemplate
  const nvl = nvlFromInvoice(invoice)

  const ops: PromiseLike<any>[] = []
  for (const item of items) {
    const gems: any[] = item.invoice_diamonds ?? []

    const recalcedGems = gems.map(g => {
      const derived = recalcDiamond(g, template)
      ops.push(db.from('invoice_diamonds').update(derived).eq('id', g.id))
      return { ...g, ...derived }
    })

    const metals: any[] = (item.invoice_item_metals ?? []).slice().sort((a: any, b: any) => (a.seq ?? 0) - (b.seq ?? 0))
    const recalcedMetals = metals.map(m => {
      const derived = recalcMetal(m, nvl)
      ops.push(db.from('invoice_item_metals').update(derived).eq('id', m.id))
      return { ...m, ...derived }
    })

    const updates = recalcItem(item, recalcedGems, nvl, template, recalcedMetals as any)
    ops.push(db.from('invoice_products').update(updates).eq('id', item.id))
  }

  await Promise.all(ops)
}
