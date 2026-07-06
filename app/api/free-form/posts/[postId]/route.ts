import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// GET /api/free-form/posts/[postId] — fetch post + all drafts + media
export async function GET(
  _req: NextRequest,
  { params }: { params: { postId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { postId } = params

  const [{ data: post, error: postError }, { data: drafts }, { data: media }, { data: liPost }] = await Promise.all([
    supabase.from('free_form_posts').select('*').eq('id', postId).single(),
    supabase.from('free_form_drafts').select('*').eq('post_id', postId).order('version', { ascending: true }),
    supabase.from('free_form_media').select('id, media_type, file_name, file_size, page_count, linkedin_caption, storage_path').eq('post_id', postId),
    supabase.from('free_form_linkedin_posts').select('linkedin_post_id, linkedin_url').eq('post_id', postId).maybeSingle(),
  ])

  if (postError || !post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  type DraftRow = { id: string; is_original: boolean; is_approved: boolean; version: number; word_count: number; content: string; created_at: string }
  const typedDrafts = (drafts ?? []) as DraftRow[]

  const originalDraft = typedDrafts.find(d => d.is_original)
  const nonOriginals  = typedDrafts.filter(d => !d.is_original)
  const approvedDraft = nonOriginals.find(d => d.is_approved)
  const currentDraft  = approvedDraft ?? nonOriginals[nonOriginals.length - 1] ?? originalDraft

  // Extract AI metadata from current + original content for MediaPanel pre-population
  const originalContent = originalDraft?.content ?? ''
  const currentContent  = currentDraft?.content  ?? ''
  const normLine = (l: string) => l.replace(/^\*+\s*/, '').replace(/\*+\s*:/g, ':')
  const findMeta = (content: string, key: string): string | null => {
    const line = content.split('\n').find(l => normLine(l).startsWith(`${key}:`))
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
    media: media ?? [],
    suggestedTitle:   getMetaField('ARTICLE_TITLE'),
    suggestedQuote:   getMetaField('QUOTE'),
    suggestedCaption: getMetaField('LINKEDIN_CAPTION'),
    linkedinUrl:      liPost?.linkedin_url ?? null,
    linkedinPostId:   liPost?.linkedin_post_id ?? null,
  })
}

// PATCH /api/free-form/posts/[postId] — update status
export async function PATCH(
  req: NextRequest,
  { params }: { params: { postId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { postId } = params
  const body = await req.json() as { status?: string }

  const ALLOWED = ['approved', 'draft', 'edited']
  if (body.status && !ALLOWED.includes(body.status)) {
    return NextResponse.json({ error: `Status '${body.status}' not allowed` }, { status: 400 })
  }

  const updates: Record<string, string | null> = {}
  if (body.status) updates.status = body.status
  if (body.status === 'approved') updates.scheduled_at = null

  const { data, error } = await supabase
    .from('free_form_posts')
    .update(updates)
    .eq('id', postId)
    .select('id, status')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ post: data })
}
