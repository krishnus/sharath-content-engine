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

  const { postId, mediaType, customTitle, customQuote, linkedinCaptionOverride } = await req.json() as {
    postId: string
    mediaType: MediaType
    customTitle?: string            // user-confirmed title override for article_pdf
    customQuote?: string            // user-confirmed quote override for quote_png
    linkedinCaptionOverride?: string // user-edited caption for the LinkedIn post
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
      const rawTitle = customTitle || hookIdea || meta.coreInsight || 'Weekly Article'
      const title = rawTitle.length > 100 ? rawTitle.slice(0, 97) + '...' : rawTitle

      fileBuffer = await generateArticlePDF({
        title,
        content:     currentDraft.content,
        pillar,
        quarter:     week.quarter ?? 'Q1',
        weekNumber:  week.week_number,
        dateStr:     weekDateStr,
      })
      fileName  = `article-wk${week.week_number}.pdf`
      mimeType  = 'application/pdf'
      pageCount = undefined   // react-pdf doesn't expose page count at generation time

    } else if (mediaType === 'carousel_pdf') {
      const { titleSlide, slides } = parseCarouselSlides(currentDraft.content)
      pageCount = slides.length + 2   // title + content slides + CTA

      fileBuffer = await generateCarouselPDF({
        theme:         week.theme ?? 'Weekly Insights',
        titleSlide:    titleSlide || (week.theme ?? 'Weekly Insights'),
        slides,
        pillar,
        quarter:       week.quarter ?? 'Q1',
        weekNumber:    week.week_number,
        useSwansLogo:  isFinancePillar,
      })
      fileName = `carousel-wk${week.week_number}.pdf`
      mimeType = 'application/pdf'

    } else if (mediaType === 'quote_png') {
      const quote = customQuote || meta.quote || extractFallbackQuote(meta.content)

      fileBuffer = await generateQuoteImage({
        quote,
        authorName:   'Coach Sharath',
        pillar,
        useSwansLogo: isFinancePillar,
      })
      fileName = `quote-wk${week.week_number}.png`
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
