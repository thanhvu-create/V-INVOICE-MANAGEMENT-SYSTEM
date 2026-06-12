import { createServiceClient } from '@/lib/supabase/server'

export type AuditAction =
  | 'created' | 'updated' | 'submitted' | 'finalized'
  | 'approved' | 'rejected' | 'invoiced' | 'nvl_synced'
  | 'items_imported' | 'item_added' | 'item_updated' | 'item_deleted'
  | 'discount_applied'

interface LogParams {
  invoiceId:   string
  userId:      string
  action:      AuditAction
  fromStatus?: string
  toStatus?:   string
  note?:       string
  metadata?:   Record<string, unknown>
}

export function writeAuditLog(params: LogParams): void {
  const db = createServiceClient()
  void db.from('audit_logs').insert({
    invoice_id:  params.invoiceId,
    user_id:     params.userId,
    action:      params.action,
    from_status: params.fromStatus ?? null,
    to_status:   params.toStatus  ?? null,
    note:        params.note      ?? null,
    metadata:    params.metadata  ?? {},
  }).then(null, console.error)
}
