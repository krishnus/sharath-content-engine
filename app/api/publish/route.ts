import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const isCron = req.headers.get('x-cron-secret') === process.env.CRON_SECRET
  const supabase = isCron ? createServiceClient() : createClient()

  if (!isCron) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { postId, publishNow, scheduledAt, preview, promotePreview, linkedinPostId } =
    await req.json() as {
      postId: string
      publishNow: boolean
      scheduledAt?: string
      preview?: boolean          // publish as LOGGED_IN_MEMBERS for look & feel check
      promotePreview?: boolean   // update existing preview post to PUBLIC
      linkedinPostId?: string    // needed for promotePreview
    }

  // ── Fetch post + draft ────────────────────────────────────────────
  const { data: post } = await supabase
    .from('posts')
    .select('*, drafts(*), weeks(user_id, week_start)')
    .eq('id', postId)
    .single()

  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  if (!preview && !promotePreview) {
    if (post.status !== 'approved' && post.status !== 'scheduled') {
      return NextResponse.json({ error: 'Post must be approved before publishing' }, { status: 400 })
    }
  }

  const currentDraft = (post.drafts as Array<{ is_original: boolean; content: string }>)
    ?.find(d => !d.is_original) ??
    (post.drafts as Array<{ is_original: boolean; content: string }>)?.[0]

  if (!currentDraft?.content) {
    return NextResponse.json({ error: 'No draft content found' }, { status: 400 })
  }

  // ── Schedule only (no LinkedIn call) ─────────────────────────────
  if (!publishNow && scheduledAt && !preview) {
    await supabase.from('posts')
      .update({ status: 'scheduled', scheduled_at: scheduledAt })
      .eq('id', postId)
    return NextResponse.json({ scheduled: true, scheduledAt })
  }

  // ── Get stored LinkedIn token ─────────────────────────────────────
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

  if (new Date(tokenRow.expires_at) < new Date()) {
    return NextResponse.json(
      { error: 'LinkedIn token expired. Please reconnect LinkedIn in Settings.' },
      { status: 402 }
    )
  }

  // ── Promote preview → PUBLIC ──────────────────────────────────────
  // LinkedIn doesn't support updating visibility after publish,
  // so we delete the preview post and re-publish as PUBLIC.
  if (promotePreview && linkedinPostId) {
    // Delete the preview post
    await deleteLinkedInPost(linkedinPostId, tokenRow.access_token)

    // Re-publish as PUBLIC
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

  // ── Preview (LOGGED_IN_MEMBERS) or full publish (PUBLIC) ──────────
  const visibility = preview ? 'LOGGED_IN_MEMBERS' : 'PUBLIC'
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
    // Full public publish — record and mark published
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


// ── LinkedIn UGC Post API ─────────────────────────────────────────────
async function callLinkedInAPI(
  content: string,
  accessToken: string,
  linkedinId: string | null,
  visibility: 'PUBLIC' | 'LOGGED_IN_MEMBERS' | 'CONNECTIONS',
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

// ── Delete a LinkedIn post ────────────────────────────────────────────
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
