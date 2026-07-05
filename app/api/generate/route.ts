import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAnthropicClient, MODEL, MAX_TOKENS, parseGenerationMetadata } from '@/lib/anthropic/client'
import {
  MASTER_SYSTEM_PROMPT,
  buildNarrativeContext,
  buildVoiceRulesBlock,
  buildGeneratePostPrompt,
} from '@/lib/anthropic/prompts'
import { buildSaturdayMarketInsightsPrompt } from '@/lib/anthropic/saturday-prompt'
import { fetchMarketSnapshot } from '@/lib/utils/market-data'
import type { PostDay, PostPillar, PostFormat, NarrativePosition } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const maxDuration = 60

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
    feedback?: string | null
    stream?: boolean
  }

  // ── 1. Fetch active voice rules ──────────────────────────────────
  const { data: voiceRules } = await supabase
    .from('voice_rules')
    .select('*')
    .eq('active', true)
    .order('approved_at', { ascending: true })

  // ── 2. Fetch narrative context + performance insights ───────────
  const [prevStoryLogResult, weekResult, insightResult] = await Promise.all([
    supabase
      .from('story_log')
      .select('core_insight, thread_planted, references_used, posts(day, weeks(week_start))')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('weeks')
      .select('open_thread, week_start')
      .eq('id', body.weekId)
      .single(),
    supabase
      .from('performance_insights')
      .select('insights')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const prevStoryLog = prevStoryLogResult.data
  const week         = weekResult.data

  // Extract insights relevant to this post's pillar / format
  let performanceInsights: string | null = null
  if (insightResult.data?.insights) {
    type InsightItem = { category: string; insight: string; recommendation: string; confidence: string }
    const allInsights = insightResult.data.insights as InsightItem[]
    const pillarKey  = body.pillar.replace(/_/g, ' ')
    const formatKey  = body.format.replace(/_/g, ' ')
    const relevant   = allInsights
      .filter(i => {
        const text = `${i.insight} ${i.recommendation}`.toLowerCase()
        return text.includes(pillarKey) || text.includes(formatKey) || i.category === 'growth'
      })
      .slice(0, 3)
    if (relevant.length > 0) {
      performanceInsights = relevant.map(i => `• ${i.insight}\n  → ${i.recommendation}`).join('\n')
    }
  }

  // Timing = difference in days between the two posts' planned calendar dates
  // (not approved_at — Sharath may batch-approve posts in one session)
  type PrevPostJoin = { day: string; weeks: Array<{ week_start: string }> | { week_start: string } | null }
  const rawPosts = prevStoryLog?.posts as Array<PrevPostJoin> | PrevPostJoin | null
  const prevPost = Array.isArray(rawPosts) ? rawPosts[0] : rawPosts
  const rawWeeks = prevPost?.weeks
  const prevWeekStart = Array.isArray(rawWeeks) ? rawWeeks[0]?.week_start : rawWeeks?.week_start

  const DAY_OFFSET: Record<string, number> = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5 }
  let previousPostTiming: string | null = null
  if (prevWeekStart && prevPost?.day && week?.week_start) {
    const prevDate = new Date(`${prevWeekStart}T00:00:00`)
    prevDate.setDate(prevDate.getDate() + (DAY_OFFSET[prevPost.day] ?? 0))
    const curDate = new Date(`${week.week_start}T00:00:00`)
    curDate.setDate(curDate.getDate() + (DAY_OFFSET[body.day] ?? 0))
    const diffDays = Math.round((curDate.getTime() - prevDate.getTime()) / 86400000)
    previousPostTiming = computeRelativeTiming(diffDays)
  }

  // ── 3. Build system prompt ───────────────────────────────────────
  const voiceRulesBlock = buildVoiceRulesBlock(voiceRules ?? [])
  const systemPrompt = [MASTER_SYSTEM_PROMPT, voiceRulesBlock].filter(Boolean).join('\n\n')

  // ── 3b. Fetch live market snapshot for financial_intelligence pillar ──
  let marketSnapshot: string | null = null
  if (body.pillar === 'financial_intelligence') {
    try {
      marketSnapshot = await fetchMarketSnapshot()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Market data temporarily unavailable.'
      return NextResponse.json({ error: `${msg} Please try again in a few minutes.` }, { status: 503 })
    }
  }

  // ── 4. Build user prompt ─────────────────────────────────────────
  let userPrompt: string

  if (body.format === 'market_insights') {
    userPrompt = buildSaturdayMarketInsightsPrompt({
      marketContext:   body.marketContext ?? '',
      marketSnapshot:  marketSnapshot ?? '',
      theme:           body.theme,
      quarter:         body.quarter,
      openThread:      week?.open_thread ?? null,
      targetWordCount: body.targetWordCount,
    })
  } else {
    const narrativeContext = buildNarrativeContext({
      previousPostInsight: prevStoryLog?.core_insight ?? null,
      previousPostTiming,
      openThread:          week?.open_thread ?? null,
      narrativePosition:   body.narrativePosition,
      quarter:             body.quarter,
      recentReferences:    prevStoryLog?.references_used ?? undefined,
      performanceInsights,
    })

    userPrompt = buildGeneratePostPrompt({
      day:                  body.day,
      pillar:               body.pillar,
      format:               body.format,
      theme:                body.theme,
      targetAudience:       body.targetAudience,
      targetWordCount:      body.targetWordCount,
      hookIdea:             body.hookIdea,
      narrativeContext,
      feedback:             body.feedback ?? null,
      marketSnapshot,
    })
  }

  // ── 5. Stream ────────────────────────────────────────────────────
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
        await saveDrafts(supabase, body.postId, fullText)
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

  await supabase.from('posts').update({ status: 'draft' }).eq('id', body.postId)

  return NextResponse.json({
    draftId:         savedDraftId,
    content:         meta.content,
    wordCount:       meta.wordCount,
    linkedinCaption: meta.linkedinCaption,
    quote:           meta.quote,
  })
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
    // Save rawText (not meta.content) so getMetaField() in the posts route can extract
    // LINKEDIN_CAPTION, QUOTE, CORE_INSIGHT etc. from the original draft at any time.
    // Auto-save never touches version 1, so this metadata is preserved across edits.
    await supabase.from('drafts').insert({
      post_id:    postId,
      version:    1,
      content:    rawText,
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

  // Persist status + hashtags together so they survive page reloads / regenerations
  await supabase
    .from('posts')
    .update({ status: 'draft', hashtags: meta.hashtags })
    .eq('id', postId)

  return { savedDraftId: newDraft?.id ?? '' }
}


function computeRelativeTiming(diffDays: number): string {
  if (diffDays <= 0) return 'earlier'
  if (diffDays === 1) return 'yesterday'
  if (diffDays <= 6) return `${diffDays} days ago`
  if (diffDays <= 13) return 'last week'
  if (diffDays <= 20) return '2 weeks ago'
  return `${Math.floor(diffDays / 7)} weeks ago`
}
