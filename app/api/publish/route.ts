import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// ── POST /api/publish ────────────────────────────────────────────────
// Publishes an approved post to LinkedIn immediately,
// or saves a scheduled_at timestamp for the Cron job to pick up.
export async function POST(req: NextRequest) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { postId, publishNow, scheduledAt } = await req.json() as {
    postId: string
    publishNow: boolean
    scheduledAt?: string // ISO timestamp — used when scheduling
  }

  // ── Fetch post + current draft ───────────────────────────────────
  const { data: post } = await supabase
    .from('posts')
    .select('*, drafts(*)')
    .eq('id', postId)
    .single()

  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  if (post.status !== 'approved') {
    return NextResponse.json({ error: 'Post must be approved before publishing' }, { status: 400 })
  }

  const currentDraft = (post.drafts as Array<{ is_original: boolean; content: string }>)
    ?.find(d => !d.is_original)

  if (!currentDraft?.content) {
    return NextResponse.json({ error: 'No draft content found' }, { status: 400 })
  }

  // ── Schedule only — store timestamp, Cron will publish ───────────
  if (!publishNow && scheduledAt) {
    await supabase
      .from('posts')
      .update({ status: 'scheduled', scheduled_at: scheduledAt })
      .eq('id', postId)

    return NextResponse.json({ scheduled: true, scheduledAt })
  }

  // ── Publish now via LinkedIn API ─────────────────────────────────
  const linkedInResult = await publishToLinkedIn(currentDraft.content, supabase)

  if (!linkedInResult.success) {
    await supabase
      .from('posts')
      .update({ status: 'publish_failed' })
      .eq('id', postId)

    return NextResponse.json({ error: linkedInResult.error }, { status: 502 })
  }

  // ── Record success ───────────────────────────────────────────────
  await supabase.from('linkedin_posts').insert({
    post_id:          postId,
    linkedin_post_id: linkedInResult.postId!,
    linkedin_url:     linkedInResult.url ?? null,
    published_at:     new Date().toISOString(),
  })

  await supabase
    .from('posts')
    .update({ status: 'published' })
    .eq('id', postId)

  return NextResponse.json({ published: true, url: linkedInResult.url })
}


// ── LinkedIn API helper ──────────────────────────────────────────────
async function publishToLinkedIn(
  content: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  // Fetch LinkedIn access token from Supabase Auth session
  const { data: { session } } = await supabase.auth.getSession()
  const providerToken = session?.provider_token

  if (!providerToken) {
    return { success: false, error: 'LinkedIn not connected. Please connect LinkedIn in Settings.' }
  }

  try {
    // Get the LinkedIn member URN
    const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${providerToken}` },
    })

    if (!profileRes.ok) {
      return { success: false, error: 'Failed to fetch LinkedIn profile. Please reconnect LinkedIn.' }
    }

    const profile = await profileRes.json()
    const authorUrn = `urn:li:person:${profile.sub}`

    // Post to LinkedIn
    const postBody = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    }

    const postRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${providerToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(postBody),
    })

    if (!postRes.ok) {
      const errBody = await postRes.text()
      return { success: false, error: `LinkedIn API error: ${postRes.status} — ${errBody}` }
    }

    const liPostId = postRes.headers.get('x-restli-id') ?? ''
    const postUrl  = `https://www.linkedin.com/feed/update/${liPostId}/`

    return { success: true, postId: liPostId, url: postUrl }

  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
