import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // ── 1. Published posts with LinkedIn data + latest performance snapshot ──
  const { data: publishedPosts, error: postsError } = await supabase
    .from('posts')
    .select(`
      id, day, pillar, approved_at,
      week:weeks ( theme, week_number, year ),
      linkedin_post:linkedin_posts (
        id,
        linkedin_url,
        published_at,
        performance_data (
          impressions, likes, comments, shares, clicks, fetched_at
        )
      )
    `)
    .eq('status', 'published')
    .order('approved_at', { ascending: false })

  if (postsError) return NextResponse.json({ error: postsError.message }, { status: 500 })

  // ── 2. For each published post, pick the LATEST performance snapshot ──
  type PostWithPerf = {
    id: string; day: string; pillar: string; approved_at: string | null
    week: { theme: string | null; week_number: number; year: number } | null
    impressions: number; likes: number; comments: number; shares: number; clicks: number
    linkedin_url: string | null; published_at: string | null
  }

  const enriched: PostWithPerf[] = (publishedPosts ?? []).map(p => {
    const li = Array.isArray(p.linkedin_post) ? p.linkedin_post[0] : p.linkedin_post
    const perfs: Array<{ impressions:number; likes:number; comments:number; shares:number; clicks:number; fetched_at:string }> =
      li?.performance_data ?? []
    // Latest snapshot
    const latest = perfs.sort((a, b) =>
      new Date(b.fetched_at).getTime() - new Date(a.fetched_at).getTime()
    )[0]

    return {
      id:           p.id,
      day:          p.day,
      pillar:       p.pillar,
      approved_at:  p.approved_at,
      week:         Array.isArray(p.week) ? p.week[0] : (p.week ?? null),
      impressions:  latest?.impressions ?? 0,
      likes:        latest?.likes       ?? 0,
      comments:     latest?.comments    ?? 0,
      shares:       latest?.shares      ?? 0,
      clicks:       latest?.clicks      ?? 0,
      linkedin_url: li?.linkedin_url    ?? null,
      published_at: li?.published_at    ?? null,
    }
  })

  // ── 3. Totals ──
  const totals = enriched.reduce(
    (acc, p) => ({
      impressions: acc.impressions + p.impressions,
      likes:       acc.likes       + p.likes,
      comments:    acc.comments    + p.comments,
      shares:      acc.shares      + p.shares,
      clicks:      acc.clicks      + p.clicks,
    }),
    { impressions: 0, likes: 0, comments: 0, shares: 0, clicks: 0 }
  )

  // ── 4. Trends: compare last 30 days vs prior 30 days ──
  const now    = new Date()
  const d30    = new Date(now.getTime() - 30 * 86400000)
  const d60    = new Date(now.getTime() - 60 * 86400000)

  const last30  = enriched.filter(p => p.published_at && new Date(p.published_at) >= d30)
  const prior30 = enriched.filter(p => p.published_at && new Date(p.published_at) >= d60 && new Date(p.published_at) < d30)

  function sumMetric(arr: PostWithPerf[], key: keyof Pick<PostWithPerf,'impressions'|'likes'|'comments'|'shares'>) {
    return arr.reduce((a, p) => a + (p[key] as number), 0)
  }
  function trendPct(curr: number, prev: number) {
    if (prev === 0) return curr > 0 ? 100 : 0
    return Math.round(((curr - prev) / prev) * 100)
  }

  const trend = {
    impressions: trendPct(sumMetric(last30,'impressions'), sumMetric(prior30,'impressions')),
    likes:       trendPct(sumMetric(last30,'likes'),       sumMetric(prior30,'likes')),
    comments:    trendPct(sumMetric(last30,'comments'),    sumMetric(prior30,'comments')),
    shares:      trendPct(sumMetric(last30,'shares'),      sumMetric(prior30,'shares')),
  }

  // ── 5. By pillar ──
  const PILLARS = ['vedic_leadership','banker_coach','coaching_transformation','financial_intelligence','inner_work']
  const byPillar = PILLARS.map(pillar => {
    const posts = enriched.filter(p => p.pillar === pillar)
    return {
      pillar,
      posts:       posts.length,
      impressions: posts.reduce((a,p) => a + p.impressions, 0),
      likes:       posts.reduce((a,p) => a + p.likes, 0),
      comments:    posts.reduce((a,p) => a + p.comments, 0),
      shares:      posts.reduce((a,p) => a + p.shares, 0),
    }
  }).filter(r => r.posts > 0)

  // ── 6. Recent posts (last 10) ──
  const recentPosts = enriched.slice(0, 10).map(p => ({
    id:           p.id,
    day:          p.day,
    pillar:       p.pillar,
    theme:        p.week?.theme ?? '—',
    impressions:  p.impressions,
    likes:        p.likes,
    comments:     p.comments,
    shares:       p.shares,
    linkedin_url: p.linkedin_url,
    published_at: p.published_at,
  }))

  // ── 7. Has LinkedIn data at all? ──
  const hasLinkedInData = enriched.some(p => p.impressions > 0)

  return NextResponse.json({
    hasLinkedInData,
    totalPublished: enriched.length,
    totals,
    trend,
    byPillar,
    recentPosts,
  })
}
