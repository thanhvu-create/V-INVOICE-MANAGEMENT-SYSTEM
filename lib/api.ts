import { toast, type ToastType } from '@/components/ui/Toast'

interface ApiCallOptions<T> {
  /** Toast message on success. Omit to show no success toast. */
  successMsg?: string
  successType?: ToastType
  /** Override error message instead of using json.message */
  errorMsg?: string
  /** Duration for the success toast in ms (default 3500) */
  successDuration?: number
  /** Called with parsed data on success, before the success toast */
  onSuccess?: (data: T) => void
}

/**
 * Wraps a fetch call with automatic toast feedback.
 *
 * Returns the parsed `data` field on success, or `null` on failure.
 * Error toast is always shown on failure (using json.message or errorMsg fallback).
 *
 * Usage:
 *   const data = await apiCall<InvoiceItem>(
 *     () => fetch(`/api/invoices/${id}/items`, { method: 'POST', ... }),
 *     { successMsg: 'Item added.' }
 *   )
 *   if (!data) return // toast already shown
 */
export async function apiCall<T = unknown>(
  fn: () => Promise<Response>,
  options: ApiCallOptions<T> = {}
): Promise<T | null> {
  const {
    successMsg,
    successType = 'success',
    errorMsg,
    successDuration,
    onSuccess,
  } = options

  try {
    const res  = await fn()
    const json = await res.json()

    if (!res.ok || !json.success) {
      toast(errorMsg ?? json.message ?? 'An error occurred.', 'error')
      return null
    }

    onSuccess?.(json.data as T)
    if (successMsg) toast(successMsg, successType, successDuration)
    return json.data as T

  } catch {
    toast(errorMsg ?? 'Network error. Please check your connection.', 'error')
    return null
  }
}
