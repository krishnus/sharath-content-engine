import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAnthropicClient, MODEL, MAX_TOKENS, parseGenerationMetadata, countWords } from '@/lib/anthropic/client'
import { buildFreeFormPostPrompt, buildFreeFormSystemPrompt } from '@/lib/anthropic/free-form-prompt'
import type { PostFormat, PostPillar } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { postId, userPrompt, format, pillar, feedback, stream = true } = await req.json() as {
    postId: string
    userPrompt: string
    format: PostFormat
    pillar: PostPillar | null
    feedback?: string | null
    stream?: boolean
  }

  // ── Fetch active voice rules ─────────────────────────────────────────
  const { data: voiceRules } = await supabase
    .from('voice_rules')
    .select('*')
    .eq('active', true)
    .order('approved_at', { ascending: true })

  // Fetch previous draft content when feedback is provided
  let previousDraftExcerpt: string | null = null
  if (feedback?.trim()) {
    const { data: existingDrafts } = await supabase
      .from('free_form_drafts')
      .select('content, version')
      .eq('post_id', postId)
      .eq('is_original', false)
      .order('version', { ascending: false })
      .limit(1)
    if (existingDrafts?.[0]?.content) {
      previousDraftExcerpt = existingDrafts[0].content.slice(0, 800)
    }
  }

  const systemPrompt = buildFreeFormSystemPrompt(voiceRules ?? [])
  const userMsg      = buildFreeFormPostPrompt({ userPrompt, format, pillar, feedback, previousDraftExcerpt })

  // ── Streaming path ────────────────────────────────────────────────────
  if (stream) {
    const streamObj = await getAnthropicClient().messages.stream({
      model:      MODEL,
      max_tokens: MAX_TOKENS,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userMsg }],
    })

    let fullText = ''
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of streamObj) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            fullText += chunk.delta.text
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }
        await saveDrafts(supabase, postId, fullText)
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

  // ── Non-streaming path ───────────────────────────────────────────────
  const message = await getAnthropicClient().messages.create({
    model:      MODEL,
    max_tokens: MAX_TOKENS,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: userMsg }],
  })

  const rawText = message.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  await saveDrafts(supabase, postId, rawText)
  const meta = parseGenerationMetadata(rawText)

  return NextResponse.json({
    content:  meta.content,
    wordCount: meta.wordCount,
  })
}

// ── Save draft versions (mirrors /api/generate saveDrafts) ──────────────────
async function saveDrafts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  postId: string,
  rawText: string
) {
  const meta = parseGenerationMetadata(rawText)

  const { data: existing } = await supabase
    .from('free_form_drafts')
    .select('version, is_original')
    .eq('post_id', postId)
    .order('version', { ascending: false })

  const maxVersion  = existing?.[0]?.version ?? 0
  const hasOriginal = existing?.some((d: { is_original: boolean }) => d.is_original) ?? false

  if (!hasOriginal) {
    await supabase.from('free_form_drafts').insert({
      post_id:    postId,
      version:    1,
      content:    rawText,
      word_count: countWords(rawText),
      is_original: true,
    })
  }

  const insertVersion = hasOriginal ? maxVersion + 1 : 2
  await supabase.from('free_form_drafts').insert({
    post_id:    postId,
    version:    insertVersion,
    content:    meta.content,
    word_count: meta.wordCount,
    is_original: false,
  })

  await supabase
    .from('free_form_posts')
    .update({ status: 'draft', hashtags: meta.hashtags, updated_at: new Date().toISOString() })
    .eq('id', postId)
}
