import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/getRole'

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })

  const db = createServiceClient()
  const { data, error } = await db
    .from('class_subclass_rules')
    .select('*')
    .order('description_prefix')
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(ctx.role))
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const prefix    = body.description_prefix?.trim().toUpperCase()
  const cls       = body.class?.trim().toUpperCase()
  const subCls    = body.sub_class?.trim().toUpperCase()
  if (!prefix || !cls || !subCls)
    return NextResponse.json({ success: false, message: 'description_prefix, class, sub_class required' }, { status: 400 })

  const db = createServiceClient()
  const { data, error } = await db
    .from('class_subclass_rules')
    .insert({ description_prefix: prefix, class: cls, sub_class: subCls })
    .select().single()
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 409 })
  return NextResponse.json({ success: true, data })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(ctx.role))
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { id, ...rest } = body
  if (!id) return NextResponse.json({ success: false, message: 'id required' }, { status: 400 })

  const update: Record<string, string> = {}
  if (rest.description_prefix !== undefined) update.description_prefix = rest.description_prefix.trim().toUpperCase()
  if (rest.class      !== undefined) update.class      = rest.class.trim().toUpperCase()
  if (rest.sub_class  !== undefined) update.sub_class  = rest.sub_class.trim().toUpperCase()

  const db = createServiceClient()
  const { data, error } = await db
    .from('class_subclass_rules')
    .update(update)
    .eq('id', id)
    .select().single()
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

export async function DELETE(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(ctx.role))
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ success: false, message: 'id required' }, { status: 400 })

  const db = createServiceClient()
  const { error } = await db.from('class_subclass_rules').delete().eq('id', id)
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
