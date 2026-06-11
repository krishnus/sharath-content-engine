import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAnthropicClient, MODEL, MAX_TOKENS, parseGenerationMetadata } from '@/lib/anthropic/client'
import {
  MASTER_SYSTEM_PROMPT,
  buildNarrativeContext,
  buildVoiceRulesBlock,
  buildGeneratePostPrompt,
  buildLinkedInExcerptPrompt,
} from '@/lib/anthropic/prompts'
import { buildSaturdayMarketInsightsPrompt } from '@/lib/anthropic/saturday-prompt'
import type { PostDay, PostPillar, PostFormat, NarrativePosition } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const maxDuration = 60

// Long-form days that need a LinkedIn excerpt (feed post ≤ 3000 chars)
const LONG_FORM_DAYS: PostDay[] = ['monday', 'wednesday']

export async function POST(req: NextRequest) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json() as {
    postId: string
    weekId: string
    day: PostDay
    pillar: PostPillar
    format: PostFormat
    theme: string
    targetAudience: string
    targetWordCount: number
    hookIdea?: string | null
    narrativePosition: NarrativePosition
    quarter: string
    marketContext?: string
    stream?: boolean
  }

  // ── 1. Fetch active voice rules ──────────────────────────────────
  const { data: voiceRules } = await supabase
    .from('voice_rules')
    .select('*')
    .eq('active', true)
    .order('approved_at', { ascending: true })

  // ── 2. Fetch narrative context ───────────────────────────────────
  const { data: prevStoryLog } = await supabase
    .from('story_log')
    .select('core_insight, thread_planted, references_used')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: week } = await supabase
    .from('weeks')
    .select('open_thread')
    .eq('id', body.weekId)
    .single()

  // ── 3. Build system prompt ───────────────────────────────────────
  const voiceRulesBlock = buildVoiceRulesBlock(voiceRules ?? [])
  const systemPrompt = [MASTER_SYSTEM_PROMPT, voiceRulesBlock].filter(Boolean).join('\n\n')

  // ── 4. Build user prompt ─────────────────────────────────────────
  let userPrompt: string

  if (body.format === 'market_insights' && body.marketContext) {
    userPrompt = buildSaturdayMarketInsightsPrompt({
      marketContext:   body.marketContext,
      theme:           body.theme,
      quarter:         body.quarter,
      openThread:      week?.open_thread ?? null,
      targetWordCount: body.targetWordCount,
    })
  } else {
    const narrativeContext = buildNarrativeContext({
      previousPostInsight: prevStoryLog?.core_insight ?? null,
      openThread:          week?.open_thread ?? null,
      narrativePosition:   body.narrativePosition,
      quarter:             body.quarter,
      recentReferences:    prevStoryLog?.references_used ?? undefined,
    })

    userPrompt = buildGeneratePostPrompt({
      day:             body.day,
      pillar:          body.pillar,
      format:          body.format,
      theme:           body.theme,
      targetAudience:  body.targetAudience,
      targetWordCount: body.targetWordCount,
      hookIdea:        body.hookIdea,
      narrativeContext,
    })
  }

  const isLongForm = LONG_FORM_DAYS.includes(body.day) && body.format === 'long_form_article'

  // ── 5. Stream (full article only — excerpt generated after) ──────
  if (body.stream !== false) {
    const stream = await getAnthropicClient().messages.stream({
      model:      MODEL,
      max_tokens: MAX_TOKENS,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userPrompt }],
    })

    let fullText = ''
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            fullText += chunk.delta.text
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }

        // Save the full article draft
        const { savedDraftId } = await saveDrafts(supabase, body.postId, fullText)

        // For long-form posts: generate + attach the LinkedIn excerpt asynchronously
        // (does not block streaming; fires after the stream closes)
        if (isLongForm) {
          generateAndSaveExcerpt(supabase, savedDraftId, fullText, systemPrompt).catch(err =>
            console.error('[generate] Excerpt generation failed (non-fatal):', err)
          )
        }

        controller.close()
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type':    'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    })
  }

  // ── 6. Non-streaming path ────────────────────────────────────────
  const message = await getAnthropicClient().messages.create({
    model:      MODEL,
    max_tokens: MAX_TOKENS,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: userPrompt }],
  })

  const rawText = message.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  const { savedDraftId } = await saveDrafts(supabase, body.postId, rawText)
  const meta = parseGenerationMetadata(rawText)

  // For long-form posts: generate the LinkedIn excerpt synchronously
  let linkedinExcerpt: string | null = null
  if (isLongForm) {
    linkedinExcerpt = await generateAndSaveExcerpt(
      supabase, savedDraftId, rawText, systemPrompt
    )
  }

  await supabase
    .from('posts')
    .update({ status: 'draft' })
    .eq('id', body.postId)

  return NextResponse.json({
    draftId:        savedDraftId,
    content:        meta.content,
    wordCount:      meta.wordCount,
    linkedinExcerpt,
  })
}


// ── Generate and persist the LinkedIn excerpt for long-form posts ────
// Returns the excerpt text (or null on failure).
async function generateAndSaveExcerpt(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  draftId: string,
  fullArticleRaw: string,
  systemPrompt: string,
): Promise<string | null> {
  try {
    const meta = parseGenerationMetadata(fullArticleRaw)
    const excerptPrompt = buildLinkedInExcerptPrompt(meta.content)

    const message = await getAnthropicClient().messages.create({
      model:      MODEL,
      max_tokens: 1024,   // Excerpt is short — cap tokens tightly
      system:     systemPrompt,
      messages:   [{ role: 'user', content: excerptPrompt }],
    })

    const excerpt = message.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')
      .trim()

    if (!excerpt) return null

    // Persist into the drafts row
    await supabase
      .from('drafts')
      .update({ linkedin_excerpt: excerpt })
      .eq('id', draftId)

    return excerpt
  } catch (err) {
    console.error('[generate] generateAndSaveExcerpt error:', err)
    return null
  }
}


// ── Save all draft versions (never delete old ones) ──────────────────
async function saveDrafts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  postId: string,
  rawText: string
): Promise<{ savedDraftId: string }> {
  const meta = parseGenerationMetadata(rawText)

  const { data: existing } = await supabase
    .from('drafts')
    .select('version, is_original')
    .eq('post_id', postId)
    .order('version', { ascending: false })

  const maxVersion  = existing?.[0]?.version ?? 0
  const hasOriginal = existing?.some((d: { is_original: boolean }) => d.is_original) ?? false

  if (!hasOriginal) {
    await supabase.from('drafts').insert({
      post_id:    postId,
      version:    1,
      content:    meta.content,
      word_count: meta.wordCount,
      is_original: true,
    })
  }

  const insertVersion = hasOriginal ? maxVersion + 1 : 2
  const { data: newDraft } = await supabase
    .from('drafts')
    .insert({
      post_id:    postId,
      version:    insertVersion,
      content:    meta.content,
      word_count: meta.wordCount,
      is_original: false,
    })
    .select('id')
    .single()

  await supabase.from('posts').update({ status: 'draft' }).eq('id', postId)

  return { savedDraftId: newDraft?.id ?? '' }
}
