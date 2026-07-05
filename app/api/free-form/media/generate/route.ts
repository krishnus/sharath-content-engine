import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateArticlePDF } from '@/lib/templates/article-pdf'
import { generateCarouselPDF, parseCarouselSlides } from '@/lib/templates/carousel-pdf'
import { generateQuoteImage } from '@/lib/templates/quote-image'
import { parseGenerationMetadata } from '@/lib/anthropic/client'

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
    showHeaderStrip?: boolean
    showFooterStrip?: boolean
  }

  // ── Fetch post + current draft ────────────────────────────────────────
  const { data: post, error: postError } = await supabase
    .from('free_form_posts')
    .select('id, format, pillar')
    .eq('id', postId)
    .single()

  if (postError || !post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  const { data: drafts } = await supabase
    .from('free_form_drafts')
    .select('id, content, is_original, is_approved, version')
    .eq('post_id', postId)
    .order('version', { ascending: false })

  const nonOriginals   = (drafts ?? []).filter(d => !d.is_original)
  const approvedDraft  = nonOriginals.find(d => d.is_approved)
  const currentDraft   = approvedDraft ?? nonOriginals[0] ?? (drafts ?? [])[0]
  const originalDraft  = (drafts ?? []).find(d => d.is_original)

  if (!currentDraft?.content?.trim()) {
    return NextResponse.json({ error: 'No draft content found' }, { status: 400 })
  }

  const meta = parseGenerationMetadata(currentDraft.content)

  let linkedinCaption = linkedinCaptionOverride || meta.linkedinCaption
  if (!linkedinCaption && originalDraft) {
    linkedinCaption = parseGenerationMetadata(originalDraft.content).linkedinCaption
  }

  const pillar: string = (post.pillar as string | null) ?? 'coaching_transformation'
  const isFinancePillar = pillar === 'financial_intelligence'

  let fileBuffer: Buffer
  let fileName: string
  let mimeType: string
  let pageCount: number | undefined

  try {
    if (mediaType === 'article_pdf') {
      const rawTitle = customTitle || meta.articleTitle || meta.coreInsight || 'Article'
      const title = truncateAtWord(rawTitle, 80)
      fileBuffer = await generateArticlePDF({
        title,
        content:         meta.content,
        pillar,
        quarter:         'Q1',
        weekNumber:      0,
        dateStr:         new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        showHeaderStrip: showHeaderStrip !== false,
        showFooterStrip: showFooterStrip !== false,
      })
      fileName  = `${toSlug(rawTitle, 4)}-by-CoachSharath.pdf`
      mimeType  = 'application/pdf'

    } else if (mediaType === 'carousel_pdf') {
      const { titleSlide, slides } = parseCarouselSlides(currentDraft.content)
      pageCount = slides.length + 1
      fileBuffer = await generateCarouselPDF({
        theme:        'Random Post',
        titleSlide:   titleSlide || 'Insights',
        slides,
        pillar,
        seriesLabel:  meta.seriesLabel ?? undefined,
        seriesCount:  meta.seriesCount ?? undefined,
        quarter:      'Q1',
        weekNumber:   0,
        useSwansLogo: isFinancePillar,
      })
      fileName = `${toSlug(titleSlide || 'insights', 4)}-by-CoachSharath.pdf`
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
    console.error('[free-form/media/generate] Template generation failed:', err)
    return NextResponse.json(
      { error: `Template generation failed: ${err instanceof Error ? err.message : 'Unknown error'}` },
      { status: 500 }
    )
  }

  // ── Upload to Supabase Storage ────────────────────────────────────────
  const storagePath = `free-form/${postId}/${mediaType}/${fileName}`
  const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, fileBuffer, {
    contentType: mimeType, upsert: true,
  })
  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
  }

  // ── Upsert free_form_media record ────────────────────────────────────
  const { data: record, error: dbError } = await supabase
    .from('free_form_media')
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
    return NextResponse.json({ error: `DB error: ${dbError.message}` }, { status: 500 })
  }

  const { data: signedUrl } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(storagePath, 3600)

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

function toSlug(text: string, maxWords = 4): string {
  const slug = text.trim().replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(Boolean)
    .slice(0, maxWords).map(w => w.toLowerCase()).join('-')
  return slug || 'untitled'
}

function truncateAtWord(str: string, max: number): string {
  if (str.length <= max) return str
  const lastSpace = str.lastIndexOf(' ', max)
  return lastSpace > max * 0.5 ? str.slice(0, lastSpace) : str.slice(0, max)
}

function extractFallbackQuote(content: string): string {
  const sentences = content.split(/[.!?]/).map(s => s.trim()).filter(s => s.length >= 30 && s.length <= 120)
  const candidates = sentences.slice(Math.floor(sentences.length * 0.2))
  return candidates[0] ?? content.slice(0, 120)
}
