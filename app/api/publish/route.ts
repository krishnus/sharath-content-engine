import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const isCron = req.headers.get('x-cron-secret') === process.env.CRON_SECRET
  const supabase = isCron ? createServiceClient() : createClient()

  // Get authenticated user — for both user-initiated and cron calls
  // (cron uses service client which bypasses RLS but we still need
  //  the user id to look up their LinkedIn token)
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
  // No user_id join needed — single-user app, token looked up by auth user
  const { data: post, error: postError } = await supabase
    .from('posts')
    .select(`
      id, day, status, week_id,
      drafts ( id, content, is_original, version ),
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
  const drafts = (post.drafts as Array<{ id: string; content: string; is_original: boolean; version: number }>)
  const currentDraft = drafts
    ?.filter(d => !d.is_original)
    ?.sort((a, b) => b.version - a.version)[0]
    ?? drafts?.[0]

  if (!currentDraft?.content?.trim()) {
    return NextResponse.json({ error: 'No draft content found' }, { status: 400 })
  }

  // ── Schedule only ────────────────────────────────────────────────
  if (!publishNow && !preview && scheduledAt) {
    await supabase.from('posts')
      .update({ status: 'scheduled', scheduled_at: scheduledAt })
      .eq('id', postId)
    return NextResponse.json({ scheduled: true, scheduledAt })
  }

  // ── Get LinkedIn token ───────────────────────────────────────────
  // For cron: take the first (only) token row — single user app
  // For user calls: match by user id
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
      currentDraft.content, tokenRow.access_token, tokenRow.linkedin_id, 'PUBLIC'
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
    currentDraft.content, tokenRow.access_token, tokenRow.linkedin_id, visibility
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
  })
}


// ── LinkedIn UGC Post API ────────────────────────────────────────────
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
        'com.linkedin.ugc.MemberNetworkVisibility': visibility,
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

// ── Delete a LinkedIn post ───────────────────────────────────────────
async function deleteLinkedInPost(linkedinPostId: string, accessToken: string): Promise<void> {
  try {
    await fetch(`https://api.linkedin.com/v2/ugcPosts/${encodeURIComponent(linkedinPostId)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
    })
  } catch (err) {
    console.warn('[publish] Delete preview post failed (non-fatal):', err)
  }
}
