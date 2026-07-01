import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateArticlePDF } from '@/lib/templates/article-pdf'
import { generateCarouselPDF, parseCarouselSlides } from '@/lib/templates/carousel-pdf'
import { generateQuoteImage } from '@/lib/templates/quote-image'
import { parseGenerationMetadata } from '@/lib/anthropic/client'
import { format } from 'date-fns'

export const runtime = 'nodejs'
export const maxDuration = 60

const STORAGE_BUCKET = 'post-media'

type MediaType = 'article_pdf' | 'carousel_pdf' | 'quote_png'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const {
    postId, mediaType, customTitle, customQuote, linkedinCaptionOverride,
    showHeaderStrip, showFooterStrip,
  } = await req.json() as {
    postId: string
    mediaType: MediaType
    customTitle?: string
    customQuote?: string
    linkedinCaptionOverride?: string
    showHeaderStrip?: boolean       // article_pdf: blue band behind the post title
    showFooterStrip?: boolean       // article_pdf: blue band in the footer
  }

  // ── Fetch post + current draft ────────────────────────────────────────
  const { data: post, error: postError } = await supabase
    .from('posts')
    .select(`
      id, day, pillar, format, week_id, hook_idea,
      drafts ( id, content, is_original, version ),
      weeks ( week_number, year, week_start, theme, quarter )
    `)
    .eq('id', postId)
    .single()

  if (postError || !post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  // Pick the most recent non-original draft
  const drafts = post.drafts as Array<{ id: string; content: string; is_original: boolean; version: number }>
  const currentDraft = drafts
    ?.filter(d => !d.is_original)
    ?.sort((a, b) => b.version - a.version)[0]
    ?? drafts?.[0]

  if (!currentDraft?.content?.trim()) {
    return NextResponse.json({ error: 'No draft content found' }, { status: 400 })
  }

  // weeks is returned as an array by supabase join — take first element
  type WeekRow = { week_number: number; year: number; week_start: string; theme: string | null; quarter: string | null }
  const weeksArr = post.weeks as Array<WeekRow>
  const week: WeekRow | null = Array.isArray(weeksArr) ? (weeksArr[0] ?? null) : (post.weeks as unknown as WeekRow | null)

  if (!week) {
    return NextResponse.json({ error: 'Week data not found for this post' }, { status: 404 })
  }

  const meta = parseGenerationMetadata(currentDraft.content)

  // Caption priority: user-edited override > original draft LINKEDIN_CAPTION: > current draft metadata
  let linkedinCaption = linkedinCaptionOverride || meta.linkedinCaption
  if (!linkedinCaption) {
    const originalDraft = drafts?.find(d => d.is_original)
    if (originalDraft) {
      linkedinCaption = parseGenerationMetadata(originalDraft.content).linkedinCaption
    }
  }

  const weekDateStr = format(new Date(`${week.week_start}T00:00:00`), 'd MMM yyyy')

  const pillar: string = post.pillar as string
  const isFinancePillar = pillar === 'financial_intelligence'

  let fileBuffer: Buffer
  let fileName: string
  let mimeType: string
  let pageCount: number | undefined

  // ── Generate the media ───────────────────────────────────────────────
  try {
    if (mediaType === 'article_pdf') {
      // Title: use the planned hook_idea (article angle set during planning),
      // fall back to CORE_INSIGHT from the generated metadata, then a generic label
      const hookIdea = (post as unknown as { hook_idea: string | null }).hook_idea
      // Priority: user-confirmed title > AI-generated ARTICLE_TITLE > week plan hook_idea > CORE_INSIGHT
      const rawTitle = customTitle || meta.articleTitle || hookIdea || meta.coreInsight || 'Weekly Article'
      // Truncate at the last word boundary before 80 chars to avoid mid-word cuts
      const title = truncateAtWord(rawTitle || '', 80)

      fileBuffer = await generateArticlePDF({
        title,
        content:          currentDraft.content,
        pillar,
        quarter:          week.quarter ?? 'Q1',
        weekNumber:       week.week_number,
        dateStr:          weekDateStr,
        showHeaderStrip:  showHeaderStrip !== false,   // default true
        showFooterStrip:  showFooterStrip !== false,   // default true
      })
      fileName  = `${toSlug(rawTitle, 4)}-by-CoachSharath.pdf`
      mimeType  = 'application/pdf'
      pageCount = undefined   // react-pdf doesn't expose page count at generation time

    } else if (mediaType === 'carousel_pdf') {
      const { titleSlide, slides } = parseCarouselSlides(currentDraft.content)
      pageCount = slides.length + 1   // cover + content slides (last = closing slide)

      fileBuffer = await generateCarouselPDF({
        theme:         week.theme ?? 'Weekly Insights',
        titleSlide:    titleSlide || (week.theme ?? 'Weekly Insights'),
        slides,
        pillar,
        seriesLabel:   meta.seriesLabel ?? undefined,
        seriesCount:   meta.seriesCount ?? undefined,
        quarter:       week.quarter ?? 'Q1',
        weekNumber:    week.week_number,
        useSwansLogo:  isFinancePillar,
      })
      fileName = `${toSlug(week.theme ?? 'weekly-insights', 4)}-by-CoachSharath.pdf`
      mimeType = 'application/pdf'

    } else if (mediaType === 'quote_png') {
      const quote = customQuote || meta.quote || extractFallbackQuote(meta.content)

      fileBuffer = await generateQuoteImage({
        quote,
        authorName:   'Coach Sharath',
        pillar,
        useSwansLogo: isFinancePillar,
      })
      fileName = `${toSlug(quote ?? '', 4)}-by-CoachSharath.png`
      mimeType = 'image/png'

    } else {
      return NextResponse.json({ error: `Unknown media type: ${mediaType}` }, { status: 400 })
    }
  } catch (err) {
    console.error('[media/generate] Template generation failed:', err)
    return NextResponse.json(
      { error: `Template generation failed: ${err instanceof Error ? err.message : 'Unknown error'}` },
      { status: 500 }
    )
  }

  // ── Upload to Supabase Storage ────────────────────────────────────────
  const storagePath = `posts/${postId}/${mediaType}/${fileName}`

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: mimeType,
      upsert:      true,
    })

  if (uploadError) {
    console.error('[media/generate] Storage upload failed:', uploadError)
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
  }

  // ── Upsert post_media record ──────────────────────────────────────────
  const { data: record, error: dbError } = await supabase
    .from('post_media')
    .upsert({
      post_id:          postId,
      media_type:       mediaType,
      storage_path:     storagePath,
      file_name:        fileName,
      file_size:        fileBuffer.length,
      page_count:       pageCount ?? null,
      linkedin_caption: linkedinCaption ?? null,
      updated_at:       new Date().toISOString(),
    }, { onConflict: 'post_id,media_type' })
    .select('id')
    .single()

  if (dbError) {
    console.error('[media/generate] DB upsert failed:', dbError)
    return NextResponse.json({ error: `DB error: ${dbError.message}` }, { status: 500 })
  }

  // ── Return signed URL for immediate preview ───────────────────────────
  const { data: signedUrl } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, 3600)  // 1 hour

  return NextResponse.json({
    id:              record.id,
    mediaType,
    fileName,
    fileSize:        fileBuffer.length,
    pageCount:       pageCount ?? null,
    signedUrl:       signedUrl?.signedUrl ?? null,
    linkedinCaption: linkedinCaption ?? null,
  })
}

// ── First-N-words slug for branding filenames ─────────────────────────
// e.g. "The Weight of Unfinished Conversations" → "the-weight-of-unfinished"
function toSlug(text: string, maxWords = 4): string {
  const slug = text
    .trim()
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords)
    .map(w => w.toLowerCase())
    .join('-')
  return slug || 'untitled'
}

// ── Truncate at the last word boundary before max chars ───────────────
function truncateAtWord(str: string, max: number): string {
  if (str.length <= max) return str
  const lastSpace = str.lastIndexOf(' ', max)
  return lastSpace > max * 0.5 ? str.slice(0, lastSpace) : str.slice(0, max)
}

// ── Fallback: pick the most quotable sentence ──────────────────────────
function extractFallbackQuote(content: string): string {
  const sentences = content
    .split(/[.!?]/)
    .map(s => s.trim())
    .filter(s => s.length >= 30 && s.length <= 120)
  // Prefer sentences in the middle of the piece (not opening logistics)
  const candidates = sentences.slice(Math.floor(sentences.length * 0.2))
  return candidates[0] ?? content.slice(0, 120)
}
