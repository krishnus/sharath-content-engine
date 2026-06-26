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

  const [{ data: drafts }, { data: mediaRecords }] = await Promise.all([
    supabase.from('drafts').select('*').eq('post_id', postId).order('version', { ascending: true }),
    supabase.from('post_media').select('id, media_type, file_name, file_size, page_count, linkedin_caption, storage_path').eq('post_id', postId),
  ])

  const originalDraft = drafts?.find((d: { is_original: boolean }) => d.is_original)
  const nonOriginals  = drafts?.filter((d: { is_original: boolean }) => !d.is_original) ?? []
  const currentDraft  = nonOriginals[nonOriginals.length - 1] ?? originalDraft

  // Parse quote/caption suggestions from original draft (never auto-saved, keeps all metadata)
  const originalContent = originalDraft?.content ?? ''
  // Normalise lines so "**KEY:** value" parses the same as "KEY: value"
  const normLine = (l: string) => l.replace(/^\*+\s*/, '').replace(/\*+\s*:/g, ':')
  const getMetaField = (key: string): string | null => {
    const line = originalContent.split('\n').find((l: string) => normLine(l).startsWith(`${key}:`))
    if (!line) return null
    // Strip any trailing bold markers that appear after the colon (e.g. "**QUOTE:** text" → "text")
    return normLine(line).slice(key.length + 1).replace(/^\*+\s*/, '').trim() || null
  }

  return NextResponse.json({
    post,
    originalContent,
    currentContent:  currentDraft?.content  ?? '',
    wordCount:       currentDraft?.word_count ?? 0,
    hashtags:        currentDraft?.hashtags  ?? [],
    versions: nonOriginals.map((d: { id: string; version: number; word_count: number; created_at: string }) => ({
      id:        d.id,
      version:   d.version,
      wordCount: d.word_count,
      createdAt: d.created_at,
    })),
    currentVersionId: currentDraft?.id ?? null,
    media: mediaRecords ?? [],
    // Pre-computed suggestions for MediaPanel text fields.
    // ARTICLE_TITLE (AI-generated short title) takes priority; hook_idea (from week plan) second;
    // CORE_INSIGHT last (it's a long sentence summary, not a title — only used as last resort).
    suggestedTitle:   getMetaField('ARTICLE_TITLE')
      ?? ((post as Record<string, unknown>).hook_idea as string | null)
      ?? getMetaField('CORE_INSIGHT'),
    suggestedQuote:   getMetaField('QUOTE'),
    suggestedCaption: getMetaField('LINKEDIN_CAPTION'),
  })
}

// ── PATCH /api/posts/[postId] ─────────────────────────────────────────
// Allows resetting post status (e.g. published → approved for re-publishing).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { postId: string } }
) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { postId } = params
  const body = await req.json() as { status?: string }

  // Only allow specific safe status transitions
  const ALLOWED_STATUSES = ['approved', 'draft', 'edited']
  if (body.status && !ALLOWED_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: `Status '${body.status}' cannot be set via this endpoint` },
      { status: 400 }
    )
  }

  const updates: Record<string, string> = {}
  if (body.status) updates.status = body.status

  const { data, error } = await supabase
    .from('posts')
    .update(updates)
    .eq('id', postId)
    .select('id, status')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ post: data })
}
