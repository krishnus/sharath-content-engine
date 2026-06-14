import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// LinkedIn /rest/posts hard limit. We target 2900 to leave room for the suffix.
const LI_MAX_CHARS = 3000
const LI_SAFE_CHARS = 2900

export async function POST(req: NextRequest) {
  const isCron = req.headers.get('x-cron-secret') === process.env.CRON_SECRET
  const supabase = isCron ? createServiceClient() : createClient()

  let userId: string | null = null
  if (!isCron) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    userId = user.id
  }

  const { postId, publishNow, scheduledAt, preview, promotePreview, linkedinPostId } =
    await req.json() as {
      postId: string
      publishNow: boolean
      scheduledAt?: string
      preview?: boolean
      promotePreview?: boolean
      linkedinPostId?: string
    }

  // ── Fetch post + draft ──────────────────────────────────────────
  const { data: post, error: postError } = await supabase
    .from('posts')
    .select(`
      id, day, status, week_id,
      drafts ( id, content, linkedin_excerpt, is_original, version ),
      weeks ( id, week_start )
    `)
    .eq('id', postId)
    .single()

  if (postError || !post) {
    console.error('[publish] Post fetch error:', postError)
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  if (!preview && !promotePreview) {
    if (post.status !== 'approved' && post.status !== 'scheduled' && post.status !== 'published') {
      return NextResponse.json(
        { error: `Post must be approved before publishing (current status: ${post.status})` },
        { status: 400 }
      )
    }
  }

  // Pick the most recent edited draft; fall back to original
  const drafts = (post.drafts as Array<{
    id: string
    content: string
    linkedin_excerpt: string | null
    is_original: boolean
    version: number
  }>)

  const currentDraft = drafts
    ?.filter(d => !d.is_original)
    ?.sort((a, b) => b.version - a.version)[0]
    ?? drafts?.[0]

  if (!currentDraft?.content?.trim()) {
    return NextResponse.json({ error: 'No draft content found' }, { status: 400 })
  }

  // ── Resolve what text to publish ────────────────────────────────
  // Long-form posts (Mon/Wed) have a linkedin_excerpt saved at generation time.
  // If present, use it. Otherwise, smart-truncate the full content.
  const isLongForm = post.day === 'monday' || post.day === 'wednesday'
  const publishText = resolvePublishText(
    currentDraft.content,
    currentDraft.linkedin_excerpt ?? null,
    isLongForm
  )

  // ── Schedule only ────────────────────────────────────────────────
  if (!publishNow && !preview && scheduledAt) {
    await supabase.from('posts')
      .update({ status: 'scheduled', scheduled_at: scheduledAt })
      .eq('id', postId)
    return NextResponse.json({ scheduled: true, scheduledAt })
  }

  // ── Get LinkedIn token ───────────────────────────────────────────
  const tokenQuery = userId
    ? supabase.from('linkedin_tokens').select('*').eq('user_id', userId).single()
    : supabase.from('linkedin_tokens').select('*').limit(1).single()

  const { data: tokenRow, error: tokenError } = await tokenQuery

  if (tokenError || !tokenRow) {
    return NextResponse.json(
      { error: 'LinkedIn not connected. Please connect LinkedIn in Settings.' },
      { status: 402 }
    )
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    return NextResponse.json(
      { error: 'LinkedIn token expired. Please reconnect LinkedIn in Settings.' },
      { status: 402 }
    )
  }

  // ── Promote preview → PUBLIC ─────────────────────────────────────
  if (promotePreview && linkedinPostId) {
    await deleteLinkedInPost(linkedinPostId, tokenRow.access_token)

    const result = await callLinkedInAPI(
      publishText, tokenRow.access_token, tokenRow.linkedin_id, 'PUBLIC'
    )
    if (!result.success) {
      await supabase.from('posts').update({ status: 'publish_failed' }).eq('id', postId)
      return NextResponse.json({ error: result.error }, { status: 502 })
    }

    await supabase.from('linkedin_posts').upsert({
      post_id:          postId,
      linkedin_post_id: result.postId!,
      linkedin_url:     result.url ?? null,
      published_at:     new Date().toISOString(),
    }, { onConflict: 'post_id' })

    await supabase.from('posts').update({ status: 'published' }).eq('id', postId)
    return NextResponse.json({ published: true, url: result.url })
  }

  // ── Preview or full publish ──────────────────────────────────────
  const visibility = preview ? 'LOGGED_IN' : 'PUBLIC'
  const result = await callLinkedInAPI(
    publishText, tokenRow.access_token, tokenRow.linkedin_id, visibility
  )

  if (!result.success) {
    if (!preview) {
      await supabase.from('posts').update({ status: 'publish_failed' }).eq('id', postId)
    }
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  if (!preview) {
    await supabase.from('linkedin_posts').insert({
      post_id:          postId,
      linkedin_post_id: result.postId!,
      linkedin_url:     result.url ?? null,
      published_at:     new Date().toISOString(),
    })
    await supabase.from('posts').update({ status: 'published' }).eq('id', postId)
  }

  return NextResponse.json({
    published:      !preview,
    preview:        preview ?? false,
    url:            result.url,
    linkedinPostId: result.postId,
    // Let the UI know if the published text was a truncated excerpt
    wasExcerpt:     publishText !== currentDraft.content,
  })
}


// ── Resolve what to publish ──────────────────────────────────────────
// Priority order:
//   1. linkedin_excerpt saved at generation time (AI-crafted, best quality)
//   2. Smart truncation at the last paragraph break before LI_SAFE_CHARS
//   3. Hard truncation with ellipsis as last resort
function resolvePublishText(
  fullContent: string,
  linkedinExcerpt: string | null,
  isLongForm: boolean,
): string {
  // Short content — no action needed
  if (fullContent.length <= LI_MAX_CHARS) return fullContent

  // Long-form: prefer the AI-crafted excerpt if it exists and fits
  if (isLongForm && linkedinExcerpt?.trim()) {
    const excerpt = linkedinExcerpt.trim()
    if (excerpt.length <= LI_MAX_CHARS) return excerpt
  }

  // Fall back: smart truncation — cut at the last double-newline before LI_SAFE_CHARS
  const candidate = fullContent.slice(0, LI_SAFE_CHARS)
  const lastBreak = candidate.lastIndexOf('\n\n')

  let truncated: string
  if (lastBreak > LI_SAFE_CHARS * 0.6) {
    // Good paragraph break found — use it
    truncated = candidate.slice(0, lastBreak).trimEnd()
  } else {
    // No good break — fall back to last sentence end
    const lastPeriod = candidate.lastIndexOf('.')
    truncated = lastPeriod > LI_SAFE_CHARS * 0.6
      ? candidate.slice(0, lastPeriod + 1).trimEnd()
      : candidate.trimEnd() + '...'
  }

  // Append the full-article pointer
  truncated += '\n\n[Full article on coachsharath.com — link in bio]'

  return truncated
}


// ── LinkedIn REST Posts API (/rest/posts) ────────────────────────────
// Replaces the deprecated /v2/ugcPosts endpoint.
// The /rest/posts limit is 3,000 characters for personal profiles.
async function callLinkedInAPI(
  content: string,
  accessToken: string,
  linkedinId: string | null,
  visibility: 'PUBLIC' | 'LOGGED_IN' | 'CONNECTIONS',
): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  try {
    let authorUrn: string

    if (linkedinId) {
      authorUrn = `urn:li:person:${linkedinId}`
    } else {
      const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!profileRes.ok) {
        return { success: false, error: 'Failed to fetch LinkedIn profile. Please reconnect.' }
      }
      const profile = await profileRes.json()
      authorUrn = `urn:li:person:${profile.sub}`
    }

    // Map old visibility values to the /rest/posts enum
    const visibilityMap: Record<string, string> = {
      PUBLIC:       'PUBLIC',
      LOGGED_IN:    'LOGGED_IN',  // preview — visible to logged-in LinkedIn members
      CONNECTIONS:  'CONNECTIONS',
    }

    const postBody = {
      author:     authorUrn,
      commentary: content,
      visibility: visibilityMap[visibility] ?? 'PUBLIC',
      distribution: {
        feedDistribution:               'MAIN_FEED',
        targetEntities:                 [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState:         'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }

    const postRes = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: {
        Authorization:              `Bearer ${accessToken}`,
        'Content-Type':             'application/json',
        'LinkedIn-Version':         '202604',   // pin to a stable monthly version
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(postBody),
    })

    if (!postRes.ok) {
      const errBody = await postRes.text()
      return { success: false, error: `LinkedIn API error (${postRes.status}): ${errBody}` }
    }

    // /rest/posts returns the post URN in the Location header: urn:li:share:123456789
    const location = postRes.headers.get('location') ?? ''
    const liPostId = location.split('/').pop() ?? location

    return {
      success: true,
      postId:  liPostId,
      url:     liPostId ? `https://www.linkedin.com/feed/update/${liPostId}/` : undefined,
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}


// ── Delete a LinkedIn post ───────────────────────────────────────────
// Uses /rest/posts for consistency with the new API.
async function deleteLinkedInPost(linkedinPostId: string, accessToken: string): Promise<void> {
  try {
    // Try /rest/posts first; fall back to /v2/ugcPosts for legacy post IDs
    const restUrl = `https://api.linkedin.com/rest/posts/${encodeURIComponent(linkedinPostId)}`
    const res = await fetch(restUrl, {
      method: 'DELETE',
      headers: {
        Authorization:      `Bearer ${accessToken}`,
        'LinkedIn-Version': '202504',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    })

    if (!res.ok && res.status !== 404) {
      // Fall back to legacy endpoint for any old ugcPost IDs still in the DB
      await fetch(`https://api.linkedin.com/v2/ugcPosts/${encodeURIComponent(linkedinPostId)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      })
    }
  } catch (err) {
    console.warn('[publish] Delete preview post failed (non-fatal):', err)
  }
}
