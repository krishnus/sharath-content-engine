import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAnthropicClient, MODEL } from '@/lib/anthropic/client'
import { buildThreadSynthesisPrompt, type NarrativeLogEntry } from '@/lib/anthropic/prompts'

export const runtime    = 'nodejs'
export const maxDuration = 30

// ── POST /api/weeks/synthesise ───────────────────────────────────────
// Manually re-synthesises the forward thread for a week from all
// narrative posts (Mon/Wed/Thu) that have approved story log entries.
export async function POST(req: NextRequest) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { weekId } = await req.json() as { weekId: string }
  if (!weekId) return NextResponse.json({ error: 'weekId required' }, { status: 400 })

  // Fetch narrative posts for this week that have story_log entries
  const { data: posts } = await supabase
    .from('posts')
    .select('id, day, story_log(core_insight, thread_planted)')
    .eq('week_id', weekId)
    .in('day', ['monday', 'wednesday', 'thursday'])

  type NarrativeRow = {
    id: string
    day: string
    story_log: Array<{ core_insight: string | null; thread_planted: string | null }> | null
  }

  const withLogs = (posts as NarrativeRow[] ?? []).filter(p => {
    const logs = Array.isArray(p.story_log) ? p.story_log : (p.story_log ? [p.story_log] : [])
    return logs.length > 0
  })

  if (withLogs.length === 0) {
    return NextResponse.json(
      { error: 'No approved narrative posts to synthesise from' },
      { status: 400 }
    )
  }

  const { data: rawLogs } = await supabase
    .from('story_log')
    .select('core_insight, thread_planted, posts(day)')
    .in('post_id', withLogs.map(p => p.id))

  const logs: NarrativeLogEntry[] = (rawLogs ?? []).map((l: {
    core_insight: string | null
    thread_planted: string | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    posts: any
  }) => ({
    day:            Array.isArray(l.posts) ? (l.posts[0]?.day ?? '') : (l.posts?.day ?? ''),
    core_insight:   l.core_insight,
    thread_planted: l.thread_planted,
  }))

  const msg = await getAnthropicClient().messages.create({
    model:      MODEL,
    max_tokens: 200,
    messages:   [{ role: 'user', content: buildThreadSynthesisPrompt(logs) }],
  })

  const thread = msg.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim()

  if (!thread) {
    return NextResponse.json({ error: 'Synthesis produced no output' }, { status: 500 })
  }

  await supabase
    .from('weeks')
    .update({ open_thread: thread })
    .eq('id', weekId)

  return NextResponse.json({ open_thread: thread })
}
