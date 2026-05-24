import { createClient } from '@supabase/supabase-js'

// Uses SERVICE_ROLE_KEY — for Supabase Auth admin operations only (createUser, deleteUser, etc.)
// NEVER import this in Client Components or expose to browser.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
