import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}

const PUBLIC_ROUTES  = ['/login', '/api/auth/login', '/api/export/template']
const ADMIN_ROUTES   = ['/admin/users']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow public routes without auth check
  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) {
    return NextResponse.next()
  }

  const res = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => req.cookies.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value)
            res.cookies.set(name, value, options as any)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Not authenticated → redirect to login
  if (!user) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // For role-protected routes, check role from app_users
  if (ADMIN_ROUTES.some(r => pathname.startsWith(r))) {
    const { data: profile } = await createServiceClient()
      .from('app_users')
      .select('role, is_active')
      .eq('auth_id', user.id)
      .single()

    if (!profile?.is_active) {
      const loginUrl = req.nextUrl.clone()
      loginUrl.pathname = '/login'
      return NextResponse.redirect(loginUrl)
    }

    if (profile.role !== 'admin') {
      return NextResponse.redirect(new URL('/unauthorized', req.url))
    }
  }

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
