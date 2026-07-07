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

  const [{ data: drafts }, { data: mediaRecords }, { data: liPost }, { data: refPostsRaw }] = await Promise.all([
    supabase.from('drafts').select('*').eq('post_id', postId).order('version', { ascending: true }),
    supabase.from('post_media').select('id, media_type, file_name, file_size, page_count, linkedin_caption, storage_path').eq('post_id', postId),
    supabase.from('linkedin_posts').select('linkedin_post_id, linkedin_url').eq('post_id', postId).maybeSingle(),
    supabase
      .from('posts')
      .select('id, day, pillar, weeks ( week_number, theme ), linkedin_posts ( linkedin_url ), story_log ( core_insight )')
      .in('status', ['published', 'approved', 'scheduled'])
      .neq('id', postId)
      .order('created_at', { ascending: false })
      .limit(12),
  ])

  type DraftRow = { id: string; is_original: boolean; is_approved: boolean; version: number; word_count: number; content: string; created_at: string }
  const originalDraft = drafts?.find((d: DraftRow) => d.is_original)
  const nonOriginals  = ((drafts?.filter((d: DraftRow) => !d.is_original)) ?? []) as DraftRow[]
  // Prefer the explicitly approved version; fall back to highest version number
  const approvedDraft = nonOriginals.find(d => d.is_approved)
  const currentDraft  = approvedDraft ?? nonOriginals[nonOriginals.length - 1] ?? originalDraft

  // Parse quote/caption suggestions — prefer the current (most recently generated) draft so
  // that regenerating post content immediately reflects in MediaPanel without requiring a
  // manual "Regen" click. Fall back to the original draft (never auto-saved, keeps all
  // metadata) for posts that have been edited and had metadata stripped.
  const originalContent = originalDraft?.content ?? ''
  const currentContent  = currentDraft?.content  ?? ''
  // Normalise lines so "**KEY:** value" parses the same as "KEY: value"
  const normLine = (l: string) => l.replace(/^\*+\s*/, '').replace(/\*+\s*:/g, ':')
  const findMeta = (content: string, key: string): string | null => {
    const line = content.split('\n').find((l: string) => normLine(l).startsWith(`${key}:`))
    if (!line) return null
    return normLine(line).slice(key.length + 1).replace(/^\*+\s*/, '').trim() || null
  }
  const getMetaField = (key: string): string | null =>
    findMeta(currentContent, key) ?? findMeta(originalContent, key)

  return NextResponse.json({
    post,
    originalContent,
    currentContent:  currentDraft?.content  ?? '',
    wordCount:       currentDraft?.word_count ?? 0,
    versions: nonOriginals.map(d => ({
      id:         d.id,
      version:    d.version,
      wordCount:  d.word_count,
      createdAt:  d.created_at,
      isApproved: d.is_approved ?? false,
      preview:    (d.content ?? '').slice(0, 300),
    })),
    currentVersionId: currentDraft?.id ?? null,
    media: mediaRecords ?? [],
    // Only pre-populate title from AI-generated ARTICLE_TITLE (available after generation).
    // hook_idea is the week-plan brief, not a title — showing it pre-generation is misleading.
    suggestedTitle:   getMetaField('ARTICLE_TITLE'),
    suggestedQuote:   getMetaField('QUOTE'),
    suggestedCaption: getMetaField('LINKEDIN_CAPTION'),
    linkedinUrl:      liPost?.linkedin_url ?? null,
    linkedinPostId:   liPost?.linkedin_post_id ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    referenceablePosts: (refPostsRaw ?? []).map((p: any) => {
      const weeks    = Array.isArray(p.weeks)          ? p.weeks[0]          : p.weeks
      const liP      = Array.isArray(p.linkedin_posts)  ? p.linkedin_posts[0]  : p.linkedin_posts
      const storyLog = Array.isArray(p.story_log)      ? p.story_log[0]      : p.story_log
      return {
        id:          p.id,
        day:         p.day,
        pillar:      p.pillar,
        weekNumber:  weeks?.week_number ?? 0,
        weekTheme:   weeks?.theme ?? null,
        coreInsight: storyLog?.core_insight ?? null,
        linkedinUrl: liP?.linkedin_url ?? null,
      }
    }),
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

  const updates: Record<string, string | null> = {}
  if (body.status) updates.status = body.status
  // Clear scheduled_at when reverting from scheduled state so the cron doesn't
  // accidentally pick it up and attempt a double-publish.
  if (body.status === 'approved') updates.scheduled_at = null

  const { data, error } = await supabase
    .from('posts')
    .update(updates)
    .eq('id', postId)
    .select('id, status')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ post: data })
}
