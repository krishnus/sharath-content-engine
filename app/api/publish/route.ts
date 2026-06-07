import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// POST /api/publish
// Body: { postId, publishNow, scheduledAt? }
//
// Two callers:
//   1. Draft editor UI  — authenticated user session present
//   2. Cron job         — passes x-cron-secret header, uses service client
export async function POST(req: NextRequest) {
  const isCron = req.headers.get('x-cron-secret') === process.env.CRON_SECRET

  // Use service client for cron (bypasses RLS), user client otherwise
  const supabase = isCron ? createServiceClient() : createClient()

  if (!isCron) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { postId, publishNow, scheduledAt } = await req.json() as {
    postId: string
    publishNow: boolean
    scheduledAt?: string
  }

  // ── Fetch post + current draft ───────────────────────────────────
  const { data: post } = await supabase
    .from('posts')
    .select('*, drafts(*), weeks(user_id)')
    .eq('id', postId)
    .single()

  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  if (post.status !== 'approved' && post.status !== 'scheduled') {
    return NextResponse.json({ error: 'Post must be approved before publishing' }, { status: 400 })
  }

  const currentDraft = (post.drafts as Array<{ is_original: boolean; content: string }>)
    ?.find(d => !d.is_original) ??
    (post.drafts as Array<{ is_original: boolean; content: string }>)?.[0]

  if (!currentDraft?.content) {
    return NextResponse.json({ error: 'No draft content found' }, { status: 400 })
  }

  // ── Schedule only ────────────────────────────────────────────────
  if (!publishNow && scheduledAt) {
    await supabase
      .from('posts')
      .update({ status: 'scheduled', scheduled_at: scheduledAt })
      .eq('id', postId)
    return NextResponse.json({ scheduled: true, scheduledAt })
  }

  // ── Get LinkedIn access token from stored tokens table ───────────
  // Works for both user-initiated and cron publishing since the token
  // is stored in the DB after OAuth, not tied to session lifetime.
  const userId = (post.weeks as Array<{ user_id: string }>)?.[0]?.user_id
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

  // Check token expiry
  if (new Date(tokenRow.expires_at) < new Date()) {
    return NextResponse.json(
      { error: 'LinkedIn token expired. Please reconnect LinkedIn in Settings.' },
      { status: 402 }
    )
  }

  // ── Publish to LinkedIn ──────────────────────────────────────────
  const result = await callLinkedInAPI(currentDraft.content, tokenRow.access_token, tokenRow.linkedin_id)

  if (!result.success) {
    await supabase.from('posts').update({ status: 'publish_failed' }).eq('id', postId)
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  // ── Record success ───────────────────────────────────────────────
  await supabase.from('linkedin_posts').insert({
    post_id:          postId,
    linkedin_post_id: result.postId!,
    linkedin_url:     result.url ?? null,
    published_at:     new Date().toISOString(),
  })

  await supabase.from('posts').update({ status: 'published' }).eq('id', postId)

  return NextResponse.json({ published: true, url: result.url })
}


// ── LinkedIn UGC Post API ────────────────────────────────────────────
async function callLinkedInAPI(
  content: string,
  accessToken: string,
  linkedinId: string | null,
): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  try {
    // Get author URN — use stored linkedin_id if available, else fetch from userinfo
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
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(postBody),
    })

    if (!postRes.ok) {
      const errBody = await postRes.text()
      return { success: false, error: `LinkedIn API error (${postRes.status}): ${errBody}` }
    }

    const liPostId = postRes.headers.get('x-restli-id') ?? ''
    return {
      success: true,
      postId:  liPostId,
      url:     `https://www.linkedin.com/feed/update/${liPostId}/`,
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
