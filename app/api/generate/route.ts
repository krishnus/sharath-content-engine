import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAnthropicClient, MODEL, MAX_TOKENS, parseGenerationMetadata } from '@/lib/anthropic/client'
import {
  MASTER_SYSTEM_PROMPT,
  buildNarrativeContext,
  buildVoiceRulesBlock,
  buildGeneratePostPrompt,
} from '@/lib/anthropic/prompts'
import type { PostDay, PostPillar, PostFormat, NarrativePosition } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = createClient()

  // Auth check
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
    stream?: boolean
  }

  // ── 1. Fetch active voice rules ──────────────────────────────────
  const { data: voiceRules } = await supabase
    .from('voice_rules')
    .select('*')
    .eq('active', true)
    .order('approved_at', { ascending: true })

  // ── 2. Fetch narrative context (previous post's story log) ───────
  // Get the most recently approved post before this week/day
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

  // ── 3. Build prompts ─────────────────────────────────────────────
  const narrativeContext = buildNarrativeContext({
    previousPostInsight: prevStoryLog?.core_insight ?? null,
    openThread: week?.open_thread ?? null,
    narrativePosition: body.narrativePosition,
    quarter: body.quarter,
    recentReferences: prevStoryLog?.references_used ?? undefined,
  })

  const voiceRulesBlock = buildVoiceRulesBlock(voiceRules ?? [])

  const systemPrompt = [
    MASTER_SYSTEM_PROMPT,
    voiceRulesBlock,
  ].filter(Boolean).join('\n\n')

  const userPrompt = buildGeneratePostPrompt({
    day: body.day,
    pillar: body.pillar,
    format: body.format,
    theme: body.theme,
    targetAudience: body.targetAudience,
    targetWordCount: body.targetWordCount,
    hookIdea: body.hookIdea,
    narrativeContext,
  })

  // ── 4. Stream response from Anthropic ───────────────────────────
  if (body.stream !== false) {
    const stream = await getAnthropicClient().messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    // Collect full text to save to DB after streaming
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
        // Save to DB after stream completes
        await saveDrafts(supabase, body.postId, fullText)
        controller.close()
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    })
  }

  // ── 5. Non-streaming fallback ────────────────────────────────────
  const message = await getAnthropicClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const rawText = message.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  const { savedDraftId } = await saveDrafts(supabase, body.postId, rawText)
  const meta = parseGenerationMetadata(rawText)

  return NextResponse.json({
    draftId: savedDraftId,
    content: meta.content,
    wordCount: meta.wordCount,
  })
}


// ── Helper: save drafts — keeps ALL versions for comparison ───────────
async function saveDrafts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  postId: string,
  rawText: string
): Promise<{ savedDraftId: string }> {
  const meta = parseGenerationMetadata(rawText)

  // Get the highest version number for this post
  const { data: existing } = await supabase
    .from('drafts')
    .select('version, is_original')
    .eq('post_id', postId)
    .order('version', { ascending: false })

  const maxVersion    = existing?.[0]?.version ?? 0
  const hasOriginal   = existing?.some((d: { is_original: boolean }) => d.is_original) ?? false
  const nextVersion   = maxVersion + 1

  // Save original (version 1, immutable) only on first generation
  if (!hasOriginal) {
    await supabase.from('drafts').insert({
      post_id:    postId,
      version:    1,
      content:    meta.content,
      word_count: meta.wordCount,
      is_original: true,
    })
  }

  // Save new version — every regeneration gets its own version
  const insertVersion = hasOriginal ? nextVersion : 2
  const { data: newDraft } = await supabase
    .from('drafts')
    .insert({
      post_id:     postId,
      version:     insertVersion,
      content:     meta.content,
      word_count:  meta.wordCount,
      is_original: false,
    })
    .select('id')
    .single()

  // Update post status to 'draft'
  await supabase
    .from('posts')
    .update({ status: 'draft' })
    .eq('id', postId)

  return { savedDraftId: newDraft?.id ?? '' }
}
