import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { parseGenerationMetadata } from '@/lib/anthropic/client'

export const runtime = 'nodejs'
export const maxDuration = 60

// LinkedIn text post character limit
const LI_MAX_CHARS  = 3000
const LI_SAFE_CHARS = 2900

const STORAGE_BUCKET = 'post-media'

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

  // ── Fetch post + draft + media ────────────────────────────────────────
  const { data: post, error: postError } = await supabase
    .from('posts')
    .select(`
      id, day, format, status, week_id, hashtags,
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

  // Pick the most recent non-original draft
  const drafts = (post.drafts as Array<{
    id: string; content: string; is_original: boolean; version: number
  }>)
  const currentDraft = drafts
    ?.filter(d => !d.is_original)
    ?.sort((a, b) => b.version - a.version)[0]
    ?? drafts?.[0]

  if (!currentDraft?.content?.trim()) {
    return NextResponse.json({ error: 'No draft content found' }, { status: 400 })
  }

  // ── Check for attached media ──────────────────────────────────────────
  const format: string = post.format as string
  const expectedMediaType =
    format === 'long_form_article' ? 'article_pdf'   :
    format === 'carousel'          ? 'carousel_pdf'  :
    format === 'text_post' || format === 'market_insights' ? 'quote_png' : null

  let mediaRecord: {
    id: string; storage_path: string; file_name: string;
    media_type: string; linkedin_caption: string | null;
  } | null = null

  if (expectedMediaType) {
    const { data: media } = await supabase
      .from('post_media')
      .select('id, storage_path, file_name, media_type, linkedin_caption')
      .eq('post_id', postId)
      .eq('media_type', expectedMediaType)
      .maybeSingle()
    mediaRecord = media
  }

  // ── Resolve publish text ──────────────────────────────────────────────
  const meta = parseGenerationMetadata(currentDraft.content)
  let publishText: string

  if (mediaRecord?.linkedin_caption) {
    publishText = mediaRecord.linkedin_caption
  } else {
    publishText = resolvePublishText(meta.content)
  }

  const postHashtags: string[] = (post.hashtags as string[] | null) ?? []
  if (postHashtags.length > 0) {
    const hashtagStr = postHashtags.join(' ')
    publishText = (publishText + '\n\n' + hashtagStr).slice(0, LI_MAX_CHARS)
  }

  // ── Get LinkedIn token (needed for both schedule and immediate publish) ─
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

  const authorUrn = tokenRow.linkedin_id
    ? `urn:li:person:${tokenRow.linkedin_id}`
    : await fetchAuthorUrn(tokenRow.access_token)

  if (!authorUrn) {
    return NextResponse.json(
      { error: 'Could not resolve LinkedIn author URN. Please reconnect.' },
      { status: 502 }
    )
  }

  // Validate scheduled time is at least 10 minutes in the future
  if (scheduledAt && !publishNow && !preview) {
    const scheduledMs = new Date(scheduledAt).getTime()
    if (scheduledMs < Date.now() + 10 * 60 * 1000) {
      return NextResponse.json(
        { error: 'Scheduled time must be at least 10 minutes in the future.' },
        { status: 400 }
      )
    }
  }

  // ── Promote preview → PUBLIC ──────────────────────────────────────────
  if (promotePreview && linkedinPostId) {
    await deleteLinkedInPost(linkedinPostId, tokenRow.access_token)

    let result: { success: boolean; postId?: string; url?: string; error?: string }

    if (mediaRecord && mediaRecord.media_type === 'quote_png') {
      const { data: fileData } = await supabase.storage
        .from(STORAGE_BUCKET)
        .download(mediaRecord.storage_path)
      if (fileData) {
        const fileBuffer = Buffer.from(await fileData.arrayBuffer())
        result = await postImageToLinkedIn(publishText, fileBuffer, tokenRow.access_token, authorUrn, 'PUBLIC')
      } else {
        result = await postTextToLinkedIn(publishText, tokenRow.access_token, authorUrn, 'PUBLIC')
      }
    } else if (mediaRecord && (mediaRecord.media_type === 'article_pdf' || mediaRecord.media_type === 'carousel_pdf')) {
      const { data: fileData } = await supabase.storage
        .from(STORAGE_BUCKET)
        .download(mediaRecord.storage_path)
      if (fileData) {
        const fileBuffer = Buffer.from(await fileData.arrayBuffer())
        result = await postDocumentToLinkedIn(publishText, mediaRecord.file_name, fileBuffer, tokenRow.access_token, authorUrn)
      } else {
        result = await postTextToLinkedIn(publishText, tokenRow.access_token, authorUrn, 'PUBLIC')
      }
    } else {
      result = await postTextToLinkedIn(publishText, tokenRow.access_token, authorUrn, 'PUBLIC')
    }

    if (!result.success) {
      await supabase.from('posts').update({ status: 'publish_failed' }).eq('id', postId)
      return NextResponse.json({ error: result.error }, { status: 502 })
    }
    await supabase.from('linkedin_posts').upsert({
      post_id: postId, linkedin_post_id: result.postId!,
      linkedin_url: result.url ?? null, published_at: new Date().toISOString(),
    }, { onConflict: 'post_id' })
    await supabase.from('posts').update({ status: 'published' }).eq('id', postId)
    return NextResponse.json({ published: true, url: result.url })
  }

  // ── Publish with media (PDF document or image) ────────────────────────
  const isImageMedia = mediaRecord?.media_type === 'quote_png'
  // For scheduled posts with image media: upload the image now, schedule the post
  // For document posts: always immediate (can't schedule PDF uploads via LinkedIn API)
  const isScheduling = !publishNow && !preview && !!scheduledAt

  if (mediaRecord && (!preview || isImageMedia)) {
    const { data: fileData, error: dlError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(mediaRecord.storage_path)

    if (dlError || !fileData) {
      return NextResponse.json(
        { error: `Could not download media file: ${dlError?.message}` },
        { status: 500 }
      )
    }

    const fileBuffer = Buffer.from(await fileData.arrayBuffer())

    let result: { success: boolean; postId?: string; url?: string; error?: string }

    if (mediaRecord.media_type === 'article_pdf' || mediaRecord.media_type === 'carousel_pdf') {
      // Document posts: schedule not supported by LinkedIn API — publish immediately
      result = await postDocumentToLinkedIn(
        publishText, mediaRecord.file_name, fileBuffer,
        tokenRow.access_token, authorUrn
      )
    } else {
      const imgVisibility = preview ? 'LOGGED_IN' : 'PUBLIC'
      result = await postImageToLinkedIn(
        publishText, fileBuffer, tokenRow.access_token, authorUrn, imgVisibility,
        isScheduling ? scheduledAt : undefined
      )
    }

    if (!result.success) {
      if (!preview) {
        await supabase.from('posts').update({ status: 'publish_failed' }).eq('id', postId)
      }
      return NextResponse.json({ error: result.error }, { status: 502 })
    }

    if (isScheduling && !preview) {
      await supabase.from('linkedin_posts').insert({
        post_id: postId, linkedin_post_id: result.postId!,
        linkedin_url: null, published_at: new Date().toISOString(),
      })
      await supabase.from('posts')
        .update({ status: 'scheduled', scheduled_at: scheduledAt })
        .eq('id', postId)
      return NextResponse.json({ scheduled: true, linkedinPostId: result.postId, scheduledAt })
    }

    if (!preview) {
      await supabase.from('linkedin_posts').insert({
        post_id: postId, linkedin_post_id: result.postId!,
        linkedin_url: result.url ?? null, published_at: new Date().toISOString(),
      })
      await supabase.from('posts').update({ status: 'published' }).eq('id', postId)
    }

    return NextResponse.json({
      published:      !preview,
      preview:        preview ?? false,
      url:            result.url,
      linkedinPostId: result.postId,
      hasMedia:       true,
      mediaType:      mediaRecord.media_type,
    })
  }

  // ── Text-only publish (no media attached, or preview mode for PDF posts) ─
  const visibility = preview ? 'LOGGED_IN' : 'PUBLIC'
  const result = await postTextToLinkedIn(
    publishText, tokenRow.access_token, authorUrn, visibility,
    isScheduling ? scheduledAt : undefined
  )

  if (!result.success) {
    if (!preview) {
      await supabase.from('posts').update({ status: 'publish_failed' }).eq('id', postId)
    }
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  if (isScheduling) {
    await supabase.from('linkedin_posts').insert({
      post_id: postId, linkedin_post_id: result.postId!,
      linkedin_url: null, published_at: new Date().toISOString(),
    })
    await supabase.from('posts')
      .update({ status: 'scheduled', scheduled_at: scheduledAt })
      .eq('id', postId)
    return NextResponse.json({ scheduled: true, linkedinPostId: result.postId, scheduledAt })
  }

  if (!preview) {
    await supabase.from('linkedin_posts').insert({
      post_id: postId, linkedin_post_id: result.postId!,
      linkedin_url: result.url ?? null, published_at: new Date().toISOString(),
    })
    await supabase.from('posts').update({ status: 'published' }).eq('id', postId)
  }

  return NextResponse.json({
    published:      !preview,
    preview:        preview ?? false,
    url:            result.url,
    linkedinPostId: result.postId,
    hasMedia:       false,
  })
}


// ── Resolve text for text-only publish ────────────────────────────────────
function resolvePublishText(content: string): string {
  if (content.length <= LI_MAX_CHARS) return content

  const candidate = content.slice(0, LI_SAFE_CHARS)
  const lastBreak = candidate.lastIndexOf('\n\n')

  if (lastBreak > LI_SAFE_CHARS * 0.6) {
    return candidate.slice(0, lastBreak).trimEnd()
  }
  const lastPeriod = candidate.lastIndexOf('.')
  return lastPeriod > LI_SAFE_CHARS * 0.6
    ? candidate.slice(0, lastPeriod + 1).trimEnd()
    : candidate.trimEnd() + '...'
}


// ── Fetch author URN from LinkedIn userinfo ────────────────────────────────
async function fetchAuthorUrn(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    const profile = await res.json()
    return `urn:li:person:${profile.sub}`
  } catch {
    return null
  }
}


// ── Text-only post ─────────────────────────────────────────────────────────
async function postTextToLinkedIn(
  content: string,
  accessToken: string,
  authorUrn: string,
  visibility: 'PUBLIC' | 'LOGGED_IN' | 'CONNECTIONS',
  scheduledAt?: string,
): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  try {
    const body: Record<string, unknown> = {
      author:     authorUrn,
      commentary: content,
      visibility,
      distribution: {
        feedDistribution:               'MAIN_FEED',
        targetEntities:                 [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState:            scheduledAt ? 'DRAFT' : 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }
    if (scheduledAt) {
      body.scheduledPublishAt = new Date(scheduledAt).getTime()
    }

    const res = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: {
        Authorization:              `Bearer ${accessToken}`,
        'Content-Type':             'application/json',
        'LinkedIn-Version':         '202604',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      return { success: false, error: `LinkedIn API error (${res.status}): ${await res.text()}` }
    }

    const location = res.headers.get('location') ?? ''
    const liPostId = decodeURIComponent(location.split('/').pop() ?? location)

    return {
      success: true,
      postId:  liPostId,
      // Scheduled posts aren't publicly accessible until they publish
      url: scheduledAt ? undefined : (liPostId ? `https://www.linkedin.com/feed/update/${liPostId}/` : undefined),
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}


// ── Document post (PDF) ────────────────────────────────────────────────────
// LinkedIn does not support scheduling document posts via the REST API —
// document uploads must be published immediately.
async function postDocumentToLinkedIn(
  caption: string,
  fileName: string,
  fileBuffer: Buffer,
  accessToken: string,
  authorUrn: string,
): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  try {
    // Step 1: Initialize upload
    const initRes = await fetch(
      'https://api.linkedin.com/rest/documents?action=initializeUpload',
      {
        method: 'POST',
        headers: {
          Authorization:              `Bearer ${accessToken}`,
          'Content-Type':             'application/json',
          'LinkedIn-Version':         '202604',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          initializeUploadRequest: { owner: authorUrn },
        }),
      }
    )

    if (!initRes.ok) {
      return { success: false, error: `Document init failed (${initRes.status}): ${await initRes.text()}` }
    }

    const { value: initData } = await initRes.json()
    const uploadUrl    = initData.uploadUrl as string
    const documentUrn  = initData.document as string

    // Step 2: Upload the binary
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body: fileBuffer as any,
    })

    if (!uploadRes.ok) {
      return { success: false, error: `Document upload failed (${uploadRes.status}): ${await uploadRes.text()}` }
    }

    // Step 3: Create the post
    const postRes = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: {
        Authorization:              `Bearer ${accessToken}`,
        'Content-Type':             'application/json',
        'LinkedIn-Version':         '202604',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author:     authorUrn,
        commentary: caption,
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution:               'MAIN_FEED',
          targetEntities:                 [],
          thirdPartyDistributionChannels: [],
        },
        content: {
          media: {
            id:    documentUrn,
            title: fileName.replace(/\.(pdf|png|jpg)$/i, '').replace(/-/g, ' '),
          },
        },
        lifecycleState:            'PUBLISHED',
        isReshareDisabledByAuthor: false,
      }),
    })

    if (!postRes.ok) {
      return { success: false, error: `Post create failed (${postRes.status}): ${await postRes.text()}` }
    }

    const location = postRes.headers.get('location') ?? ''
    const liPostId = decodeURIComponent(location.split('/').pop() ?? location)

    return {
      success: true,
      postId:  liPostId,
      url:     liPostId ? `https://www.linkedin.com/feed/update/${liPostId}/` : undefined,
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}


// ── Image post ─────────────────────────────────────────────────────────────
async function postImageToLinkedIn(
  caption: string,
  imageBuffer: Buffer,
  accessToken: string,
  authorUrn: string,
  visibility: 'PUBLIC' | 'LOGGED_IN' | 'CONNECTIONS' = 'PUBLIC',
  scheduledAt?: string,
): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  try {
    // Step 1: Initialize image upload
    const initRes = await fetch(
      'https://api.linkedin.com/rest/images?action=initializeUpload',
      {
        method: 'POST',
        headers: {
          Authorization:              `Bearer ${accessToken}`,
          'Content-Type':             'application/json',
          'LinkedIn-Version':         '202604',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          initializeUploadRequest: { owner: authorUrn },
        }),
      }
    )

    if (!initRes.ok) {
      return { success: false, error: `Image init failed (${initRes.status}): ${await initRes.text()}` }
    }

    const { value: initData } = await initRes.json()
    const uploadUrl  = initData.uploadUrl as string
    const imageUrn   = initData.image as string

    // Step 2: Upload the image (happens immediately even for scheduled posts)
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body: imageBuffer as any,
    })

    if (!uploadRes.ok) {
      return { success: false, error: `Image upload failed (${uploadRes.status}): ${await uploadRes.text()}` }
    }

    // Step 3: Create the post (DRAFT + scheduledPublishAt for scheduled posts)
    const body: Record<string, unknown> = {
      author:     authorUrn,
      commentary: caption,
      visibility,
      distribution: {
        feedDistribution:               'MAIN_FEED',
        targetEntities:                 [],
        thirdPartyDistributionChannels: [],
      },
      content: { media: { id: imageUrn } },
      lifecycleState:            scheduledAt ? 'DRAFT' : 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }
    if (scheduledAt) {
      body.scheduledPublishAt = new Date(scheduledAt).getTime()
    }

    const postRes = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: {
        Authorization:              `Bearer ${accessToken}`,
        'Content-Type':             'application/json',
        'LinkedIn-Version':         '202604',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(body),
    })

    if (!postRes.ok) {
      return { success: false, error: `Post create failed (${postRes.status}): ${await postRes.text()}` }
    }

    const location = postRes.headers.get('location') ?? ''
    const liPostId = decodeURIComponent(location.split('/').pop() ?? location)

    return {
      success: true,
      postId:  liPostId,
      url: scheduledAt ? undefined : (liPostId ? `https://www.linkedin.com/feed/update/${liPostId}/` : undefined),
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}


// ── Delete a LinkedIn post ────────────────────────────────────────────────
async function deleteLinkedInPost(linkedinPostId: string, accessToken: string): Promise<void> {
  try {
    const normalizedId = encodeURIComponent(decodeURIComponent(linkedinPostId))
    const res = await fetch(`https://api.linkedin.com/rest/posts/${normalizedId}`, {
      method: 'DELETE',
      headers: {
        Authorization:              `Bearer ${accessToken}`,
        'LinkedIn-Version':         '202604',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    })
    if (!res.ok && res.status !== 404) {
      await fetch(`https://api.linkedin.com/v2/ugcPosts/${encodeURIComponent(linkedinPostId)}`, {
        method: 'DELETE',
        headers: {
          Authorization:              `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      })
    }
  } catch (err) {
    console.warn('[publish] Delete preview post failed (non-fatal):', err)
  }
}
