import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  req: NextRequest,
  { params }: { params: { postId: string } }
) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { postId } = params

  // Fetch the post with its week data
  const { data: post, error: postError } = await supabase
    .from('posts')
    .select(`
      *,
      weeks (
        id,
        theme,
        quarter,
        open_thread,
        week_number,
        week_start
      )
    `)
    .eq('id', postId)
    .single()

  if (postError || !post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  // Fetch existing drafts (original + current)
  const { data: drafts } = await supabase
    .from('drafts')
    .select('*')
    .eq('post_id', postId)
    .order('version', { ascending: true })

  const originalDraft = drafts?.find(d => d.is_original)
  const currentDraft  = drafts?.find(d => !d.is_original) ?? originalDraft

  return NextResponse.json({
    post,
    originalContent: originalDraft?.content ?? '',
    currentContent:  currentDraft?.content  ?? '',
    wordCount:       currentDraft?.word_count ?? 0,
  })
}
