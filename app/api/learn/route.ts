import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAnthropicClient, MODEL } from '@/lib/anthropic/client'
import { buildEditDiffPrompt, buildStoryLogExtractionPrompt } from '@/lib/anthropic/prompts'
import type { RuleCategory } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const maxDuration = 60

// ── POST /api/learn ──────────────────────────────────────────────────
// Called when Sharath approves an edited post.
// 1. Extracts narrative metadata (story log)
// 2. Diffs original vs. final draft → candidate voice rules
// Returns candidate rules for Sharath to review in the UI.
export async function POST(req: NextRequest) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { postId, draftId } = await req.json() as { postId: string; draftId?: string }

  // ── 1. Fetch original and current drafts ────────────────────────
  const { data: drafts } = await supabase
    .from('drafts')
    .select('*')
    .eq('post_id', postId)
    .order('version', { ascending: true })

  if (!drafts || drafts.length < 2) {
    return NextResponse.json({ candidateRules: [], storyLog: null, message: 'No edit diff found' })
  }

  const original     = drafts.find(d => d.is_original)
  const nonOriginals = drafts.filter(d => !d.is_original)
  // If a specific draft was chosen in the version picker, use it; otherwise default to the latest
  const current = (draftId ? nonOriginals.find(d => d.id === draftId) : null)
    ?? nonOriginals[nonOriginals.length - 1]

  if (!original || !current) {
    return NextResponse.json({ candidateRules: [], storyLog: null })
  }

  const originalContent = original.content
  const finalContent    = current.content

  // ── 2. Check if content actually changed ────────────────────────
  const contentChanged = originalContent.trim() !== finalContent.trim()

  // ── 3. Approve the post immediately — before any Anthropic calls so that a
  //        slow or timed-out LLM call never leaves the post in an unapproved state.
  await supabase
    .from('posts')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', postId)

  await supabase
    .from('drafts')
    .update({ is_approved: false })
    .eq('post_id', postId)
    .eq('is_original', false)
  await supabase
    .from('drafts')
    .update({ is_approved: true })
    .eq('id', current.id)

  // ── 4. Extract story log metadata (always) ──────────────────────
  const storyLogMessage = await getAnthropicClient().messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: buildStoryLogExtractionPrompt(finalContent),
    }],
  })

  let storyLogData: {
    core_insight: string | null
    callback_used: string | null
    thread_planted: string | null
    references_used: { vedic: string[]; banking: string[]; coaching: string[] }
  } | null = null

  const storyLogRaw = storyLogMessage.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  try {
    const cleaned = storyLogRaw.replace(/```json|```/g, '').trim()
    storyLogData = JSON.parse(cleaned)
  } catch {
    console.error('Failed to parse story log JSON:', storyLogRaw)
  }

  // Save story log to DB
  if (storyLogData) {
    await supabase.from('story_log').upsert({
      post_id: postId,
      core_insight:   storyLogData.core_insight,
      callback_used:  storyLogData.callback_used,
      thread_planted: storyLogData.thread_planted,
      references_used: storyLogData.references_used,
    }, { onConflict: 'post_id' })

    // Update open_thread on the week
    if (storyLogData.thread_planted) {
      const { data: post } = await supabase
        .from('posts')
        .select('week_id')
        .eq('id', postId)
        .single()

      if (post) {
        await supabase
          .from('weeks')
          .update({ open_thread: storyLogData.thread_planted })
          .eq('id', post.week_id)
      }
    }
  }

  // ── 5. Extract voice rules (only if content changed) ────────────
  if (!contentChanged) {
    return NextResponse.json({ candidateRules: [], storyLog: storyLogData })
  }

  const diffMessage = await getAnthropicClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: buildEditDiffPrompt(originalContent, finalContent),
    }],
  })

  const diffRaw = diffMessage.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  let candidateRules: Array<{
    category: RuleCategory
    rule_text: string
    example_before: string | null
    example_after: string | null
  }> = []

  try {
    const cleaned = diffRaw.replace(/```json|```/g, '').trim()
    candidateRules = JSON.parse(cleaned)
  } catch {
    console.error('Failed to parse candidate rules JSON:', diffRaw)
  }

  // Drop any rule where before and after are identical — the AI observed a pattern, not an actual edit
  candidateRules = candidateRules.filter(r =>
    !r.example_before ||
    !r.example_after ||
    r.example_before.trim() !== r.example_after.trim()
  )

  return NextResponse.json({ candidateRules, storyLog: storyLogData })
}


// ── POST /api/learn/save ─────────────────────────────────────────────
// Saves approved voice rules to the DB.
export async function PUT(req: NextRequest) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { rules, sourcePostId } = await req.json() as {
    rules: Array<{
      category: RuleCategory
      rule_text: string
      example_before?: string | null
      example_after?: string | null
    }>
    sourcePostId: string
  }

  if (!rules || rules.length === 0) {
    return NextResponse.json({ saved: 0 })
  }

  const { data, error } = await supabase
    .from('voice_rules')
    .insert(
      rules.map(r => ({
        category:       r.category,
        rule_text:      r.rule_text,
        example_before: r.example_before ?? null,
        example_after:  r.example_after ?? null,
        source_post_id: sourcePostId,
        active: true,
        approved_at: new Date().toISOString(),
      }))
    )
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ saved: data?.length ?? 0 })
}
