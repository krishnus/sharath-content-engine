import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseGenerationMetadata } from '@/lib/anthropic/client'

export const runtime = 'nodejs'
export const maxDuration = 60

const LI_MAX_CHARS  = 3000
const LI_SAFE_CHARS = 2900
const STORAGE_BUCKET = 'post-media'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { postId, publishNow, scheduledAt, preview, promotePreview, linkedinPostId } =
    await req.json() as {
      postId: string
      publishNow: boolean
      scheduledAt?: string
      preview?: boolean
      promotePreview?: boolean
      linkedinPostId?: string
    }

  // ── Fetch free-form post + drafts + media ─────────────────────────────
  const { data: post, error: postError } = await supabase
    .from('free_form_posts')
    .select('id, format, status, hashtags')
    .eq('id', postId)
    .single()

  if (postError || !post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  if (!preview && !promotePreview) {
    if (post.status === 'published' && publishNow) {
      return NextResponse.json(
        { error: 'This post has already been published to LinkedIn.' },
        { status: 400 }
      )
    }
    if (post.status !== 'approved' && post.status !== 'scheduled' && post.status !== 'published') {
      return NextResponse.json(
        { error: `Post must be approved before publishing (current status: ${post.status})` },
        { status: 400 }
      )
    }
  }

  const { data: drafts } = await supabase
    .from('free_form_drafts')
    .select('id, content, is_original, is_approved, version')
    .eq('post_id', postId)
    .order('version', { ascending: false })

  const nonOriginals  = (drafts ?? []).filter(d => !d.is_original)
  const approvedDraft = nonOriginals.find(d => d.is_approved)
  const currentDraft  = approvedDraft ?? nonOriginals[0] ?? (drafts ?? [])[0]

  if (!currentDraft?.content?.trim()) {
    return NextResponse.json({ error: 'No draft content found' }, { status: 400 })
  }

  // ── Check for media ───────────────────────────────────────────────────
  const format: string = post.format as string
  const expectedMediaType =
    format === 'long_form_article' ? 'article_pdf'  :
    format === 'carousel'          ? 'carousel_pdf' :
    (format === 'text_post' || format === 'market_insights') ? 'quote_png' : null

  let mediaRecord: {
    id: string; storage_path: string; file_name: string;
    media_type: string; linkedin_caption: string | null;
  } | null = null

  if (expectedMediaType) {
    const { data: media } = await supabase
      .from('free_form_media')
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

  // ── Get LinkedIn token ────────────────────────────────────────────────
  const { data: tokenRow, error: tokenError } = await supabase
    .from('linkedin_tokens')
    .select('*')
    .eq('user_id', user.id)
    .single()

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

  // ── Promote preview → PUBLIC ──────────────────────────────────────────
  if (promotePreview && linkedinPostId) {
    await deleteLinkedInPost(linkedinPostId, tokenRow.access_token)

    let result: { success: boolean; postId?: string; url?: string; error?: string }

    if (mediaRecord && mediaRecord.media_type === 'quote_png') {
      const { data: fileData } = await supabase.storage.from(STORAGE_BUCKET).download(mediaRecord.storage_path)
      if (fileData) {
        const fileBuffer = Buffer.from(await fileData.arrayBuffer())
        result = await postImageToLinkedIn(publishText, fileBuffer, tokenRow.access_token, authorUrn, 'PUBLIC')
      } else {
        result = await postTextToLinkedIn(publishText, tokenRow.access_token, authorUrn, 'PUBLIC')
      }
    } else if (mediaRecord && (mediaRecord.media_type === 'article_pdf' || mediaRecord.media_type === 'carousel_pdf')) {
      const { data: fileData } = await supabase.storage.from(STORAGE_BUCKET).download(mediaRecord.storage_path)
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
      await supabase.from('free_form_posts').update({ status: 'publish_failed' }).eq('id', postId)
      return NextResponse.json({ error: result.error }, { status: 502 })
    }

    await supabase.from('free_form_linkedin_posts').upsert({
      post_id: postId, linkedin_post_id: result.postId!,
      linkedin_url: result.url ?? null, published_at: new Date().toISOString(),
    }, { onConflict: 'post_id' })
    await supabase.from('free_form_posts').update({ status: 'published', updated_at: new Date().toISOString() }).eq('id', postId)
    return NextResponse.json({ published: true, url: result.url })
  }

  const isDocumentMedia = mediaRecord?.media_type === 'article_pdf' || mediaRecord?.media_type === 'carousel_pdf'
  const isImageMedia    = mediaRecord?.media_type === 'quote_png'

  // ── Schedule only ─────────────────────────────────────────────────────
  if (!publishNow && !preview && scheduledAt) {
    await supabase
      .from('free_form_posts')
      .update({ status: 'scheduled', scheduled_at: scheduledAt, updated_at: new Date().toISOString() })
      .eq('id', postId)
    return NextResponse.json({ scheduled: true, scheduledAt })
  }

  // ── Document post ─────────────────────────────────────────────────────
  if (isDocumentMedia && mediaRecord) {
    const { data: fileData, error: dlError } = await supabase.storage.from(STORAGE_BUCKET).download(mediaRecord.storage_path)
    if (dlError || !fileData) {
      return NextResponse.json({ error: `Could not download media file: ${dlError?.message}` }, { status: 500 })
    }
    const fileBuffer = Buffer.from(await fileData.arrayBuffer())
    const result = await postDocumentToLinkedIn(publishText, mediaRecord.file_name, fileBuffer, tokenRow.access_token, authorUrn)

    if (!result.success) {
      await supabase.from('free_form_posts').update({ status: 'publish_failed', updated_at: new Date().toISOString() }).eq('id', postId)
      return NextResponse.json({ error: result.error }, { status: 502 })
    }
    await supabase.from('free_form_linkedin_posts').upsert({
      post_id: postId, linkedin_post_id: result.postId!,
      linkedin_url: result.url ?? null, published_at: new Date().toISOString(),
    }, { onConflict: 'post_id' })
    await supabase.from('free_form_posts').update({ status: 'published', updated_at: new Date().toISOString() }).eq('id', postId)
    return NextResponse.json({ published: true, url: result.url, linkedinPostId: result.postId, hasMedia: true, mediaType: mediaRecord.media_type })
  }

  // ── Image post ────────────────────────────────────────────────────────
  if (isImageMedia && mediaRecord) {
    const { data: fileData, error: dlError } = await supabase.storage.from(STORAGE_BUCKET).download(mediaRecord.storage_path)
    if (dlError || !fileData) {
      return NextResponse.json({ error: `Could not download media file: ${dlError?.message}` }, { status: 500 })
    }
    const fileBuffer = Buffer.from(await fileData.arrayBuffer())
    const imgVisibility = preview ? 'LOGGED_IN' : 'PUBLIC'
    const result = await postImageToLinkedIn(publishText, fileBuffer, tokenRow.access_token, authorUrn, imgVisibility)

    if (!result.success) {
      if (!preview) await supabase.from('free_form_posts').update({ status: 'publish_failed', updated_at: new Date().toISOString() }).eq('id', postId)
      return NextResponse.json({ error: result.error }, { status: 502 })
    }
    if (!preview) {
      await supabase.from('free_form_linkedin_posts').insert({
        post_id: postId, linkedin_post_id: result.postId!,
        linkedin_url: result.url ?? null, published_at: new Date().toISOString(),
      })
      await supabase.from('free_form_posts').update({ status: 'published', updated_at: new Date().toISOString() }).eq('id', postId)
    }
    return NextResponse.json({ published: !preview, preview: preview ?? false, url: result.url, linkedinPostId: result.postId, hasMedia: true, mediaType: mediaRecord.media_type })
  }

  // ── Text-only ─────────────────────────────────────────────────────────
  const visibility = preview ? 'LOGGED_IN' : 'PUBLIC'
  const result = await postTextToLinkedIn(publishText, tokenRow.access_token, authorUrn, visibility)

  if (!result.success) {
    if (!preview) await supabase.from('free_form_posts').update({ status: 'publish_failed', updated_at: new Date().toISOString() }).eq('id', postId)
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  if (!preview) {
    await supabase.from('free_form_linkedin_posts').upsert({
      post_id: postId, linkedin_post_id: result.postId!,
      linkedin_url: result.url ?? null, published_at: new Date().toISOString(),
    }, { onConflict: 'post_id' })
    await supabase.from('free_form_posts').update({ status: 'published', updated_at: new Date().toISOString() }).eq('id', postId)
  }

  return NextResponse.json({ published: !preview, preview: preview ?? false, url: result.url, linkedinPostId: result.postId, hasMedia: false })
}

// ── Helpers (same logic as /api/publish) ────────────────────────────────────

function resolvePublishText(content: string): string {
  if (content.length <= LI_MAX_CHARS) return content
  const candidate = content.slice(0, LI_SAFE_CHARS)
  const lastBreak = candidate.lastIndexOf('\n\n')
  if (lastBreak > LI_SAFE_CHARS * 0.6) return candidate.slice(0, lastBreak).trimEnd()
  const lastPeriod = candidate.lastIndexOf('.')
  return lastPeriod > LI_SAFE_CHARS * 0.6
    ? candidate.slice(0, lastPeriod + 1).trimEnd()
    : candidate.trimEnd() + '...'
}

async function fetchAuthorUrn(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    const profile = await res.json()
    return `urn:li:person:${profile.sub}`
  } catch { return null }
}

async function postTextToLinkedIn(
  content: string, accessToken: string, authorUrn: string,
  visibility: 'PUBLIC' | 'LOGGED_IN' | 'CONNECTIONS',
): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  try {
    const res = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'LinkedIn-Version': '202604',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author: authorUrn, commentary: content, visibility,
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false,
      }),
    })
    if (!res.ok) return { success: false, error: `LinkedIn API error (${res.status}): ${await res.text()}` }
    const location = res.headers.get('location') ?? ''
    const liPostId = decodeURIComponent(location.split('/').pop() ?? location)
    return { success: true, postId: liPostId, url: liPostId ? `https://www.linkedin.com/feed/update/${liPostId}/` : undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

async function postDocumentToLinkedIn(
  caption: string, fileName: string, fileBuffer: Buffer,
  accessToken: string, authorUrn: string,
): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  try {
    const initRes = await fetch('https://api.linkedin.com/rest/documents?action=initializeUpload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'LinkedIn-Version': '202604', 'X-Restli-Protocol-Version': '2.0.0' },
      body: JSON.stringify({ initializeUploadRequest: { owner: authorUrn } }),
    })
    if (!initRes.ok) return { success: false, error: `Document init failed (${initRes.status}): ${await initRes.text()}` }
    const { value: initData } = await initRes.json()
    const uploadUrl = initData.uploadUrl as string
    const documentUrn = initData.document as string
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body: fileBuffer as any,
    })
    if (!uploadRes.ok) return { success: false, error: `Document upload failed (${uploadRes.status}): ${await uploadRes.text()}` }
    const postRes = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'LinkedIn-Version': '202604', 'X-Restli-Protocol-Version': '2.0.0' },
      body: JSON.stringify({
        author: authorUrn, commentary: caption, visibility: 'PUBLIC',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        content: { media: { id: documentUrn, title: (() => { const t = fileName.replace(/\.(pdf|png|jpg)$/i, '').replace(/-/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1) })() } },
        lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false,
      }),
    })
    if (!postRes.ok) return { success: false, error: `Post create failed (${postRes.status}): ${await postRes.text()}` }
    const location = postRes.headers.get('location') ?? ''
    const liPostId = decodeURIComponent(location.split('/').pop() ?? location)
    return { success: true, postId: liPostId, url: liPostId ? `https://www.linkedin.com/feed/update/${liPostId}/` : undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

async function postImageToLinkedIn(
  caption: string, imageBuffer: Buffer, accessToken: string, authorUrn: string,
  visibility: 'PUBLIC' | 'LOGGED_IN' | 'CONNECTIONS' = 'PUBLIC',
): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  try {
    const initRes = await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'LinkedIn-Version': '202604', 'X-Restli-Protocol-Version': '2.0.0' },
      body: JSON.stringify({ initializeUploadRequest: { owner: authorUrn } }),
    })
    if (!initRes.ok) return { success: false, error: `Image init failed (${initRes.status}): ${await initRes.text()}` }
    const { value: initData } = await initRes.json()
    const uploadUrl = initData.uploadUrl as string
    const imageUrn  = initData.image as string
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body: imageBuffer as any,
    })
    if (!uploadRes.ok) return { success: false, error: `Image upload failed (${uploadRes.status}): ${await uploadRes.text()}` }
    const postRes = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'LinkedIn-Version': '202604', 'X-Restli-Protocol-Version': '2.0.0' },
      body: JSON.stringify({
        author: authorUrn, commentary: caption, visibility,
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        content: { media: { id: imageUrn } },
        lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false,
      }),
    })
    if (!postRes.ok) return { success: false, error: `Post create failed (${postRes.status}): ${await postRes.text()}` }
    const location = postRes.headers.get('location') ?? ''
    const liPostId = decodeURIComponent(location.split('/').pop() ?? location)
    return { success: true, postId: liPostId, url: liPostId ? `https://www.linkedin.com/feed/update/${liPostId}/` : undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

async function deleteLinkedInPost(linkedinPostId: string, accessToken: string): Promise<void> {
  try {
    const normalizedId = encodeURIComponent(decodeURIComponent(linkedinPostId))
    const res = await fetch(`https://api.linkedin.com/rest/posts/${normalizedId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}`, 'LinkedIn-Version': '202604', 'X-Restli-Protocol-Version': '2.0.0' },
    })
    if (!res.ok && res.status !== 404) {
      await fetch(`https://api.linkedin.com/v2/ugcPosts/${encodeURIComponent(linkedinPostId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}`, 'X-Restli-Protocol-Version': '2.0.0' },
      })
    }
  } catch (err) {
    console.warn('[free-form/publish] Delete preview post failed (non-fatal):', err)
  }
}
