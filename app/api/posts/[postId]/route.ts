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

  // Fetch all drafts ordered by version
  const { data: drafts } = await supabase
    .from('drafts')
    .select('*')
    .eq('post_id', postId)
    .order('version', { ascending: true })

  const originalDraft = drafts?.find((d: { is_original: boolean }) => d.is_original)
  // Latest non-original draft is the current working version
  const nonOriginals  = drafts?.filter((d: { is_original: boolean }) => !d.is_original) ?? []
  const currentDraft  = nonOriginals[nonOriginals.length - 1] ?? originalDraft

  return NextResponse.json({
    post,
    originalContent: originalDraft?.content ?? '',
    currentContent:  currentDraft?.content  ?? '',
    wordCount:       currentDraft?.word_count ?? 0,
    hashtags:        currentDraft?.hashtags  ?? [],
    // All non-original versions for the version picker
    versions: nonOriginals.map((d: { id: string; version: number; word_count: number; created_at: string }) => ({
      id:        d.id,
      version:   d.version,
      wordCount: d.word_count,
      createdAt: d.created_at,
    })),
    currentVersionId: currentDraft?.id ?? null,
  })
}
