// Edit permission guard for invoice write operations.

export interface EditGuardContext {
  isLocked:  boolean   // true when status === 'finalized'
  status:    string
  role:      string
  createdBy: string | null  // invoices.created_by (UUID), null for legacy rows
  userId:    string         // current user's app_users.id
}

/**
 * Returns an error message string if the operation is not permitted, or null if allowed.
 *
 * Usage in route handlers:
 *   const isLocked = invoice.status === 'finalized'
 *   const editError = checkEditPermission({
 *     isLocked,
 *     status:    invoice.status,
 *     role:      ctx.role,
 *     createdBy: invoice.created_by,
 *     userId:    ctx.userId,
 *   })
 */
export function checkEditPermission(ctx: EditGuardContext): string | null {
  if (ctx.role === 'viewer') {
    return 'Viewers cannot make changes.'
  }
  if (ctx.isLocked) {
    // manager and admin can edit finalized invoices directly
    if (ctx.role === 'manager' || ctx.role === 'admin') return null
    return 'Invoice is finalized. Only managers and admins can modify it.'
  }
  // draft: user role can only edit their own invoices
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
