// Edit permission guard for invoice write operations.
// Call this in every PATCH/POST/DELETE route that mutates invoice data.
// See invoice-workflow.md §3b for the full spec and HTTP error message table.

export interface EditGuardContext {
  isLocked:  boolean
  status:    string
  role:      string
  createdBy: string | null  // invoice_headers.created_by_user_id (UUID), null for legacy rows
  userId:    string         // current user's app_users.id
}

/**
 * Returns an error message string if the operation is not permitted, or null if allowed.
 *
 * Usage in route handlers:
 *   const { data: header } = await db
 *     .from('invoice_headers')
 *     .select('is_locked, status, created_by_user_id')
 *     .eq('id', params.id)
 *     .single()
 *
 *   const editError = checkEditPermission({
 *     isLocked:  header.is_locked,
 *     status:    header.status,
 *     role:      ctx.role,
 *     createdBy: header.created_by_user_id,
 *     userId:    ctx.userId,
 *   })
 *   if (editError) return NextResponse.json({ success: false, message: editError }, { status: 403 })
 */
export function checkEditPermission(ctx: EditGuardContext): string | null {
  // 1. invoiced — trigger set is_locked, nothing can change
  if (ctx.isLocked) {
    return 'Invoice is locked (invoiced). No changes allowed.'
  }

  // 2. viewer — zero write access
  if (ctx.role === 'viewer') {
    return 'Viewers cannot make changes.'
  }

  // 3. approved — nobody edits (not even admin); must be returned to pending first
  if (ctx.status === 'approved') {
    return 'Invoice is approved and cannot be modified. Ask a manager to return it to pending.'
  }

  // 4. pending_approval — only manager/admin can edit
  if (ctx.status === 'pending_approval' && ctx.role === 'user') {
    return 'Invoice is pending approval. Only managers and admins can make changes.'
  }

  // 5. draft — user role can only edit their own invoices
  //    createdBy null = legacy row (no UUID stored yet) → skip ownership check
  if (
    ctx.status === 'draft' &&
    ctx.role === 'user' &&
    ctx.createdBy !== null &&
    ctx.createdBy !== ctx.userId
  ) {
    return 'You can only edit your own draft invoices.'
  }

  return null
}
