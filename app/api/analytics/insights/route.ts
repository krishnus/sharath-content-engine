import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAnthropicClient, MODEL } from '@/lib/anthropic/client'
import { buildPerformanceInsightPrompt } from '@/lib/anthropic/prompts'

export const runtime = 'nodejs'
export const maxDuration = 60

// GET /api/analytics/insights — returns the latest AI-generated insights
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data, error } = await supabase
    .from('performance_insights')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ insight: data ?? null })
}


// POST /api/analytics/insights — generates new AI insights and saves them
export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // Fetch all published posts with performance data
  const { data: publishedPosts, error: postsError } = await supabase
    .from('posts')
    .select(`
      id, day, pillar, format, narrative_position,
      week:weeks ( theme ),
      linkedin_post:linkedin_posts (
        id, published_at,
        performance_data ( source, impressions, likes, comments, reposts, dm_note, fetched_at )
      )
    `)
    .eq('status', 'published')
    .order('approved_at', { ascending: false })

  if (postsError) return NextResponse.json({ error: postsError.message }, { status: 500 })

  // Build enriched post list with merged manual/api data
  type PerfRow = { source: string; impressions: number; likes: number; comments: number; reposts: number; dm_note: string | null; fetched_at: string }
  const enriched = (publishedPosts ?? []).flatMap(p => {
    const li   = Array.isArray(p.linkedin_post) ? p.linkedin_post[0] : p.linkedin_post
    if (!li) return []
    const perfs   = (li.performance_data ?? []) as PerfRow[]
    const manual  = perfs.filter(x => x.source === 'manual').sort((a,b) => new Date(b.fetched_at).getTime() - new Date(a.fetched_at).getTime())[0]
    const api     = perfs.filter(x => x.source === 'api').sort((a,b)   => new Date(b.fetched_at).getTime() - new Date(a.fetched_at).getTime())[0]

    const impressions = manual?.impressions ?? 0
    const likes       = api?.likes    ?? 0
    const comments    = api?.comments ?? 0
    const reposts     = api?.reposts  ?? 0
    const er          = impressions > 0 ? ((likes + comments + reposts) / impressions) * 100 : 0

    return [{
      pillar:             p.pillar,
      format:             p.format,
      day:                p.day,
      narrative_position: p.narrative_position ?? 'chapter_deepening',
      week_theme:         (Array.isArray(p.week) ? p.week[0] : p.week)?.theme ?? '',
      impressions,
      likes,
      comments,
      reposts,
      dm_note:            manual?.dm_note ?? api?.dm_note ?? null,
      engagement_rate:    er,
      published_at:       li.published_at,
    }]
  })

  const postsWithData = enriched.filter(p => p.impressions > 0 || p.likes > 0)
  if (postsWithData.length < 4) {
    return NextResponse.json({ error: 'Need at least 4 posts with performance data to generate insights' }, { status: 422 })
  }

  // Aggregate by pillar / format / day
  function aggregateBy<T extends string>(key: keyof typeof enriched[0], posts: typeof enriched): Array<{ [k: string]: string | number; avgEngagementRate: number; totalLikes: number; totalComments: number; count: number }> {
    const map = new Map<string, { totalER: number; totalLikes: number; totalComments: number; count: number }>()
    for (const p of posts) {
      const k = String(p[key])
      const cur = map.get(k) ?? { totalER: 0, totalLikes: 0, totalComments: 0, count: 0 }
      cur.totalER      += p.engagement_rate
      cur.totalLikes   += p.likes
      cur.totalComments+= p.comments
      cur.count        += 1
      map.set(k, cur)
    }
    return Array.from(map.entries()).map(([k, v]) => ({
      [key as string]:     k,
      avgEngagementRate:   v.count > 0 ? v.totalER / v.count : 0,
      totalLikes:          v.totalLikes,
      totalComments:       v.totalComments,
      count:               v.count,
    })).sort((a,b) => (b.avgEngagementRate as number) - (a.avgEngagementRate as number))
  }
  void (aggregateBy as unknown as (k: string) => unknown)  // suppress unused generic warning

  const byPillar = (() => {
    const map = new Map<string, { totalER: number; totalLikes: number; totalComments: number; count: number }>()
    for (const p of postsWithData) {
      const cur = map.get(p.pillar) ?? { totalER: 0, totalLikes: 0, totalComments: 0, count: 0 }
      cur.totalER += p.engagement_rate; cur.totalLikes += p.likes; cur.totalComments += p.comments; cur.count += 1
      map.set(p.pillar, cur)
    }
    return Array.from(map.entries()).map(([pillar, v]) => ({ pillar, avgEngagementRate: v.count > 0 ? v.totalER / v.count : 0, totalLikes: v.totalLikes, totalComments: v.totalComments, count: v.count })).sort((a,b) => b.avgEngagementRate - a.avgEngagementRate)
  })()

  const byFormat = (() => {
    const map = new Map<string, { totalER: number; totalLikes: number; totalComments: number; count: number }>()
    for (const p of postsWithData) {
      const cur = map.get(p.format) ?? { totalER: 0, totalLikes: 0, totalComments: 0, count: 0 }
      cur.totalER += p.engagement_rate; cur.totalLikes += p.likes; cur.totalComments += p.comments; cur.count += 1
      map.set(p.format, cur)
    }
    return Array.from(map.entries()).map(([format, v]) => ({ format, avgEngagementRate: v.count > 0 ? v.totalER / v.count : 0, totalLikes: v.totalLikes, totalComments: v.totalComments, count: v.count })).sort((a,b) => b.avgEngagementRate - a.avgEngagementRate)
  })()

  const byDay = (() => {
    const map = new Map<string, { totalER: number; totalLikes: number; totalComments: number; count: number }>()
    for (const p of postsWithData) {
      const cur = map.get(p.day) ?? { totalER: 0, totalLikes: 0, totalComments: 0, count: 0 }
      cur.totalER += p.engagement_rate; cur.totalLikes += p.likes; cur.totalComments += p.comments; cur.count += 1
      map.set(p.day, cur)
    }
    return Array.from(map.entries()).map(([day, v]) => ({ day, avgEngagementRate: v.count > 0 ? v.totalER / v.count : 0, totalLikes: v.totalLikes, totalComments: v.totalComments, count: v.count })).sort((a,b) => b.avgEngagementRate - a.avgEngagementRate)
  })()

  const prompt = buildPerformanceInsightPrompt({ posts: postsWithData, byPillar, byFormat, byDay })

  const message = await getAnthropicClient().messages.create({
    model:      MODEL,
    max_tokens: 1024,
    messages:   [{ role: 'user', content: prompt }],
  })

  const rawText = message.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  // Parse JSON — strip markdown fences if present
  let insights: unknown[]
  try {
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    insights = JSON.parse(cleaned)
    if (!Array.isArray(insights)) throw new Error('Not an array')
  } catch {
    return NextResponse.json({ error: 'AI returned invalid JSON', raw: rawText }, { status: 500 })
  }

  const periodStart = postsWithData.length > 0
    ? postsWithData.reduce((min, p) => p.published_at < min ? p.published_at : min, postsWithData[0].published_at).slice(0, 10)
    : null
  const periodEnd = postsWithData.length > 0
    ? postsWithData.reduce((max, p) => p.published_at > max ? p.published_at : max, postsWithData[0].published_at).slice(0, 10)
    : null

  const { data: saved, error: saveError } = await supabase
    .from('performance_insights')
    .insert({
      insight_type:  'weekly_digest',
      insights,
      data_summary:  { byPillar, byFormat, byDay },
      post_count:    postsWithData.length,
      period_start:  periodStart,
      period_end:    periodEnd,
    })
    .select()
    .single()

  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 })

  return NextResponse.json({ insight: saved })
}
