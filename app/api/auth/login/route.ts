import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ success: false, message: 'Email and password required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError || !authData.user) {
      return NextResponse.json(
        { success: false, message: 'Invalid email or password' },
        { status: 401 }
      )
    }

    // Look up app profile
    const db = createServiceClient()
    const { data: profile } = await db
      .from('app_users')
      .select('id, email, full_name, role, is_active')
      .eq('auth_id', authData.user.id)
      .single()

    if (!profile || !profile.is_active) {
      await supabase.auth.signOut()
      return NextResponse.json(
        { success: false, message: 'Account is inactive. Contact your administrator.' },
        { status: 403 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        id:       profile.id,
        email:    profile.email,
        fullName: profile.full_name,
        role:     profile.role,
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
