import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: { draftId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data, error } = await supabase
    .from('free_form_drafts')
    .select('id, content, word_count, version, created_at')
    .eq('id', params.draftId)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  return NextResponse.json(data)
}
