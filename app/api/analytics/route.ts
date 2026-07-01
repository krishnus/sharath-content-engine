import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // ── 1. Published posts with LinkedIn data + all performance snapshots ──
  const { data: publishedPosts, error: postsError } = await supabase
    .from('posts')
    .select(`
      id, day, pillar, format, approved_at,
      week:weeks ( theme, week_number, year ),
      linkedin_post:linkedin_posts (
        id,
        linkedin_url,
        published_at,
        performance_data (
          source, impressions, likes, comments, shares, reposts, clicks, dm_note, fetched_at
        )
      )
    `)
    .eq('status', 'published')
    .order('approved_at', { ascending: false })

  if (postsError) return NextResponse.json({ error: postsError.message }, { status: 500 })

  // ── 2. Enrich each post — merge manual impressions + API engagement ──
  type PerfRow = {
    source: string; impressions: number; likes: number; comments: number
    shares: number; reposts: number; clicks: number; dm_note: string | null; fetched_at: string
  }

  type EnrichedPost = {
    id: string; day: string; pillar: string; format: string; approved_at: string | null
    week: { theme: string | null; week_number: number; year: number } | null
    impressions: number; likes: number; comments: number; shares: number; reposts: number; clicks: number
    engagement_rate: number; dm_note: string | null
    linkedin_url: string | null; published_at: string | null; has_manual_entry: boolean
  }

  const enriched: EnrichedPost[] = (publishedPosts ?? []).map(p => {
    const li    = Array.isArray(p.linkedin_post) ? p.linkedin_post[0] : p.linkedin_post
    const perfs = (li?.performance_data ?? []) as PerfRow[]

    const manual = perfs.filter(x => x.source === 'manual').sort((a,b) => new Date(b.fetched_at).getTime() - new Date(a.fetched_at).getTime())[0]
    const api    = perfs.filter(x => x.source === 'api').sort((a,b)   => new Date(b.fetched_at).getTime() - new Date(a.fetched_at).getTime())[0]

    // Impressions from manual check-in (API can't get personal profile impressions)
    const impressions = manual?.impressions ?? 0
    const likes       = api?.likes    ?? 0
    const comments    = api?.comments ?? 0
    const reposts     = api?.reposts  ?? 0
    const shares      = api?.shares   ?? 0
    const clicks      = api?.clicks   ?? 0
    const engagementRate = impressions > 0 ? ((likes + comments + reposts) / impressions) * 100 : 0

    return {
      id:              p.id,
      day:             p.day,
      pillar:          p.pillar,
      format:          p.format,
      approved_at:     p.approved_at,
      week:            Array.isArray(p.week) ? p.week[0] : (p.week ?? null),
      impressions,
      likes,
      comments,
      shares,
      reposts,
      clicks,
      engagement_rate: engagementRate,
      dm_note:         manual?.dm_note ?? null,
      linkedin_url:    li?.linkedin_url    ?? null,
      published_at:    li?.published_at    ?? null,
      has_manual_entry: !!manual,
    }
  })

  // ── 3. Totals ──
  const totals = enriched.reduce(
    (acc, p) => ({
      impressions: acc.impressions + p.impressions,
      likes:       acc.likes       + p.likes,
      comments:    acc.comments    + p.comments,
      shares:      acc.shares      + p.shares,
      reposts:     acc.reposts     + p.reposts,
    }),
    { impressions: 0, likes: 0, comments: 0, shares: 0, reposts: 0 }
  )

  const postsWithER = enriched.filter(p => p.engagement_rate > 0)
  const avgEngagementRate = postsWithER.length > 0
    ? postsWithER.reduce((a, p) => a + p.engagement_rate, 0) / postsWithER.length
    : 0

  // ── 4. Trends: compare last 30 days vs prior 30 days ──
  const now  = new Date()
  const d30  = new Date(now.getTime() - 30 * 86400000)
  const d60  = new Date(now.getTime() - 60 * 86400000)

  const last30  = enriched.filter(p => p.published_at && new Date(p.published_at) >= d30)
  const prior30 = enriched.filter(p => p.published_at && new Date(p.published_at) >= d60 && new Date(p.published_at) < d30)

  function sumMetric(arr: EnrichedPost[], key: keyof Pick<EnrichedPost, 'impressions' | 'likes' | 'comments' | 'shares' | 'reposts'>) {
    return arr.reduce((a, p) => a + (p[key] as number), 0)
  }
  function trendPct(curr: number, prev: number) {
    if (prev === 0) return curr > 0 ? 100 : 0
    return Math.round(((curr - prev) / prev) * 100)
  }
  function avgER(arr: EnrichedPost[]) {
    const withER = arr.filter(p => p.engagement_rate > 0)
    return withER.length > 0 ? withER.reduce((a, p) => a + p.engagement_rate, 0) / withER.length : 0
  }

  const trend = {
    impressions:     trendPct(sumMetric(last30, 'impressions'), sumMetric(prior30, 'impressions')),
    likes:           trendPct(sumMetric(last30, 'likes'),       sumMetric(prior30, 'likes')),
    comments:        trendPct(sumMetric(last30, 'comments'),    sumMetric(prior30, 'comments')),
    shares:          trendPct(sumMetric(last30, 'shares'),      sumMetric(prior30, 'shares')),
    engagement_rate: trendPct(avgER(last30),                    avgER(prior30)),
  }

  // ── 5. By pillar ──
  const PILLARS = ['vedic_leadership', 'banker_coach', 'coaching_transformation', 'financial_intelligence', 'inner_work']
  const byPillar = PILLARS.map(pillar => {
    const posts   = enriched.filter(p => p.pillar === pillar)
    const withER  = posts.filter(p => p.engagement_rate > 0)
    return {
      pillar,
      posts:              posts.length,
      impressions:        posts.reduce((a,p) => a + p.impressions, 0),
      likes:              posts.reduce((a,p) => a + p.likes,       0),
      comments:           posts.reduce((a,p) => a + p.comments,    0),
      shares:             posts.reduce((a,p) => a + p.shares,      0),
      avg_engagement_rate: withER.length > 0 ? withER.reduce((a,p) => a + p.engagement_rate, 0) / withER.length : 0,
    }
  }).filter(r => r.posts > 0)

  // ── 6. By format ──
  const FORMATS = ['long_form_article', 'text_post', 'carousel', 'market_insights']
  const byFormat = FORMATS.map(format => {
    const posts  = enriched.filter(p => p.format === format)
    const withER = posts.filter(p => p.engagement_rate > 0)
    return {
      format,
      posts:               posts.length,
      impressions:         posts.reduce((a,p) => a + p.impressions, 0),
      likes:               posts.reduce((a,p) => a + p.likes,       0),
      comments:            posts.reduce((a,p) => a + p.comments,    0),
      avg_engagement_rate: withER.length > 0 ? withER.reduce((a,p) => a + p.engagement_rate, 0) / withER.length : 0,
    }
  }).filter(r => r.posts > 0)

  // ── 7. Recent posts (last 10) ──
  const recentPosts = enriched.slice(0, 10).map(p => ({
    id:              p.id,
    day:             p.day,
    pillar:          p.pillar,
    format:          p.format,
    theme:           p.week?.theme ?? '—',
    impressions:     p.impressions,
    likes:           p.likes,
    comments:        p.comments,
    reposts:         p.reposts,
    engagement_rate: p.engagement_rate,
    dm_note:         p.dm_note,
    has_manual_entry: p.has_manual_entry,
    linkedin_url:    p.linkedin_url,
    published_at:    p.published_at,
  }))

  // ── 8. Posts needing check-in (published in last 14d, no manual impressions yet) ──
  const d14 = new Date(now.getTime() - 14 * 86400000)
  const postsNeedingCheckin = enriched.filter(p =>
    p.published_at && new Date(p.published_at) >= d14 && !p.has_manual_entry
  ).length

  // ── 9. Latest AI-generated insights ──
  const { data: latestInsight } = await supabase
    .from('performance_insights')
    .select('id, generated_at, insights, post_count, period_start, period_end')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const hasLinkedInData = enriched.some(p => p.likes > 0 || p.impressions > 0)

  return NextResponse.json({
    hasLinkedInData,
    totalPublished:      enriched.length,
    postsNeedingCheckin,
    totals,
    avgEngagementRate,
    trend,
    byPillar,
    byFormat,
    recentPosts,
    latestInsight:       latestInsight ?? null,
  })
}
