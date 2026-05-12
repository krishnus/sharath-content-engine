import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Runs daily at 6 AM UTC. Fetches LinkedIn analytics for all
// published posts and writes a new performance_data row for each.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Fetch all linkedin_posts published in last 90 days
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 90)

  const { data: liPosts, error } = await supabase
    .from('linkedin_posts')
    .select('id, linkedin_post_id, linkedin_url')
    .gte('published_at', cutoff.toISOString())
    .limit(50)

  if (error || !liPosts?.length) {
    return NextResponse.json({ fetched: 0 })
  }

  // TODO: Retrieve stored LinkedIn access token from settings table
  // For now, log a placeholder — full implementation requires Phase 3 settings screen
  // where Sharath stores the LinkedIn token that the service role can use.
  const accessToken = process.env.LINKEDIN_SERVICE_TOKEN ?? null

  if (!accessToken) {
    console.warn('[cron/analytics] No LINKEDIN_SERVICE_TOKEN configured — skipping analytics poll')
    return NextResponse.json({ fetched: 0, message: 'LinkedIn token not configured for service-level access' })
  }

  const results = await Promise.allSettled(
    liPosts.map(lp => fetchAndStoreAnalytics(lp, accessToken, supabase))
  )

  const fetched = results.filter(r => r.status === 'fulfilled').length
  console.log(`[cron/analytics] Fetched analytics for ${fetched}/${liPosts.length} posts`)

  return NextResponse.json({ fetched })
}


async function fetchAndStoreAnalytics(
  liPost: { id: string; linkedin_post_id: string },
  accessToken: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<void> {
  const res = await fetch(
    `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(liPost.linkedin_post_id)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!res.ok) throw new Error(`LinkedIn analytics error: ${res.status}`)

  const data = await res.json()

  await supabase.from('performance_data').insert({
    linkedin_post_id: liPost.id,
    impressions: data.impressionCount ?? 0,
    likes:       data.likeCount       ?? 0,
    comments:    data.commentCount    ?? 0,
    shares:      data.shareCount      ?? 0,
    clicks:      data.clickCount      ?? 0,
    fetched_at:  new Date().toISOString(),
  })
}
