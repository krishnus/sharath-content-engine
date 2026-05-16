import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  req: NextRequest,
  { params }: { params: { draftId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: draft } = await supabase
    .from('drafts')
    .select('id, content, word_count, version, is_original, created_at')
    .eq('id', params.draftId)
    .single()

  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

  return NextResponse.json(draft)
}
