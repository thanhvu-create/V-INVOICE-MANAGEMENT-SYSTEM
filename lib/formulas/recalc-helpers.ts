import { createServiceClient } from '@/lib/supabase/server'
import { recalcItem, recalcDiamond, nvlFromInvoice, InvoiceTemplate } from './pricing'

type DB = ReturnType<typeof createServiceClient>

export async function triggerItemRecalc(db: DB, itemId: string, invoice: Record<string, any>) {
  const [{ data: item }, { data: diamonds }] = await Promise.all([
    db.from('invoice_products').select('*').eq('id', itemId).single(),
    db.from('invoice_diamonds').select('*').eq('product_id', itemId),
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

  const cleanGems = recalced.map(({ _update, ...rest }) => rest)
  const updates = recalcItem(item, cleanGems as any, nvl, template)
  await db.from('invoice_products').update(updates).eq('id', itemId)

  return updates
}

export async function bulkRecalcInvoice(db: DB, invoiceId: string, invoice: Record<string, any>) {
  const { data: items } = await db
    .from('invoice_products')
    .select('*, invoice_diamonds(*)')
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

    const updates = recalcItem(item, recalcedGems, nvl, template)
    ops.push(db.from('invoice_products').update(updates).eq('id', item.id))
  }

  await Promise.all(ops)
}
