import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/getRole'

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({
    success: true,
    data: {
      id:       ctx.userId,
      authId:   ctx.authId,
      email:    ctx.email,
      fullName: ctx.fullName,
      role:     ctx.role,
    },
  })
}
